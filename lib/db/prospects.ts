import { supabaseAdmin } from '@/lib/supabase/server'
import type { Prospect } from '@/lib/types'

export async function getById(prospectId: string): Promise<Prospect | null> {
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle()
  if (error) throw new Error(`db.prospects.getById: ${error.message}`)
  return (data as Prospect | null) ?? null
}

/**
 * Returns the team_id of the batch this prospect belongs to. Used by
 * route-layer ownership checks before mutating prospect-scoped data.
 */
export async function getTeamId(prospectId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('batches!inner(team_id)')
    .eq('id', prospectId)
    .maybeSingle()
  if (error) throw new Error(`db.prospects.getTeamId: ${error.message}`)
  return ((data as any)?.batches?.team_id as string | undefined) ?? null
}

export async function update(
  prospectId: string,
  patch: Partial<
    Pick<
      Prospect,
      'status' | 'outreach_status' | 'last_viewed_at' | 'assigned_to' | 'assigned_at'
    >
  >
): Promise<void> {
  const { error } = await supabaseAdmin.from('prospects').update(patch).eq('id', prospectId)
  if (error) throw new Error(`db.prospects.update: ${error.message}`)
}

export async function markViewed(prospectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('prospects')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', prospectId)
  if (error) {
    // Best-effort: don't fail the request just because the viewed-tracker stalled.
    console.warn('db.prospects.markViewed:', error.message)
  }
}
