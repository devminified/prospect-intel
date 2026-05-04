import { z } from 'zod'

/**
 * Pipeline job row from the `jobs` table — the only "queue" in the
 * system per CLAUDE.md § 0 #1. The cron at `/api/cron/process` claims a
 * batch of these every 2 minutes and dispatches each to the matching
 * `lib/pipeline/*` stage.
 */

export const JobTypeSchema = z.enum([
  'enrich',
  'analyze',
  'audit_visibility',
  'pitch',
  'discover_contacts',
])
export type JobType = z.infer<typeof JobTypeSchema>

export const JobStatusSchema = z.enum(['pending', 'running', 'done', 'failed'])
export type JobStatus = z.infer<typeof JobStatusSchema>

export const JobSchema = z.object({
  id: z.string().uuid(),
  batch_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  job_type: JobTypeSchema,
  status: JobStatusSchema,
  attempts: z.number().int(),
  last_error: z.string().nullable(),
})
export type Job = z.infer<typeof JobSchema>
