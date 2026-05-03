import { supabaseAdmin } from '@/lib/supabase/server'
import type { Note } from '@/lib/types'

export async function listByProspect(prospectId: string): Promise<Note[]> {
  const { data, error } = await supabaseAdmin
    .from('prospect_notes')
    .select('id, body, created_at, updated_at, user_id')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`db.notes.listByProspect: ${error.message}`)
  return (data as Note[] | null) ?? []
}

export async function create(input: {
  prospectId: string
  userId: string
  body: string
}): Promise<Note> {
  const { data, error } = await supabaseAdmin
    .from('prospect_notes')
    .insert({ prospect_id: input.prospectId, user_id: input.userId, body: input.body })
    .select('id, body, created_at, updated_at, user_id')
    .single()
  if (error || !data) throw new Error(`db.notes.create: ${error?.message ?? 'no row returned'}`)
  return data as Note
}

export async function update(noteId: string, body: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('prospect_notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', noteId)
  if (error) throw new Error(`db.notes.update: ${error.message}`)
}

export async function remove(noteId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('prospect_notes').delete().eq('id', noteId)
  if (error) throw new Error(`db.notes.remove: ${error.message}`)
}

/**
 * Looks up a note's owning prospect — used by the route layer for
 * cross-prospect ownership checks before mutating.
 */
export async function findOwnership(noteId: string): Promise<{ prospect_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('prospect_notes')
    .select('prospect_id')
    .eq('id', noteId)
    .maybeSingle()
  if (error) throw new Error(`db.notes.findOwnership: ${error.message}`)
  return (data as { prospect_id: string } | null) ?? null
}
