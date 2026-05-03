import { z } from 'zod'

/**
 * The `status` column on `prospects` — set by the cron pipeline as work
 * progresses. Distinct from `outreach_status` which is the user's
 * manual annotation.
 */
export const ProspectStatusSchema = z.enum([
  'new',
  'enriched',
  'analyzed',
  'ready',
  'contacted',
  'replied',
  'rejected',
  'failed',
  'filtered_out',
])
export type ProspectStatus = z.infer<typeof ProspectStatusSchema>

/**
 * Manual outreach annotation — user controls this from the prospect
 * detail page or via DnD on the kanban (Phase 9+).
 */
export const OutreachStatusSchema = z.enum([
  'calling',
  'no_answer',
  'voicemail',
  'call_ended',
  'follow_up',
  'qualified',
  'not_interested',
  'do_not_contact',
])
export type OutreachStatus = z.infer<typeof OutreachStatusSchema>

export const ProspectSchema = z.object({
  id: z.string().uuid(),
  batch_id: z.string().uuid(),
  name: z.string(),
  status: ProspectStatusSchema,
  outreach_status: OutreachStatusSchema.nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  email_source: z.string().nullable().optional(),
  email_confidence: z.string().nullable().optional(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  place_id: z.string().nullable().optional(),
  hours_json: z.unknown().nullable().optional(),
  categories_text: z.string().nullable().optional(),
  filter_reason: z.string().nullable().optional(),
  last_viewed_at: z.string().nullable(),
  assigned_to: z.string().uuid().nullable(),
  assigned_at: z.string().nullable(),
  created_at: z.string(),
})
export type Prospect = z.infer<typeof ProspectSchema>

/** Subset used by /leads list rows — lighter than the full prospect. */
export const ProspectLeadRowSchema = ProspectSchema.pick({
  id: true,
  name: true,
  status: true,
  outreach_status: true,
  website: true,
  rating: true,
  review_count: true,
  last_viewed_at: true,
  assigned_to: true,
  batch_id: true,
  created_at: true,
})
export type ProspectLeadRow = z.infer<typeof ProspectLeadRowSchema>

/**
 * Derived per-prospect outreach stage — computed from sent_emails +
 * email_opens (real / non-MPP / non-self) + email_replies. Lives on
 * the row at render time, not in the DB.
 */
export const OutreachStateSchema = z.object({
  has_pitch: z.boolean(),
  has_sent: z.boolean(),
  has_real_open: z.boolean(),
  has_reply: z.boolean(),
  recommended_channel: z.enum(['phone', 'email', 'either']).nullable(),
  last_activity_at: z.string().nullable().optional(),
})
export type OutreachState = z.infer<typeof OutreachStateSchema>
