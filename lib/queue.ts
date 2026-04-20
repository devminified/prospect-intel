import { supabaseAdmin } from './supabase/server'

export type JobType = 'enrich' | 'analyze' | 'pitch'

export interface Job {
  id: string
  batch_id: string
  prospect_id: string
  job_type: JobType
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  last_error?: string
  created_at: string
  processed_at?: string
}

export async function enqueueJob(
  batchId: string,
  prospectId: string,
  jobType: JobType
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .insert({
      batch_id: batchId,
      prospect_id: prospectId,
      job_type: jobType,
      status: 'pending',
      attempts: 0,
    })

  if (error) {
    throw new Error(`Failed to enqueue job: ${error.message}`)
  }
}

export async function getNextJobs(limit = 10): Promise<Job[]> {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to get next jobs: ${error.message}`)
  }

  return data || []
}

export async function markJobRunning(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ 
      status: 'running',
      processed_at: new Date().toISOString()
    })
    .eq('id', jobId)

  if (error) {
    throw new Error(`Failed to mark job as running: ${error.message}`)
  }
}

export async function markJobDone(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'done' })
    .eq('id', jobId)

  if (error) {
    throw new Error(`Failed to mark job as done: ${error.message}`)
  }
}

export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  maxAttempts = 3
): Promise<void> {
  // First, increment attempts and set error
  const { data: jobData, error: fetchError } = await supabaseAdmin
    .from('jobs')
    .select('attempts')
    .eq('id', jobId)
    .single()

  if (fetchError) {
    throw new Error(`Failed to fetch job: ${fetchError.message}`)
  }

  const newAttempts = jobData.attempts + 1
  const shouldFail = newAttempts >= maxAttempts

  const { error } = await supabaseAdmin
    .from('jobs')
    .update({
      status: shouldFail ? 'failed' : 'pending',
      attempts: newAttempts,
      last_error: errorMessage,
    })
    .eq('id', jobId)

  if (error) {
    throw new Error(`Failed to mark job as failed: ${error.message}`)
  }
}