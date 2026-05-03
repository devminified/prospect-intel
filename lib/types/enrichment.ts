import { z } from 'zod'

export const EnrichmentSchema = z.object({
  prospect_id: z.string().uuid(),
  has_online_booking: z.boolean().nullable(),
  has_ecommerce: z.boolean().nullable(),
  has_chat: z.boolean().nullable(),
  has_contact_form: z.boolean().nullable(),
  is_mobile_friendly: z.boolean().nullable(),
  ssl_valid: z.boolean().nullable(),
  tech_stack_json: z.unknown().nullable(),
  scraped_data_json: z.unknown().nullable(),
  fetch_error: z.string().nullable(),
})
export type Enrichment = z.infer<typeof EnrichmentSchema>

export const PainPointSchema = z.object({
  pain: z.string(),
  evidence: z.string().optional(),
  severity: z.enum(['high', 'medium', 'low']).optional(),
})
export type PainPoint = z.infer<typeof PainPointSchema>

export const AnalysisSchema = z.object({
  prospect_id: z.string().uuid(),
  pain_points_json: z.array(PainPointSchema).nullable(),
  opportunity_score: z.number().int().nullable(),
  best_angle: z.string().nullable(),
})
export type Analysis = z.infer<typeof AnalysisSchema>

export const VisibilityAuditSchema = z.object({
  prospect_id: z.string().uuid(),
  gmb_rating: z.number().nullable(),
  gmb_review_count: z.number().int().nullable(),
  social_links_json: z.unknown().nullable(),
  visibility_summary: z.string().nullable(),
})
export type VisibilityAudit = z.infer<typeof VisibilityAuditSchema>
