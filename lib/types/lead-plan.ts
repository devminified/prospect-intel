import { z } from 'zod'

export const LeadPlanStatusSchema = z.enum(['draft', 'executed'])
export type LeadPlanStatus = z.infer<typeof LeadPlanStatusSchema>

export const LeadPlanItemSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  city: z.string(),
  category: z.string(),
  count: z.number().int(),
  reasoning: z.string(),
  priority: z.number().int(),
  estimated_cost_usd: z.number(),
  batch_id: z.string().uuid().nullable(),
  executed_at: z.string().nullable(),
})
export type LeadPlanItem = z.infer<typeof LeadPlanItemSchema>

export const LeadPlanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  team_id: z.string().uuid(),
  plan_date: z.string(),
  status: LeadPlanStatusSchema,
  rationale_json: z.unknown().nullable(),
  executed_at: z.string().nullable(),
})
export type LeadPlan = z.infer<typeof LeadPlanSchema>
