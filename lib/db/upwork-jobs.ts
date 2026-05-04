import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  UpworkJob,
  UpworkJobStatus,
} from '@/lib/types'

/** Typed Supabase queries for upwork_jobs. No business logic. */

export async function listForTeam(
  teamId: string,
  opts: { status?: UpworkJobStatus | 'any'; limit?: number } = {}
): Promise<UpworkJob[]> {
  let q = supabaseAdmin
    .from('upwork_jobs')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status && opts.status !== 'any') q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new Error(`db.upwork.jobs.listForTeam: ${error.message}`)
  return (data as UpworkJob[]) ?? []
}

export async function getById(jobId: string): Promise<UpworkJob | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.jobs.getById: ${error.message}`)
  return (data as UpworkJob | null) ?? null
}

/** Look up an existing job by its (team, external upwork id). Used for dedup. */
export async function findByUpworkId(
  teamId: string,
  upworkJobId: string
): Promise<UpworkJob | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_jobs')
    .select('*')
    .eq('team_id', teamId)
    .eq('upwork_job_id', upworkJobId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.jobs.findByUpworkId: ${error.message}`)
  return (data as UpworkJob | null) ?? null
}

export async function insert(input: Omit<UpworkJob, 'id' | 'created_at'>): Promise<UpworkJob> {
  const { data, error } = await supabaseAdmin
    .from('upwork_jobs')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) throw new Error(`db.upwork.jobs.insert: ${error?.message ?? 'no row'}`)
  return data as UpworkJob
}

export async function update(
  jobId: string,
  patch: Partial<Omit<UpworkJob, 'id' | 'team_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin.from('upwork_jobs').update(patch).eq('id', jobId)
  if (error) throw new Error(`db.upwork.jobs.update: ${error.message}`)
}

export async function remove(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('upwork_jobs').delete().eq('id', jobId)
  if (error) throw new Error(`db.upwork.jobs.remove: ${error.message}`)
}
