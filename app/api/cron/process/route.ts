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

  const { error } = await supabaseAdmin.from('jobs').insert({
    batch_id: job.batch_id,
    prospect_id: job.prospect_id,
    job_type: next,
    status: 'pending',
    attempts: 0,
  })
  if (error) console.error(`Failed to enqueue ${next} job:`, error.message)
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
