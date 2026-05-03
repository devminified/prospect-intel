import { supabaseAdmin } from '@/lib/supabase/server'
import type { Batch } from '@/lib/types'

export async function create(input: {
  userId: string
  teamId: string
  city: string
  category: string
  count: number
  autoEnrichTopN?: number
  pitchScoreThreshold?: number | null
}): Promise<Batch> {
  const { data, error } = await supabaseAdmin
    .from('batches')
    .insert({
      user_id: input.userId,
      team_id: input.teamId,
      city: input.city,
      category: input.category,
      count_requested: input.count,
      status: 'processing',
      auto_enrich_top_n: input.autoEnrichTopN ?? 0,
      pitch_score_threshold: input.pitchScoreThreshold ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`db.batches.create: ${error?.message ?? 'no row returned'}`)
  return data as Batch
}

export async function setFilterCounts(
  batchId: string,
  counts: { filteredBelowIcp: number; duplicatesSkipped: number }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('batches')
    .update({
      count_filtered_below_icp: counts.filteredBelowIcp,
      count_duplicates_skipped: counts.duplicatesSkipped,
    })
    .eq('id', batchId)
  if (error) throw new Error(`db.batches.setFilterCounts: ${error.message}`)
}

export async function setStatus(batchId: string, status: Batch['status']): Promise<void> {
  const { error } = await supabaseAdmin.from('batches').update({ status }).eq('id', batchId)
  if (error) throw new Error(`db.batches.setStatus: ${error.message}`)
}

export async function setStatusAndCompleted(
  batchId: string,
  status: Batch['status'],
  countCompleted: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('batches')
    .update({ status, count_completed: countCompleted })
    .eq('id', batchId)
  if (error) throw new Error(`db.batches.setStatusAndCompleted: ${error.message}`)
}
