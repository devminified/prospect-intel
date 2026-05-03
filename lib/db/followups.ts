import { supabaseAdmin } from '@/lib/supabase/server'
import type { Followup } from '@/lib/types'

export async function listByProspect(prospectId: string): Promise<Followup[]> {
  const { data, error } = await supabaseAdmin
    .from('prospect_followups')
    .select('id, due_at, note, done, done_at, created_at')
    .eq('prospect_id', prospectId)
    .order('done', { ascending: true })
    .order('due_at', { ascending: true })
  if (error) throw new Error(`db.followups.listByProspect: ${error.message}`)
  return (data as Followup[] | null) ?? []
}

export async function create(input: {
  prospectId: string
  userId: string
  dueAt: string
  note: string | null
}): Promise<Followup> {
  const { data, error } = await supabaseAdmin
    .from('prospect_followups')
    .insert({
      prospect_id: input.prospectId,
      user_id: input.userId,
      due_at: input.dueAt,
      note: input.note,
    })
    .select('id, due_at, note, done, done_at, created_at')
    .single()
  if (error || !data) throw new Error(`db.followups.create: ${error?.message ?? 'no row returned'}`)
  return data as Followup
}

export async function update(
  followupId: string,
  patch: { due_at?: string; note?: string | null; done?: boolean; done_at?: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('prospect_followups')
    .update(patch)
    .eq('id', followupId)
  if (error) throw new Error(`db.followups.update: ${error.message}`)
}

export async function remove(followupId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('prospect_followups').delete().eq('id', followupId)
  if (error) throw new Error(`db.followups.remove: ${error.message}`)
}

export async function findOwnership(followupId: string): Promise<{ prospect_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('prospect_followups')
    .select('prospect_id')
    .eq('id', followupId)
    .maybeSingle()
  if (error) throw new Error(`db.followups.findOwnership: ${error.message}`)
  return (data as { prospect_id: string } | null) ?? null
}
