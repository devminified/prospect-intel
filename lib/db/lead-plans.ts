import { supabaseAdmin } from '@/lib/supabase/server'
import type { LeadPlan, LeadPlanItem } from '@/lib/types'

export async function getById(planId: string): Promise<LeadPlan | null> {
  const { data, error } = await supabaseAdmin
    .from('lead_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw new Error(`db.leadPlans.getById: ${error.message}`)
  return (data as LeadPlan | null) ?? null
}

export async function findExistingForDate(userId: string, planDate: string): Promise<LeadPlan | null> {
  const { data, error } = await supabaseAdmin
    .from('lead_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', planDate)
    .maybeSingle()
  if (error) throw new Error(`db.leadPlans.findExistingForDate: ${error.message}`)
  return (data as LeadPlan | null) ?? null
}

export async function listRecentBatches(
  userId: string,
  sinceIso: string,
  limit = 20
): Promise<Array<{ city: string; category: string; count_requested: number; created_at: string }>> {
  const { data, error } = await supabaseAdmin
    .from('batches')
    .select('city, category, count_requested, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`db.leadPlans.listRecentBatches: ${error.message}`)
  return (data as any[] | null) ?? []
}

export async function createPlan(input: {
  userId: string
  teamId: string
  planDate: string
  rationaleJson: unknown
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('lead_plans')
    .insert({
      user_id: input.userId,
      team_id: input.teamId,
      plan_date: input.planDate,
      status: 'draft',
      rationale_json: input.rationaleJson,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`db.leadPlans.createPlan: ${error?.message ?? 'no row returned'}`)
  return data as { id: string }
}

export async function insertItems(
  rows: Array<Omit<LeadPlanItem, 'id' | 'batch_id' | 'executed_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin.from('lead_plan_items').insert(rows)
  if (error) throw new Error(`db.leadPlans.insertItems: ${error.message}`)
}

export async function listItemsForPlan(planId: string): Promise<LeadPlanItem[]> {
  const { data, error } = await supabaseAdmin
    .from('lead_plan_items')
    .select('*')
    .eq('plan_id', planId)
    .is('batch_id', null)
    .order('priority', { ascending: true })
  if (error) throw new Error(`db.leadPlans.listItemsForPlan: ${error.message}`)
  return (data as LeadPlanItem[] | null) ?? []
}

export async function attachBatchToItem(itemId: string, batchId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lead_plan_items')
    .update({ batch_id: batchId, executed_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw new Error(`db.leadPlans.attachBatchToItem: ${error.message}`)
}

export async function markPlanExecuted(planId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lead_plans')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) throw new Error(`db.leadPlans.markPlanExecuted: ${error.message}`)
}
