import { z } from 'zod'
import type { Note } from './note'
import type { Followup } from './followup'

/**
 * Aggregate shape consumed by the prospect detail page (`app/(dashboard)/prospects/[id]/page.tsx`).
 *
 * Per CONVENTIONS § Layered architecture: types live here, not inline in
 * the page. The page composes data from many sources (prospect row,
 * enrichment, analysis, pitch, contacts, audit, channel rec, sent emails,
 * notes, follow-ups) and these are the shapes it expects from the
 * server-side `/api/prospects/[id]` route.
 */

/**
 * Page-level pain-point shape (richer than the slim DB row in
 * `enrichment.ts`'s `PainPointSchema` — this matches what
 * `/api/prospects/[id]` returns after Haiku has expanded the
 * solution_category / effort / impact rubric on top of the stored row).
 */
export const DetailPainPointSchema = z.object({
  pain: z.string(),
  evidence: z.string(),
  solution_category: z.string(),
  effort: z.string(),
  impact: z.string(),
})
export type DetailPainPoint = z.infer<typeof DetailPainPointSchema>

export const ProspectContactSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  department: z.string().nullable(),
  email: z.string().nullable(),
  email_confidence: z.string().nullable(),
  phone: z.string().nullable(),
  phone_source: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  is_primary: z.boolean(),
})
export type ProspectContact = z.infer<typeof ProspectContactSchema>

export const ChannelRecommendationViewSchema = z.object({
  phone_fit_score: z.number(),
  email_fit_score: z.number(),
  recommended_channel: z.enum(['phone', 'email', 'either']),
  reasoning: z.string().nullable(),
  phone_script: z.string().nullable(),
  generated_at: z.string().nullable(),
})
export type ChannelRecommendationView = z.infer<typeof ChannelRecommendationViewSchema>

const EmailOpenSchema = z.object({
  opened_at: z.string(),
  is_probably_mpp: z.boolean(),
  is_probably_self: z.boolean(),
})
const EmailReplyLiteSchema = z.object({
  received_at: z.string().nullable(),
  classification: z.string().nullable(),
})

export const SentEmailDetailSchema = z.object({
  id: z.string().uuid(),
  to_email: z.string(),
  sent_at: z.string(),
  bounced: z.boolean(),
  bounce_reason: z.string().nullable(),
  email_opens: z.array(EmailOpenSchema),
  email_replies: z.array(EmailReplyLiteSchema),
})
export type SentEmailDetail = z.infer<typeof SentEmailDetailSchema>

export const SentEmailLiteSchema = z.object({
  id: z.string().uuid(),
  to_email: z.string().nullable(),
  sent_at: z.string().nullable(),
  bounced: z.boolean().nullable(),
  email_opens: z.array(EmailOpenSchema),
  email_replies: z.array(EmailReplyLiteSchema),
})
export type SentEmailLite = z.infer<typeof SentEmailLiteSchema>

export const ProspectActivityEventSchema = z.object({
  ts: z.string(),
  icon: z.string(),
  text: z.string(),
  cls: z.string().optional(),
})
export type ProspectActivityEvent = z.infer<typeof ProspectActivityEventSchema>

/**
 * Page-level visibility-audit shape (richer than the slim DB row in
 * `enrichment.ts` — this matches what `/api/prospects/[id]` returns:
 * the audit row joined with SerpApi rank, Meta Ad Library counts, press
 * mentions, and social-follower stats).
 */
export const DetailVisibilityAuditSchema = z.object({
  gmb_rating: z.number().nullable(),
  gmb_review_count: z.number().nullable(),
  gmb_photo_count: z.number().nullable(),
  gmb_review_highlights_json: z.array(z.string()).nullable(),
  social_links_json: z.record(z.string(), z.string().nullable()).nullable(),
  instagram_followers: z.number().nullable(),
  facebook_followers: z.number().nullable(),
  serp_rank_main: z.number().nullable(),
  serp_rank_brand: z.number().nullable(),
  meta_ads_running: z.boolean().nullable(),
  meta_ads_count: z.number().nullable(),
  press_mentions_count: z.number().nullable(),
  press_mentions_sample_json: z
    .array(
      z.object({
        title: z.string(),
        source: z.string().optional(),
        link: z.string().optional(),
        date: z.string().optional(),
      })
    )
    .nullable(),
  visibility_summary: z.string().nullable(),
})
export type DetailVisibilityAudit = z.infer<typeof DetailVisibilityAuditSchema>

const ProspectHeaderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  batch_id: z.string().uuid(),
  status: z.string(),
  outreach_status: z.string().nullable(),
  assigned_to: z.string().nullable(),
  assigned_at: z.string().nullable(),
  last_viewed_at: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  categories_text: z.string().nullable(),
  filter_reason: z.string().nullable(),
})

const EnrichmentSchema = z.object({
  tech_stack_json: z.unknown(),
  has_online_booking: z.boolean().nullable(),
  has_ecommerce: z.boolean().nullable(),
  has_chat: z.boolean().nullable(),
  has_contact_form: z.boolean().nullable(),
  is_mobile_friendly: z.boolean().nullable(),
  ssl_valid: z.boolean().nullable(),
  fetch_error: z.string().nullable(),
})

const AnalysisSchema = z.object({
  pain_points_json: z.array(DetailPainPointSchema).nullable(),
  opportunity_score: z.number().nullable(),
  best_angle: z.string().nullable(),
})

const PitchSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  edited_body: z.string().nullable(),
  status: z.string(),
})

export interface ProspectDetail {
  prospect: z.infer<typeof ProspectHeaderSchema>
  enrichment: z.infer<typeof EnrichmentSchema> | null
  analysis: z.infer<typeof AnalysisSchema> | null
  pitch: z.infer<typeof PitchSchema> | null
  contacts: ProspectContact[]
  audit: DetailVisibilityAudit | null
  recommendation: ChannelRecommendationView | null
  sentEmail: SentEmailDetail | null
  notes: Note[]
  followups: Followup[]
  allSentEmails: SentEmailLite[]
  prospectCreatedAt: string | null
}
