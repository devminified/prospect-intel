import { z } from 'zod'

// ─── Contracts ─────────────────────────────────────────────────────

export const UpworkContractTypeSchema = z.enum(['fixed', 'hourly'])
export type UpworkContractType = z.infer<typeof UpworkContractTypeSchema>

export const UpworkContractStatusSchema = z.enum(['active', 'paused', 'ended', 'disputed'])
export type UpworkContractStatus = z.infer<typeof UpworkContractStatusSchema>

export const UpworkContractEndReasonSchema = z.enum([
  'completed',
  'cancelled',
  'disputed',
  'refunded',
])
export type UpworkContractEndReason = z.infer<typeof UpworkContractEndReasonSchema>

export const UpworkContractSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  proposal_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid().nullable(),
  client_id: z.string().uuid().nullable(),
  upwork_contract_id: z.string().nullable(),
  title: z.string(),
  contract_type: UpworkContractTypeSchema,
  agreed_total_usd: z.number().nullable(),
  agreed_rate_usd: z.number().nullable(),
  status: UpworkContractStatusSchema,
  end_reason: UpworkContractEndReasonSchema.nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkContract = z.infer<typeof UpworkContractSchema>

/**
 * "Optional number-or-null" — accepts number/string/null/undefined,
 * returns number or null when set, undefined when omitted. The
 * `undefined` branch keeps the inferred input type's optionality
 * intact so partial PATCH bodies type-check.
 */
/**
 * Number-or-null coercion. Combine with `.optional()` at the property
 * level so the inferred TS type marks the key as `?:` (truly optional)
 * rather than `: T | undefined` (required-but-nullable).
 */
const numOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v): number | null => {
    if (v === null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

export const UpworkContractCreateInputSchema = z.object({
  profile_id: z.string().uuid('profile_id required'),
  proposal_id: z.string().uuid().optional().nullable(),
  conversation_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  upwork_contract_id: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1, 'Title required').max(500),
  contract_type: UpworkContractTypeSchema,
  agreed_total_usd: numOrNull.optional(),
  agreed_rate_usd: numOrNull.optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  started_at: z.string().optional().nullable(),
})
export type UpworkContractCreateInput = z.infer<typeof UpworkContractCreateInputSchema>

export const UpworkContractUpdateInputSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  upwork_contract_id: z.string().trim().max(120).optional().nullable(),
  agreed_total_usd: numOrNull.optional(),
  agreed_rate_usd: numOrNull.optional(),
  status: UpworkContractStatusSchema.optional(),
  end_reason: UpworkContractEndReasonSchema.optional().nullable(),
  ended_at: z.string().optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
})
export type UpworkContractUpdateInput = z.infer<typeof UpworkContractUpdateInputSchema>

// ─── Milestones ────────────────────────────────────────────────────

export const UpworkMilestoneStatusSchema = z.enum([
  'pending',
  'funded',
  'in_progress',
  'submitted',
  'paid',
  'disputed',
  'refunded',
])
export type UpworkMilestoneStatus = z.infer<typeof UpworkMilestoneStatusSchema>

export const UpworkMilestoneSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  sequence: z.number().int(),
  name: z.string(),
  amount_usd: z.number(),
  status: UpworkMilestoneStatusSchema,
  due_at: z.string().nullable(),
  funded_at: z.string().nullable(),
  submitted_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkMilestone = z.infer<typeof UpworkMilestoneSchema>

export const UpworkMilestoneCreateInputSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(200),
  amount_usd: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }),
  due_at: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})
export type UpworkMilestoneCreateInput = z.infer<typeof UpworkMilestoneCreateInputSchema>

export const UpworkMilestoneUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  amount_usd: z
    .union([z.number(), z.string()])
    .transform((v): number => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n >= 0 ? n : 0
    })
    .optional(),
  status: UpworkMilestoneStatusSchema.optional(),
  due_at: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})
export type UpworkMilestoneUpdateInput = z.infer<typeof UpworkMilestoneUpdateInputSchema>

// ─── Time logs (hourly) ────────────────────────────────────────────

export const UpworkTimeLogStatusSchema = z.enum(['logged', 'billed', 'paid', 'disputed'])
export type UpworkTimeLogStatus = z.infer<typeof UpworkTimeLogStatusSchema>

export const UpworkTimeLogSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  bidder_user_id: z.string().uuid(),
  week_starting: z.string(),
  hours: z.number(),
  hourly_rate_usd: z.number(),
  amount_usd: z.number(),
  status: UpworkTimeLogStatusSchema,
  notes: z.string().nullable(),
  billed_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkTimeLog = z.infer<typeof UpworkTimeLogSchema>

export const UpworkTimeLogUpsertInputSchema = z.object({
  // ISO date YYYY-MM-DD — service normalizes to the Monday of the week.
  week_starting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'week_starting must be YYYY-MM-DD'),
  hours: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n > 0 ? n : 0
    })
    .refine((n) => n > 0, { message: 'Hours must be > 0' }),
  hourly_rate_usd: z
    .union([z.number(), z.string(), z.null()])
    .transform((v): number | null => {
      if (v === null || v === '') return null
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    })
    .optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
})
export type UpworkTimeLogUpsertInput = z.infer<typeof UpworkTimeLogUpsertInputSchema>

export const UpworkTimeLogStatusChangeInputSchema = z.object({
  status: UpworkTimeLogStatusSchema,
})
export type UpworkTimeLogStatusChangeInput = z.infer<
  typeof UpworkTimeLogStatusChangeInputSchema
>

// ─── Aggregate views ───────────────────────────────────────────────

export interface UpworkContractDetail {
  contract: UpworkContract
  milestones: UpworkMilestone[]
  time_logs: UpworkTimeLog[]
  can_manage: boolean
}
