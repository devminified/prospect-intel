import { z } from 'zod'

/**
 * Outbound sending account configured under /settings/email — backed by
 * the `email_accounts` table. Right now Zoho is the only supported
 * provider; cap fields enforce daily-send pacing per CLAUDE.md § 6
 * (Phase 4B).
 */
export const EmailAccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  display_name: z.string().nullable(),
  daily_send_cap: z.number().int(),
  sends_today: z.number().int(),
  sends_reset_at: z.string().nullable(),
  last_send_at: z.string().nullable(),
  created_at: z.string(),
  sender_title: z.string().nullable(),
  sender_company: z.string().nullable(),
  calendly_url: z.string().nullable(),
  website_url: z.string().nullable(),
})
export type EmailAccount = z.infer<typeof EmailAccountSchema>

/** Patch shape for the signature mutation on the /settings/email page. */
export interface EmailSignaturePatch {
  sender_title: string | null
  sender_company: string | null
  calendly_url: string | null
  website_url: string | null
}
