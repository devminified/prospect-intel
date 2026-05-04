import { z } from 'zod'

// ─── Conversations ─────────────────────────────────────────────────

export const UpworkConversationStatusSchema = z.enum([
  'waiting_reply',
  'replying',
  'interviewing',
  'negotiating',
  'closed_won',
  'closed_lost',
  'stale',
])
export type UpworkConversationStatus = z.infer<typeof UpworkConversationStatusSchema>

export const UpworkMessageDirectionSchema = z.enum(['sent', 'received'])
export type UpworkMessageDirection = z.infer<typeof UpworkMessageDirectionSchema>

/**
 * Direction of the most recent message in a thread — denormalized onto
 * the conversation row for fast "ball's in our court" sorting. Read as
 * "the last message was from {us | them}" — distinct from MessageDirection
 * since us/them frames cleaner than sent/received in the list UI.
 */
export const UpworkLastMessageFromSchema = z.enum(['us', 'them'])
export type UpworkLastMessageFrom = z.infer<typeof UpworkLastMessageFromSchema>

export const UpworkConversationSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  proposal_id: z.string().uuid().nullable(),
  client_id: z.string().uuid().nullable(),
  title: z.string().nullable(),
  status: UpworkConversationStatusSchema,
  status_changed_at: z.string(),
  last_message_at: z.string().nullable(),
  last_message_from: UpworkLastMessageFromSchema.nullable(),
  needs_reply: z.boolean(),
  notes: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkConversation = z.infer<typeof UpworkConversationSchema>

export const UpworkConversationCreateInputSchema = z.object({
  profile_id: z.string().uuid('profile_id required'),
  proposal_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(500).optional().nullable(),
  status: UpworkConversationStatusSchema.optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
})
export type UpworkConversationCreateInput = z.infer<typeof UpworkConversationCreateInputSchema>

export const UpworkConversationUpdateInputSchema = z.object({
  status: UpworkConversationStatusSchema.optional(),
  needs_reply: z.boolean().optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  title: z.string().trim().max(500).optional().nullable(),
})
export type UpworkConversationUpdateInput = z.infer<typeof UpworkConversationUpdateInputSchema>

// ─── Messages ──────────────────────────────────────────────────────

export const UpworkMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  direction: UpworkMessageDirectionSchema,
  body: z.string(),
  recorded_by_user_id: z.string().uuid().nullable(),
  occurred_at: z.string(),
  attachments_json: z.unknown().nullable(),
  created_at: z.string(),
})
export type UpworkMessage = z.infer<typeof UpworkMessageSchema>

export const UpworkMessageAppendInputSchema = z.object({
  direction: UpworkMessageDirectionSchema,
  body: z.string().trim().min(1, 'Message body required').max(20000),
  occurred_at: z.string().optional().nullable(),
})
export type UpworkMessageAppendInput = z.infer<typeof UpworkMessageAppendInputSchema>

// ─── Aggregate detail ──────────────────────────────────────────────

export interface UpworkConversationDetail {
  conversation: UpworkConversation
  messages: UpworkMessage[]
  /** Caller's role on the parent profile, for UI gating. */
  can_manage: boolean
}
