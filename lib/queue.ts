import { supabaseAdmin } from './supabase/server'
import type { JobType } from './types'

/**
 * Single-purpose helper for inserting a row into the `jobs` table —
 * the only "queue" we have per CLAUDE.md § 0 #1. The cron processor
 * (`/api/cron/process/route.ts`) owns claiming + status transitions
 * directly via supabase.
 */
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
