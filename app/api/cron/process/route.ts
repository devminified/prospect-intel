import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { enrichProspect } from '@/lib/enrich'
import { analyzeProspect } from '@/lib/analyze'
import { discoverPeople } from '@/lib/contacts'
import { auditVisibility } from '@/lib/audit'
import { generatePitch } from '@/lib/pitch'

export const maxDuration = 60

const JOBS_PER_RUN = 10
const MAX_ATTEMPTS = 3
const STUCK_JOB_THRESHOLD_MS = 2 * 60 * 1000  // reap running jobs older than 2 min

type JobType = 'enrich' | 'analyze' | 'audit_visibility' | 'pitch' | 'discover_contacts'
type JobStatus = 'pending' | 'running' | 'done' | 'failed'

interface Job {
  id: string
  batch_id: string
  prospect_id: string
  job_type: JobType
  status: JobStatus
  attempts: number
  last_error: string | null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reaped = await reapStuckJobs()
    const claimed = await claimPendingJobs(JOBS_PER_RUN)

    let successCount = 0
    let failedCount = 0
    let requeuedCount = 0
    const touchedBatches = new Set<string>()

    for (const job of claimed) {
      touchedBatches.add(job.batch_id)
      try {
        await dispatch(job)
        await markJobDone(job.id)
        await enqueueNext(job)
        successCount++
      } catch (error: any) {
        const message = error?.message ?? String(error)
        const nextAttempts = job.attempts + 1
        if (nextAttempts >= MAX_ATTEMPTS) {
          await markJobFailed(job.id, nextAttempts, message)
          failedCount++
        } else {
          await markJobPending(job.id, nextAttempts, message)
          requeuedCount++
        }
      }
    }

    for (const batchId of touchedBatches) {
      await settleBatch(batchId)
    }

    return NextResponse.json({
      reaped,
      claimed: claimed.length,
      success: successCount,
      requeued: requeuedCount,
      failed: failedCount,
    })
  } catch (error: any) {
    console.error('Cron processor error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    )
  }
}

/**
 * Reset any job stuck in 'running' for longer than STUCK_JOB_THRESHOLD_MS
 * back to 'pending' so the next claim picks it up. Covers the Vercel
 * FUNCTION_INVOCATION_TIMEOUT case where a prior cron run claimed jobs but
 * died mid-dispatch without transitioning them to done/pending/failed.
 */
async function reapStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .lt('processed_at', cutoff)
    .select('id')
  if (error) {
    console.error('reapStuckJobs failed:', error.message)
    return 0
  }
  return data?.length ?? 0
}

async function claimPendingJobs(limit: number): Promise<Job[]> {
  const { data: candidates, error: selectError } = await supabaseAdmin
    .from('jobs')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (selectError) throw new Error(`claim select failed: ${selectError.message}`)
  if (!candidates || candidates.length === 0) return []

  const ids = candidates.map((c: { id: string }) => c.id)

  const { data: claimed, error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'running', processed_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id, batch_id, prospect_id, job_type, status, attempts, last_error')

  if (updateError) throw new Error(`claim update failed: ${updateError.message}`)
  return (claimed ?? []) as Job[]
}

async function dispatch(job: Job): Promise<void> {
  switch (job.job_type) {
    case 'enrich':
      return enrichProspect(job.prospect_id)
    case 'analyze':
      return analyzeProspect(job.prospect_id)
    case 'audit_visibility':
      return auditVisibility(job.prospect_id)
    case 'pitch':
      return generatePitch(job.prospect_id)
    case 'discover_contacts':
      return discoverPeople(job.prospect_id)
    default:
      throw new Error(`unknown job_type: ${job.job_type}`)
  }
}

async function enqueueNext(job: Job): Promise<void> {
  // Phase 3 auto-chain: enrich → analyze → audit_visibility → pitch.
  // discover_contacts is opt-in via batches.auto_enrich_top_n (see settleBatch)
  // or by explicit user action (POST /api/prospects/[id]/discover-contacts).
  // It never auto-chains from the main pipeline.
  const next: JobType | null =
    job.job_type === 'enrich' ? 'analyze'
    : job.job_type === 'analyze' ? 'audit_visibility'
    : job.job_type === 'audit_visibility' ? 'pitch'
    : null

  if (!next) return

  // Phase 3 (M18): optional pitch gate. When a batch was created with
  // pitch_score_threshold set, skip enqueueing the pitch job for prospects
  // whose opportunity_score is below that threshold. Saves Sonnet cost on
  // leads the user wouldn't send a personalized email to anyway.
  if (next === 'pitch') {
    const { data: batch } = await supabaseAdmin
      .from('batches')
      .select('user_id, pitch_score_threshold')
      .eq('id', job.batch_id)
      .single()
    const threshold = (batch as any)?.pitch_score_threshold
    if (threshold != null) {
      const { data: analysis } = await supabaseAdmin
        .from('analyses')
        .select('opportunity_score')
        .eq('prospect_id', job.prospect_id)
        .single()
      const score = (analysis as any)?.opportunity_score ?? 0
      if (score < threshold) {
        return // below threshold — skip the pitch for this prospect
      }
    }

    // M27 (hygiene): optional ICP social requirements gate. If the user's ICP
    // requires LinkedIn / Instagram / Facebook / business phone, check the
    // visibility audit + contacts + prospect row. Anything missing → mark
    // prospect filtered_out with a human-readable reason, skip the pitch.
    const userId = (batch as any)?.user_id
    if (userId) {
      const filterReason = await checkSocialIcpGate(userId, job.prospect_id)
      if (filterReason) {
        await supabaseAdmin
          .from('prospects')
          .update({ status: 'filtered_out', filter_reason: filterReason })
          .eq('id', job.prospect_id)
        return
      }
    }
  }

  const { error } = await supabaseAdmin.from('jobs').insert({
    batch_id: job.batch_id,
    prospect_id: job.prospect_id,
    job_type: next,
    status: 'pending',
    attempts: 0,
  })
  if (error) console.error(`Failed to enqueue ${next} job:`, error.message)
}

/**
 * Check the user's ICP social requirements against the prospect's audit +
 * contacts + row. Returns a reason string if the prospect should be filtered
 * out, or null if all requirements pass.
 *
 * LinkedIn: business-level OR any contact with linkedin_url satisfies.
 * Instagram/Facebook: business-level only (from visibility_audits.social_links_json).
 * Business phone: prospects.phone (from Google Places) must be non-null.
 */
async function checkSocialIcpGate(userId: string, prospectId: string): Promise<string | null> {
  const { data: icp } = await supabaseAdmin
    .from('icp_profile')
    .select('require_linkedin, require_instagram, require_facebook, require_business_phone, require_reachable')
    .eq('user_id', userId)
    .maybeSingle()
  if (!icp) return null

  const reqLinkedin = !!(icp as any).require_linkedin
  const reqInstagram = !!(icp as any).require_instagram
  const reqFacebook = !!(icp as any).require_facebook
  const reqPhone = !!(icp as any).require_business_phone
  const reqReachable = !!(icp as any).require_reachable

  if (!reqLinkedin && !reqInstagram && !reqFacebook && !reqPhone && !reqReachable) return null

  const [auditRes, contactsRes, prospectRes] = await Promise.all([
    supabaseAdmin.from('visibility_audits').select('social_links_json').eq('prospect_id', prospectId).maybeSingle(),
    supabaseAdmin.from('contacts').select('email, linkedin_url').eq('prospect_id', prospectId),
    supabaseAdmin.from('prospects').select('phone, email').eq('id', prospectId).maybeSingle(),
  ])

  const socialLinks = ((auditRes.data as any)?.social_links_json ?? {}) as Record<string, string | null>
  const contacts = (contactsRes.data as any[]) ?? []
  const phone = (prospectRes.data as any)?.phone ?? null
  const businessEmail = (prospectRes.data as any)?.email ?? null

  const missing: string[] = []
  if (reqLinkedin) {
    const businessLi = socialLinks.linkedin
    const anyContactLi = contacts.some((c) => c.linkedin_url)
    if (!businessLi && !anyContactLi) missing.push('LinkedIn')
  }
  if (reqInstagram && !socialLinks.instagram) missing.push('Instagram')
  if (reqFacebook && !socialLinks.facebook) missing.push('Facebook')
  if (reqPhone && !phone) missing.push('business phone')

  // Reachability: prospect must have at least one way to be contacted
  if (reqReachable) {
    const anyContactEmail = contacts.some((c) => c.email)
    const reachable = anyContactEmail || !!businessEmail || !!phone
    if (!reachable) missing.push('any contact info (email or phone)')
  }

  if (missing.length === 0) return null
  return `ICP requires ${missing.join(' + ')} — none found`
}

async function markJobDone(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'done' })
    .eq('id', jobId)
  if (error) console.error('markJobDone failed:', error.message)
}

async function markJobPending(jobId: string, attempts: number, message: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'pending', attempts, last_error: message })
    .eq('id', jobId)
  if (error) console.error('markJobPending failed:', error.message)
}

async function markJobFailed(jobId: string, attempts: number, message: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'failed', attempts, last_error: message })
    .eq('id', jobId)
  if (error) console.error('markJobFailed failed:', error.message)
}

async function settleBatch(batchId: string): Promise<void> {
  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('jobs')
    .select('job_type, status')
    .eq('batch_id', batchId)

  if (jobsError || !jobs) return

  const anyUnfinished = jobs.some((j: { status: string }) => j.status === 'pending' || j.status === 'running')
  if (anyUnfinished) return

  // Main pipeline is terminal. Before marking batch done, check if auto-enrich
  // top-N is configured and hasn't been triggered yet. If so, find the top N
  // prospects by analysis.opportunity_score and enqueue discover_contacts
  // jobs for them. The batch stays in 'processing' until those finish too.
  const { data: batch } = await supabaseAdmin
    .from('batches')
    .select('auto_enrich_top_n')
    .eq('id', batchId)
    .single()

  const topN = (batch as any)?.auto_enrich_top_n ?? 0
  const alreadyEnqueued = jobs.some((j: { job_type: string }) => j.job_type === 'discover_contacts')

  if (topN > 0 && !alreadyEnqueued) {
    await enqueueAutoDiscover(batchId, topN)
    return // don't mark done — discover jobs are now pending
  }

  const { count: readyCount } = await supabaseAdmin
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'ready')

  await supabaseAdmin
    .from('batches')
    .update({ status: 'done', count_completed: readyCount ?? 0 })
    .eq('id', batchId)
}

async function enqueueAutoDiscover(batchId: string, topN: number): Promise<void> {
  // Rank prospects in this batch by opportunity_score desc, take top N,
  // enqueue one discover_contacts job per prospect.
  const { data: scored, error } = await supabaseAdmin
    .from('prospects')
    .select('id, analyses(opportunity_score)')
    .eq('batch_id', batchId)
  if (error || !scored) {
    console.error('auto-enrich: prospect lookup failed:', error?.message)
    return
  }

  const ranked = (scored as any[])
    .map((p) => ({ id: p.id as string, score: p.analyses?.opportunity_score ?? -1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)

  if (ranked.length === 0) return

  const rows = ranked.map((p) => ({
    batch_id: batchId,
    prospect_id: p.id,
    job_type: 'discover_contacts' as const,
    status: 'pending' as const,
    attempts: 0,
  }))

  const { error: insertErr } = await supabaseAdmin.from('jobs').insert(rows)
  if (insertErr) console.error('auto-enrich: enqueue failed:', insertErr.message)
}
