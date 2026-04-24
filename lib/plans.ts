import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { plannerPrompt } from '@/lib/prompts'
import { calendarForCategories } from '@/lib/seasonality'
import { searchPlaces } from '@/lib/places'
import { enqueueJob } from '@/lib/queue'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing env.ANTHROPIC_API_KEY')
}

const OPUS_MODEL = 'claude-opus-4-7'

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    rationale: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'integer' },
          city: { type: 'string' },
          category: { type: 'string' },
          count: { type: 'integer' },
          reasoning: { type: 'string' },
        },
        required: ['priority', 'city', 'category', 'count', 'reasoning'],
        additionalProperties: false,
      },
    },
  },
  required: ['rationale', 'items'],
  additionalProperties: false,
}

interface PlannerResult {
  rationale: string
  items: Array<{
    priority: number
    city: string
    category: string
    count: number
    reasoning: string
  }>
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Rough variable cost per prospect in dollars (Google Places + ScrapingBee +
// Anthropic + etc). Used only for the est cost column on plan items.
const COST_PER_PROSPECT_USD = 0.4

/**
 * Generate today's daily lead plan for a user. Loads their ICP, computes the
 * seasonality cut for their target_categories, summarizes recent batches, then
 * calls Opus 4.7 for the recommendation. Writes lead_plans + lead_plan_items.
 *
 * Throws if the user has no ICP or if target_categories is empty.
 */
export async function generatePlan(userId: string): Promise<string> {
  const { data: icp, error: icpErr } = await supabaseAdmin
    .from('icp_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (icpErr) throw new Error(`ICP load failed: ${icpErr.message}`)
  if (!icp) throw new Error('No ICP configured — fill /settings/icp first')
  if (!icp.target_categories || icp.target_categories.length === 0) {
    throw new Error('ICP has no target_categories — add at least one before generating a plan')
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthName = now.toLocaleString('en-US', { month: 'long' })
  const calendar = calendarForCategories(icp.target_categories, now.getUTCMonth() + 1)

  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentBatches } = await supabaseAdmin
    .from('batches')
    .select('city, category, count_requested, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  const prompt = plannerPrompt({
    today_iso: today,
    today_month_name: monthName,
    icp: {
      services: icp.services,
      avg_deal_size: icp.avg_deal_size,
      daily_capacity: icp.daily_capacity,
      preferred_cities: icp.preferred_cities,
      excluded_cities: icp.excluded_cities,
      min_gmb_rating: icp.min_gmb_rating,
      min_review_count: icp.min_review_count,
      target_categories: icp.target_categories,
    },
    seasonality: calendar,
    recent_batches: (recentBatches ?? []).map((b: any) => ({
      city: b.city,
      category: b.category,
      prospects_created: b.count_requested,
      created_at: b.created_at,
    })),
  })

  const result = await callOpus(prompt)
  enforcePlanConstraints(result, icp)

  const { data: plan, error: planErr } = await supabaseAdmin
    .from('lead_plans')
    .insert({
      user_id: userId,
      plan_date: today,
      status: 'draft',
      rationale_json: { rationale: result.rationale, calendar_used: calendar, today_iso: today },
    })
    .select('id')
    .single()
  if (planErr || !plan) throw new Error(`Failed to save plan: ${planErr?.message}`)

  const rows = result.items
    .slice(0, 5)
    .sort((a, b) => a.priority - b.priority)
    .map((it) => ({
      plan_id: plan.id,
      city: it.city,
      category: it.category,
      count: clampCount(it.count),
      reasoning: it.reasoning,
      priority: it.priority,
      estimated_cost_usd: +(clampCount(it.count) * COST_PER_PROSPECT_USD).toFixed(2),
    }))

  const { error: itemsErr } = await supabaseAdmin.from('lead_plan_items').insert(rows)
  if (itemsErr) throw new Error(`Failed to save plan items: ${itemsErr.message}`)

  return plan.id
}

/**
 * Execute a plan: for each un-executed item, create a batch via the same flow
 * the /api/batches endpoint uses. Writes batch_id + executed_at onto each item,
 * and flips the plan status to 'executed' when done.
 */
export async function executePlan(planId: string, userId: string): Promise<{ executed: number; skipped: number; errors: string[] }> {
  const { data: plan, error: planErr } = await supabaseAdmin
    .from('lead_plans')
    .select('id, user_id, status')
    .eq('id', planId)
    .single()
  if (planErr || !plan) throw new Error('Plan not found')
  if (plan.user_id !== userId) throw new Error('Forbidden')

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('lead_plan_items')
    .select('*')
    .eq('plan_id', planId)
    .is('batch_id', null)
    .order('priority', { ascending: true })
  if (itemsErr) throw new Error(`Items load failed: ${itemsErr.message}`)

  let executed = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of (items as any[]) ?? []) {
    try {
      const batchId = await createBatchForPlanItem(userId, item.city, item.category, item.count)
      await supabaseAdmin
        .from('lead_plan_items')
        .update({ batch_id: batchId, executed_at: new Date().toISOString() })
        .eq('id', item.id)
      executed++
    } catch (err: any) {
      skipped++
      errors.push(`${item.category} in ${item.city}: ${err?.message ?? String(err)}`)
    }
  }

  if (executed > 0) {
    await supabaseAdmin
      .from('lead_plans')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', planId)
  }

  return { executed, skipped, errors }
}

/**
 * Execute a single plan item by id. Returns the batch_id.
 */
export async function executePlanItem(itemId: string, userId: string): Promise<string> {
  const { data: item, error } = await supabaseAdmin
    .from('lead_plan_items')
    .select('id, plan_id, city, category, count, batch_id, lead_plans!inner(user_id)')
    .eq('id', itemId)
    .single()
  if (error || !item) throw new Error('Plan item not found')
  if ((item as any).lead_plans.user_id !== userId) throw new Error('Forbidden')
  if ((item as any).batch_id) return (item as any).batch_id

  const batchId = await createBatchForPlanItem(userId, (item as any).city, (item as any).category, (item as any).count)
  await supabaseAdmin
    .from('lead_plan_items')
    .update({ batch_id: batchId, executed_at: new Date().toISOString() })
    .eq('id', itemId)
  return batchId
}

async function createBatchForPlanItem(userId: string, city: string, category: string, count: number): Promise<string> {
  const places = await searchPlaces(category, city)
  const limited = places.slice(0, count)

  const { data: batch, error: batchErr } = await supabaseAdmin
    .from('batches')
    .insert({
      user_id: userId,
      city,
      category,
      count_requested: count,
      status: limited.length > 0 ? 'processing' : 'done',
    })
    .select('id')
    .single()
  if (batchErr || !batch) throw new Error(`Batch create failed: ${batchErr?.message}`)

  for (const place of limited) {
    const { data: prospect, error: pErr } = await supabaseAdmin
      .from('prospects')
      .insert({
        batch_id: batch.id,
        name: place.name,
        address: place.formatted_address,
        phone: place.phone,
        website: place.website,
        place_id: place.place_id,
        rating: place.rating,
        review_count: place.user_ratings_total,
        hours_json: place.opening_hours,
        categories_text: place.types?.join(', '),
        status: 'new',
      })
      .select('id')
      .single()
    if (pErr || !prospect) continue
    try {
      await enqueueJob(batch.id, prospect.id, 'enrich')
    } catch (e) {
      console.error('enqueue enrich failed:', e)
    }
  }

  return batch.id
}

async function callOpus(prompt: string): Promise<PlannerResult> {
  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: PLAN_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  } as any)

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const parsed = JSON.parse(text) as PlannerResult
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('Planner returned no items')
  }
  return parsed
}

/**
 * Post-validation that Opus honored the hard constraints. Any violation
 * means we drop the offending item rather than fail the whole plan — user
 * still sees something usable, with the violations counted in rationale.
 */
function enforcePlanConstraints(result: PlannerResult, icp: any): void {
  const targetSet = new Set((icp.target_categories as string[]).map((s) => s.toLowerCase()))
  const excludedSet = new Set((icp.excluded_cities as string[]).map((s) => s.toLowerCase()))

  result.items = result.items.filter((it) => {
    const catOk = targetSet.size === 0 || targetSet.has(it.category.toLowerCase())
    const cityOk = !excludedSet.has(it.city.toLowerCase())
    return catOk && cityOk && it.count > 0
  })

  if (icp.daily_capacity > 0) {
    let remaining = icp.daily_capacity as number
    for (const it of result.items) {
      if (remaining <= 0) {
        it.count = 0
      } else if (it.count > remaining) {
        it.count = remaining
      }
      remaining -= it.count
    }
    result.items = result.items.filter((it) => it.count > 0)
  }
}

function clampCount(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1
  if (n > 50) return 50
  return Math.floor(n)
}
