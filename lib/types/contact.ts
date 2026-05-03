import { z } from 'zod'

export const SeniorityLevelSchema = z.enum([
  'founder',
  'owner',
  'c_suite',
  'vp',
  'director',
  'manager',
  'other',
])
export type SeniorityLevel = z.infer<typeof SeniorityLevelSchema>

export const PhoneSourceSchema = z.enum(['gmb_business', 'lusha_direct', 'manual', 'apollo_legacy'])
export type PhoneSource = z.infer<typeof PhoneSourceSchema>

export const EmailConfidenceSchema = z.enum(['verified', 'guessed', 'unverified'])
export type EmailConfidence = z.infer<typeof EmailConfidenceSchema>

export const ContactSchema = z.object({
  id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  full_name: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  department: z.string().nullable(),
  email: z.string().nullable(),
  email_confidence: z.string().nullable(),
  email_revealed_at: z.string().nullable().optional(),
  phone: z.string().nullable(),
  phone_source: z.string().nullable(),
  phone_revealed_at: z.string().nullable().optional(),
  phone_request_id: z.string().nullable().optional(),
  linkedin_url: z.string().nullable(),
  apollo_person_id: z.string().nullable().optional(),
  is_primary: z.boolean(),
  created_at: z.string().optional(),
})
export type Contact = z.infer<typeof ContactSchema>

/**
 * PATCH input on /api/prospects/:id/contacts/:contactId. Every field is
 * optional; the route applies whichever ones are present. linkedin_url
 * has format validation since Lusha matching depends on it being usable.
 */
export const ContactPatchInputSchema = z.object({
  linkedin_url: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v === '' || /linkedin\.com\/(in|pub)\//i.test(v),
      { message: 'Not a valid LinkedIn profile URL — must contain linkedin.com/in/' }
    ),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  phone: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v === '' || /[\d]{6,}/.test(v.replace(/\D/g, '')),
      { message: 'Phone number looks too short — at least 6 digits required' }
    ),
})
export type ContactPatchInput = z.infer<typeof ContactPatchInputSchema>
