import { z } from 'zod'
import { OutreachStateSchema } from './prospect'

/**
 * View-level / aggregate shapes — the data structures returned by
 * TanStack `useQuery` hooks for specific pages, or held by pages
 * during render. These are NOT primary domain entities (those live in
 * the per-domain files); they're compositions used by one or two
 * pages each.
 *
 * Per CONVENTIONS § Layered architecture, types must live here, not
 * inline in lib/queries/* or app/(dashboard)/*. Adding a new aggregate
 * means adding it here too.
 */

// ─── /leads page ────────────────────────────────────────────────────

export const LeadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  outreach_status: z.string().nullable(),
  last_viewed_at: z.string().nullable(),
  website: z.string().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  created_at: z.string(),
  batch_id: z.string().uuid(),
  batch_city: z.string().nullable(),
  batch_category: z.string().nullable(),
  best_angle: z.string().nullable(),
  opportunity_score: z.number().nullable(),
  assigned_to: z.string().uuid().nullable(),
  outreach: OutreachStateSchema,
})
export type Lead = z.infer<typeof LeadSchema>

// ─── /dashboard page ────────────────────────────────────────────────

export const ProspectLiteSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  outreach_status: z.string().nullable(),
  last_viewed_at: z.string().nullable(),
})
export type ProspectLite = z.infer<typeof ProspectLiteSchema>

export const DashFollowupSchema = z.object({
  id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  due_at: z.string(),
  note: z.string().nullable(),
  done: z.boolean(),
  done_at: z.string().nullable(),
  created_at: z.string(),
})
export type DashFollowup = z.infer<typeof DashFollowupSchema>

export const ActivityEventSchema = z.object({
  ts: z.string(),
  icon: z.string(),
  text: z.string(),
  prospectId: z.string().uuid(),
  cls: z.string().optional(),
})
export type ActivityEvent = z.infer<typeof ActivityEventSchema>

/**
 * Note: stateByProspect is a Map, which Zod can model with `z.map(...)`
 * but consumers don't typically validate it at runtime. Keep the schema
 * loose for the Map field; type alias is what matters here.
 */
export interface DashboardData {
  prospects: ProspectLite[]
  followups: DashFollowup[]
  stateByProspect: Map<string, z.infer<typeof OutreachStateSchema>>
  events: ActivityEvent[]
}

// ─── /batches list ──────────────────────────────────────────────────

export const BatchListRowSchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  category: z.string(),
  count_requested: z.number().int(),
  count_completed: z.number().int(),
  status: z.string(),
  created_at: z.string(),
})
export type BatchListRow = z.infer<typeof BatchListRowSchema>

// ─── /batches/[id] page ─────────────────────────────────────────────

export const BatchHeaderSchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  category: z.string(),
  count_requested: z.number().int(),
  count_completed: z.number().int(),
  count_filtered_below_icp: z.number().int(),
  count_duplicates_skipped: z.number().int(),
  status: z.string(),
})
export type BatchHeader = z.infer<typeof BatchHeaderSchema>

export const BatchProspectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  website: z.string().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  outreach_status: z.string().nullable(),
  last_viewed_at: z.string().nullable(),
  analyses: z
    .object({
      opportunity_score: z.number().nullable(),
      best_angle: z.string().nullable(),
    })
    .nullable(),
  last_error: z.string().nullable().optional(),
  failed_stage: z.string().nullable().optional(),
  outreach: OutreachStateSchema,
})
export type BatchProspect = z.infer<typeof BatchProspectSchema>

export interface BatchDetail {
  batch: BatchHeader
  prospects: BatchProspect[]
}

// ─── /leads filter UI keys ──────────────────────────────────────────

export type StageKey = 'all' | 'no_outreach' | 'in_contact' | 'opened' | 'replied' | 'call_phase'
export type ViewedKey = 'any' | 'viewed' | 'unviewed'
export type SortKey = 'score' | 'last_activity' | 'unviewed_first' | 'created'
export type ViewMode = 'list' | 'kanban'

export interface SavedView {
  name: string
  stage: StageKey
  outreach: string
  viewed: ViewedKey
  sort: SortKey
  search: string
  view: ViewMode
  assignee?: string
}

// ─── /plans list page ───────────────────────────────────────────────

export const PlanListRowSchema = z.object({
  id: z.string().uuid(),
  plan_date: z.string(),
  status: z.string(),
  created_at: z.string(),
  executed_at: z.string().nullable(),
})
export type PlanListRow = z.infer<typeof PlanListRowSchema>

export const PerformanceRowSchema = z.object({
  category: z.string(),
  city: z.string(),
  sent: z.number().int(),
  replies: z.number().int(),
  interested: z.number().int(),
  not_interested: z.number().int(),
  unsub: z.number().int(),
  reply_rate: z.number(),
  interested_rate: z.number(),
  unsub_rate: z.number(),
})
export type PerformanceRow = z.infer<typeof PerformanceRowSchema>

// ─── /plans/[id] detail page ────────────────────────────────────────

export const PlanDetailSchema = z.object({
  id: z.string().uuid(),
  plan_date: z.string(),
  status: z.string(),
  rationale_json: z
    .object({ rationale: z.string().optional(), today_iso: z.string().optional() })
    .nullable(),
  created_at: z.string(),
  executed_at: z.string().nullable(),
})
export type PlanDetail = z.infer<typeof PlanDetailSchema>

export const PlanItemSchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  category: z.string(),
  count: z.number().int(),
  reasoning: z.string().nullable(),
  priority: z.number().int(),
  estimated_cost_usd: z.number().nullable(),
  batch_id: z.string().uuid().nullable(),
  executed_at: z.string().nullable(),
})
export type PlanItem = z.infer<typeof PlanItemSchema>

/** Aggregate returned by the /plans/[id] query — one plan + its items, sorted by priority. */
export interface PlanWithItems {
  plan: PlanDetail
  items: PlanItem[]
}

export interface GeneratePlanResponse {
  plan_id: string
}

export interface ExecutePlanResponse {
  executed: number
  skipped: number
  errors?: string[]
}
