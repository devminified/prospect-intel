import { supabaseAdmin } from '@/lib/supabase/server'
import type { UpworkConnectsLogEntry, UpworkConnectsType } from '@/lib/types'

/**
 * Typed Supabase queries for the upwork_connects_log ledger. The
 * ledger is append-only — no UPDATE / DELETE in normal flow. The DB
 * trigger keeps `upwork_profiles.connects_balance` in sync on insert.
 */

export async function listForProfile(
  profileId: string,
  opts: { limit?: number } = {}
): Promise<UpworkConnectsLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_connects_log')
    .select('*')
    .eq('profile_id', profileId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (error) throw new Error(`db.upwork.connectsLog.listForProfile: ${error.message}`)
  return (data as UpworkConnectsLogEntry[]) ?? []
}

export async function getCurrentBalance(profileId: string): Promise<number> {
  // Read from the latest ledger row when one exists; fall back to the
  // profile snapshot. The trigger keeps them in sync but if no entries
  // exist yet (just-created profile), the snapshot is what we have.
  const { data: latest, error } = await supabaseAdmin
    .from('upwork_connects_log')
    .select('balance_after')
    .eq('profile_id', profileId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.connectsLog.getCurrentBalance: ${error.message}`)
  if (latest) return (latest as { balance_after: number }).balance_after

  const { data: profile } = await supabaseAdmin
    .from('upwork_profiles')
    .select('connects_balance')
    .eq('id', profileId)
    .maybeSingle()
  return ((profile as { connects_balance: number } | null)?.connects_balance) ?? 0
}

export async function insert(input: {
  profile_id: string
  type: UpworkConnectsType
  amount: number
  signed_amount: number
  balance_after: number
  related_proposal_id: string | null
  notes: string | null
  occurred_at: string | null
  recorded_by_user_id: string
}): Promise<UpworkConnectsLogEntry> {
  const { data, error } = await supabaseAdmin
    .from('upwork_connects_log')
    .insert({
      profile_id: input.profile_id,
      type: input.type,
      amount: input.amount,
      signed_amount: input.signed_amount,
      balance_after: input.balance_after,
      related_proposal_id: input.related_proposal_id,
      notes: input.notes,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      recorded_by_user_id: input.recorded_by_user_id,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.connectsLog.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkConnectsLogEntry
}
