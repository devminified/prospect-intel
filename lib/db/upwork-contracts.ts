import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  UpworkContract,
  UpworkContractStatus,
  UpworkMilestone,
  UpworkMilestoneStatus,
  UpworkTimeLog,
  UpworkTimeLogStatus,
} from '@/lib/types'

// ─── Contracts ─────────────────────────────────────────────────────

export async function listForProfile(
  profileId: string,
  opts: { status?: UpworkContractStatus | 'any'; limit?: number } = {}
): Promise<UpworkContract[]> {
  let q = supabaseAdmin
    .from('upwork_contracts')
    .select('*')
    .eq('profile_id', profileId)
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status && opts.status !== 'any') q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new Error(`db.upwork.contracts.listForProfile: ${error.message}`)
  return (data as UpworkContract[]) ?? []
}

export async function getById(contractId: string): Promise<UpworkContract | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contracts')
    .select('*')
    .eq('id', contractId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.contracts.getById: ${error.message}`)
  return (data as UpworkContract | null) ?? null
}

export async function insert(input: Omit<UpworkContract, 'id' | 'created_at'>): Promise<UpworkContract> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contracts')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.contracts.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkContract
}

export async function update(
  contractId: string,
  patch: Partial<Omit<UpworkContract, 'id' | 'profile_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_contracts')
    .update(patch)
    .eq('id', contractId)
  if (error) throw new Error(`db.upwork.contracts.update: ${error.message}`)
}

// ─── Milestones ────────────────────────────────────────────────────

export async function listMilestones(contractId: string): Promise<UpworkMilestone[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .select('*')
    .eq('contract_id', contractId)
    .order('sequence', { ascending: true })
  if (error) throw new Error(`db.upwork.milestones.list: ${error.message}`)
  return (data as UpworkMilestone[]) ?? []
}

export async function nextMilestoneSequence(contractId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .select('sequence')
    .eq('contract_id', contractId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.milestones.nextSeq: ${error.message}`)
  const last = (data as { sequence: number } | null)?.sequence ?? 0
  return last + 1
}

export async function insertMilestone(input: {
  contract_id: string
  sequence: number
  name: string
  amount_usd: number
  due_at: string | null
  notes: string | null
  status: UpworkMilestoneStatus
}): Promise<UpworkMilestone> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.milestones.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkMilestone
}

export async function updateMilestone(
  milestoneId: string,
  patch: Partial<Omit<UpworkMilestone, 'id' | 'contract_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .update(patch)
    .eq('id', milestoneId)
  if (error) throw new Error(`db.upwork.milestones.update: ${error.message}`)
}

export async function getMilestoneById(milestoneId: string): Promise<UpworkMilestone | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .select('*')
    .eq('id', milestoneId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.milestones.getById: ${error.message}`)
  return (data as UpworkMilestone | null) ?? null
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .delete()
    .eq('id', milestoneId)
  if (error) throw new Error(`db.upwork.milestones.delete: ${error.message}`)
}

// ─── Time logs ─────────────────────────────────────────────────────

export async function listTimeLogs(contractId: string): Promise<UpworkTimeLog[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_time_logs')
    .select('*')
    .eq('contract_id', contractId)
    .order('week_starting', { ascending: false })
    .order('bidder_user_id', { ascending: true })
  if (error) throw new Error(`db.upwork.timeLogs.list: ${error.message}`)
  return (data as UpworkTimeLog[]) ?? []
}

export async function findTimeLogForWeek(
  contractId: string,
  bidderUserId: string,
  weekStarting: string
): Promise<UpworkTimeLog | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_time_logs')
    .select('*')
    .eq('contract_id', contractId)
    .eq('bidder_user_id', bidderUserId)
    .eq('week_starting', weekStarting)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.timeLogs.findForWeek: ${error.message}`)
  return (data as UpworkTimeLog | null) ?? null
}

export async function getTimeLogById(timeLogId: string): Promise<UpworkTimeLog | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_time_logs')
    .select('*')
    .eq('id', timeLogId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.timeLogs.getById: ${error.message}`)
  return (data as UpworkTimeLog | null) ?? null
}

export async function insertTimeLog(input: {
  contract_id: string
  bidder_user_id: string
  week_starting: string
  hours: number
  hourly_rate_usd: number
  status: UpworkTimeLogStatus
  notes: string | null
}): Promise<UpworkTimeLog> {
  const { data, error } = await supabaseAdmin
    .from('upwork_time_logs')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.timeLogs.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkTimeLog
}

export async function updateTimeLog(
  timeLogId: string,
  patch: Partial<Omit<UpworkTimeLog, 'id' | 'contract_id' | 'amount_usd' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_time_logs')
    .update(patch)
    .eq('id', timeLogId)
  if (error) throw new Error(`db.upwork.timeLogs.update: ${error.message}`)
}

export async function deleteTimeLog(timeLogId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_time_logs')
    .delete()
    .eq('id', timeLogId)
  if (error) throw new Error(`db.upwork.timeLogs.delete: ${error.message}`)
}
