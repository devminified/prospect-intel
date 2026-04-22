import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { enrichProspect } from '@/lib/enrich'
import { analyzeProspect } from '@/lib/analyze'
import { findContacts } from '@/lib/contacts'
import { generatePitch } from '@/lib/pitch'

export const maxDuration = 60

const JOBS_PER_RUN = 10
const MAX_ATTEMPTS = 3

type JobType = 'enrich' | 'analyze' | 'find_contacts' | 'pitch'
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
    case 'find_contacts':
      return findContacts(job.prospect_id)
    case 'pitch':
      return generatePitch(job.prospect_id)
    default:
      throw new Error(`unknown job_type: ${job.job_type}`)
  }
}

async function enqueueNext(job: Job): Promise<void> {
  const next: JobType | null =
    job.job_type === 'enrich' ? 'analyze'
    : job.job_type === 'analyze' ? 'find_contacts'
    : job.job_type === 'find_contacts' ? 'pitch'
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
    .select('status')
    .eq('batch_id', batchId)

  if (jobsError || !jobs) return

  const anyUnfinished = jobs.some((j: { status: string }) => j.status === 'pending' || j.status === 'running')
  if (anyUnfinished) return

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
