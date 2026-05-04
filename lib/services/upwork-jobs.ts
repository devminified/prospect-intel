import * as dbJobs from '@/lib/db/upwork-jobs'
import {
  UpworkJobCreateInputSchema,
  UpworkJobStatusSchema,
  UpworkJobUpdateInputSchema,
} from '@/lib/types'
import type { UpworkJob, UpworkJobStatus } from '@/lib/types'
import { ConflictError, NotFoundError, ValidationError } from './errors'
import { requireUpworkAccess } from './access'

/**
 * Upwork jobs service. Jobs are team-scoped — every member with any
 * Upwork access can list + save them, since the dedup is at the team
 * boundary (we don't want two profiles unknowingly bidding the same
 * post). Per-profile RBAC kicks in when a profile actually bids.
 */

/**
 * Extracts Upwork's external job id from a job URL.
 *
 * Modern Upwork job URLs look like:
 *   https://www.upwork.com/jobs/Senior-Engineer_~021234567890123456789
 *   https://www.upwork.com/freelance-jobs/apply/Foo_~01abcdef…
 * The id is the bit after the last `~` (sometimes `_~`), trimmed of
 * any trailing query/fragment.
 *
 * Returns null when we can't parse a recognizable id — the row still
 * gets saved (we want to record the URL even if Upwork changed their
 * pattern), the dedup just won't catch this one.
 */
export function parseUpworkJobId(rawUrl: string): string | null {
  if (!rawUrl) return null
  try {
    const url = new URL(rawUrl)
    if (!/upwork\.com$/i.test(url.hostname)) return null
    const path = url.pathname
    const match = path.match(/~([a-z0-9]+)$/i) || path.match(/_~([a-z0-9]+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export async function listJobs(
  userId: string,
  opts: { status?: string | null } = {}
): Promise<UpworkJob[]> {
  const { teamId } = await requireUpworkAccess(userId)
  let status: UpworkJobStatus | 'any' = 'any'
  if (opts.status && opts.status !== 'any') {
    const parsed = UpworkJobStatusSchema.safeParse(opts.status)
    if (parsed.success) status = parsed.data
    // unknown status filter just falls through to 'any' — tolerant
  }
  return dbJobs.listForTeam(teamId, { status })
}

export async function getJob(userId: string, jobId: string): Promise<UpworkJob> {
  const { teamId } = await requireUpworkAccess(userId)
  const job = await dbJobs.getById(jobId)
  if (!job || job.team_id !== teamId) throw new NotFoundError('Job not found')
  return job
}

export async function createJob(userId: string, raw: unknown): Promise<UpworkJob> {
  const { teamId } = await requireUpworkAccess(userId)
  const parsed = UpworkJobCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const upworkJobId = parseUpworkJobId(parsed.data.url)
  if (upworkJobId) {
    const existing = await dbJobs.findByUpworkId(teamId, upworkJobId)
    if (existing) {
      throw new ConflictError(
        `This job is already saved (id ${upworkJobId}). Use the existing record instead of creating a duplicate.`
      )
    }
  }

  return dbJobs.insert({
    team_id: teamId,
    upwork_job_id: upworkJobId,
    url: parsed.data.url,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    posted_at: parsed.data.posted_at ?? null,
    budget_type: parsed.data.budget_type,
    budget_min_usd: parsed.data.budget_min_usd ?? null,
    budget_max_usd: parsed.data.budget_max_usd ?? null,
    hourly_min_usd: parsed.data.hourly_min_usd ?? null,
    hourly_max_usd: parsed.data.hourly_max_usd ?? null,
    est_duration: parsed.data.est_duration ?? null,
    hours_per_week: parsed.data.hours_per_week ?? null,
    experience_level: parsed.data.experience_level ?? null,
    category: parsed.data.category ?? null,
    skills: parsed.data.skills ?? [],
    country: parsed.data.country ?? null,
    client_id: null,
    status: 'open',
    saved_by_user_id: userId,
    notes: parsed.data.notes ?? null,
    last_seen_at: new Date().toISOString(),
  })
}

export async function updateJob(userId: string, jobId: string, raw: unknown): Promise<void> {
  await getJob(userId, jobId) // gates access + 404
  const parsed = UpworkJobUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) patch[k] = v
  }
  if (Object.keys(patch).length === 0) return
  await dbJobs.update(jobId, patch)
}

/**
 * Mark a job 'dead' (we lost interest) or 'hired_other' (Upwork shows
 * client hired someone else). Soft-delete; the row stays for analytics.
 */
export async function setJobStatus(
  userId: string,
  jobId: string,
  status: UpworkJobStatus
): Promise<void> {
  await getJob(userId, jobId)
  await dbJobs.update(jobId, { status })
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  await getJob(userId, jobId)
  await dbJobs.remove(jobId)
}
