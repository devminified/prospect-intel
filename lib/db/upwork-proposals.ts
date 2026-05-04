import { supabaseAdmin } from '@/lib/supabase/server'
import type { UpworkProposal, UpworkProposalStatus } from '@/lib/types'

/** Typed Supabase queries for upwork_proposals. No business logic. */

export async function listForProfile(
  profileId: string,
  opts: { status?: UpworkProposalStatus | 'any'; limit?: number } = {}
): Promise<UpworkProposal[]> {
  let q = supabaseAdmin
    .from('upwork_proposals')
    .select('*')
    .eq('profile_id', profileId)
    .order('status_changed_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status && opts.status !== 'any') q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new Error(`db.upwork.proposals.listForProfile: ${error.message}`)
  return (data as UpworkProposal[]) ?? []
}

export async function listForJob(jobId: string): Promise<UpworkProposal[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_proposals')
    .select('*')
    .eq('job_id', jobId)
    .order('status_changed_at', { ascending: false })
  if (error) throw new Error(`db.upwork.proposals.listForJob: ${error.message}`)
  return (data as UpworkProposal[]) ?? []
}

export async function getById(proposalId: string): Promise<UpworkProposal | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.proposals.getById: ${error.message}`)
  return (data as UpworkProposal | null) ?? null
}

export async function findExisting(
  profileId: string,
  jobId: string
): Promise<UpworkProposal | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_proposals')
    .select('*')
    .eq('profile_id', profileId)
    .eq('job_id', jobId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.proposals.findExisting: ${error.message}`)
  return (data as UpworkProposal | null) ?? null
}

export async function insert(input: {
  profile_id: string
  job_id: string
  bidder_user_id: string
  cover_letter: string | null
  bid_type: 'fixed' | 'hourly'
  bid_amount_usd: number | null
  proposed_milestones_json: unknown
  connects_spent: number
  status: UpworkProposalStatus
  notes: string | null
  sent_at: string | null
}): Promise<UpworkProposal> {
  const { data, error } = await supabaseAdmin
    .from('upwork_proposals')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.proposals.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkProposal
}

export async function update(
  proposalId: string,
  patch: Partial<Omit<UpworkProposal, 'id' | 'profile_id' | 'job_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_proposals')
    .update(patch)
    .eq('id', proposalId)
  if (error) throw new Error(`db.upwork.proposals.update: ${error.message}`)
}
