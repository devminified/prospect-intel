import { z } from 'zod'

export const EmailOpenSchema = z.object({
  id: z.string().uuid().optional(),
  opened_at: z.string(),
  is_probably_mpp: z.boolean(),
  is_probably_self: z.boolean(),
})
export type EmailOpen = z.infer<typeof EmailOpenSchema>

export const ReplyClassificationSchema = z.enum([
  'interested',
  'not_interested',
  'ooo',
  'unsubscribe',
  'question',
])
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>

export const EmailReplySchema = z.object({
  id: z.string().uuid().optional(),
  received_at: z.string().nullable(),
  classification: z.string().nullable(),
})
export type EmailReply = z.infer<typeof EmailReplySchema>

export const SentEmailSchema = z.object({
  id: z.string().uuid(),
  pitch_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid(),
  message_id: z.string().nullable().optional(),
  thread_id: z.string().nullable().optional(),
  subject: z.string().nullable(),
  to_email: z.string().nullable(),
  sent_at: z.string().nullable(),
  bounced: z.boolean().nullable(),
  bounce_reason: z.string().nullable().optional(),
  email_opens: z.array(EmailOpenSchema).default([]),
  email_replies: z.array(EmailReplySchema).default([]),
})
export type SentEmail = z.infer<typeof SentEmailSchema>
