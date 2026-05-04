import { z } from 'zod'

/**
 * Upwork jobs + proposals + Connects ledger types — Phase 11B.
 * Keeps each domain's Zod schemas in one place per the layered
 * architecture rule.
 */

// ─── Jobs ──────────────────────────────────────────────────────────

export const UpworkBudgetTypeSchema = z.enum(['fixed', 'hourly', 'unknown'])
export type UpworkBudgetType = z.infer<typeof UpworkBudgetTypeSchema>

export const UpworkExperienceLevelSchema = z.enum(['entry', 'intermediate', 'expert'])
export type UpworkExperienceLevel = z.infer<typeof UpworkExperienceLevelSchema>

export const UpworkJobStatusSchema = z.enum(['open', 'closed', 'hired_other', 'dead'])
export type UpworkJobStatus = z.infer<typeof UpworkJobStatusSchema>

export const UpworkJobSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  upwork_job_id: z.string().nullable(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  posted_at: z.string().nullable(),
  budget_type: UpworkBudgetTypeSchema,
  budget_min_usd: z.number().nullable(),
  budget_max_usd: z.number().nullable(),
  hourly_min_usd: z.number().nullable(),
  hourly_max_usd: z.number().nullable(),
  est_duration: z.string().nullable(),
  hours_per_week: z.string().nullable(),
  experience_level: UpworkExperienceLevelSchema.nullable(),
  category: z.string().nullable(),
  skills: z.array(z.string()).default([]),
  country: z.string().nullable(),
  client_id: z.string().uuid().nullable(),
  status: UpworkJobStatusSchema,
  saved_by_user_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkJob = z.infer<typeof UpworkJobSchema>

const numOrNull = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

export const UpworkJobCreateInputSchema = z.object({
  url: z.string().trim().url('Job URL must be a full URL'),
  title: z.string().trim().min(1, 'Title required').max(500),
  description: z.string().trim().max(20000).optional().nullable(),
  budget_type: UpworkBudgetTypeSchema.default('unknown'),
  budget_min_usd: numOrNull,
  budget_max_usd: numOrNull,
  hourly_min_usd: numOrNull,
  hourly_max_usd: numOrNull,
  est_duration: z.string().trim().max(60).optional().nullable(),
  hours_per_week: z.string().trim().max(60).optional().nullable(),
  experience_level: UpworkExperienceLevelSchema.optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  skills: z.array(z.string().trim().min(1)).default([]),
  country: z.string().trim().max(60).optional().nullable(),
  posted_at: z.string().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
})
export type UpworkJobCreateInput = z.infer<typeof UpworkJobCreateInputSchema>

export const UpworkJobUpdateInputSchema = UpworkJobCreateInputSchema.partial().extend({
  status: UpworkJobStatusSchema.optional(),
})
export type UpworkJobUpdateInput = z.infer<typeof UpworkJobUpdateInputSchema>

// ─── Proposals ─────────────────────────────────────────────────────

export const UpworkBidTypeSchema = z.enum(['fixed', 'hourly'])
export type UpworkBidType = z.infer<typeof UpworkBidTypeSchema>

export const UpworkProposalStatusSchema = z.enum([
  'drafted',
  'sent',
  'viewed',
  'shortlisted',
  'interview',
  'declined',
  'withdrawn',
  'hired',
  'no_response',
])
export type UpworkProposalStatus = z.infer<typeof UpworkProposalStatusSchema>

export const UpworkProposalMilestoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount_usd: z.number().nonnegative(),
  due_at: z.string().optional().nullable(),
})
export type UpworkProposalMilestone = z.infer<typeof UpworkProposalMilestoneSchema>

export const UpworkProposalSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  job_id: z.string().uuid(),
  bidder_user_id: z.string().uuid(),
  cover_letter: z.string().nullable(),
  bid_type: UpworkBidTypeSchema,
  bid_amount_usd: z.number().nullable(),
  proposed_milestones_json: z.array(UpworkProposalMilestoneSchema).nullable(),
  connects_spent: z.number().int(),
  status: UpworkProposalStatusSchema,
  status_changed_at: z.string(),
  sent_at: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
  hired_at: z.string().nullable(),
  declined_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkProposal = z.infer<typeof UpworkProposalSchema>

export const UpworkProposalCreateInputSchema = z
  .object({
    profile_id: z.string().uuid('profile_id required'),
    job_id: z.string().uuid('job_id required'),
    cover_letter: z.string().trim().max(20000).optional().nullable(),
    bid_type: UpworkBidTypeSchema,
    bid_amount_usd: z
      .union([z.number(), z.string()])
      .nullable()
      .optional()
      .transform((v) => {
        if (v == null || v === '') return null
        const n = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(n) ? n : null
      }),
    proposed_milestones_json: z.array(UpworkProposalMilestoneSchema).optional().nullable(),
    connects_spent: z
      .union([z.number(), z.string()])
      .default(0)
      .transform((v) => {
        const n = typeof v === 'number' ? v : Number(v)
        if (!Number.isFinite(n) || n < 0) return 0
        return Math.floor(n)
      }),
    status: UpworkProposalStatusSchema.default('sent'),
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .refine((d) => d.status !== 'sent' || d.bid_amount_usd != null, {
    message: 'Bid amount is required when sending a proposal',
    path: ['bid_amount_usd'],
  })
export type UpworkProposalCreateInput = z.infer<typeof UpworkProposalCreateInputSchema>

export const UpworkProposalStatusChangeInputSchema = z.object({
  status: UpworkProposalStatusSchema,
})
export type UpworkProposalStatusChangeInput = z.infer<
  typeof UpworkProposalStatusChangeInputSchema
>

// ─── Connects ledger ───────────────────────────────────────────────

export const UpworkConnectsTypeSchema = z.enum([
  'purchase',
  'grant',
  'refund',
  'spend',
  'adjustment',
])
export type UpworkConnectsType = z.infer<typeof UpworkConnectsTypeSchema>

export const UpworkConnectsLogEntrySchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  type: UpworkConnectsTypeSchema,
  amount: z.number().int(),
  signed_amount: z.number().int(),
  balance_after: z.number().int(),
  related_proposal_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  occurred_at: z.string(),
  recorded_by_user_id: z.string().uuid().nullable(),
  created_at: z.string(),
})
export type UpworkConnectsLogEntry = z.infer<typeof UpworkConnectsLogEntrySchema>

export const UpworkConnectsEntryInputSchema = z.object({
  type: z.enum(['purchase', 'grant', 'refund', 'adjustment']),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isFinite(n) || n === 0) return 0
      return Math.abs(Math.floor(n))
    })
    .refine((n) => n > 0, { message: 'Amount must be a positive integer' }),
  /** For 'adjustment' rows the user picks the sign. Other types ignore this. */
  direction: z.enum(['add', 'subtract']).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  occurred_at: z.string().optional().nullable(),
})
export type UpworkConnectsEntryInput = z.infer<typeof UpworkConnectsEntryInputSchema>
