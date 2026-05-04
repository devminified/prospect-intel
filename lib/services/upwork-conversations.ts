import * as dbConv from '@/lib/db/upwork-conversations'
import * as dbProposals from '@/lib/db/upwork-proposals'
import {
  UpworkConversationCreateInputSchema,
  UpworkConversationStatusSchema,
  UpworkConversationUpdateInputSchema,
  UpworkMessageAppendInputSchema,
} from '@/lib/types'
import type {
  UpworkConversation,
  UpworkConversationDetail,
  UpworkConversationStatus,
  UpworkMessage,
} from '@/lib/types'
import { ConflictError, NotFoundError, ValidationError } from './errors'
import { requireUpworkProfileAccess } from './access'

/**
 * Conversations service. A conversation is a thread between the team
 * (acting through one Upwork profile) and a client. Messages are
 * append-only. Status transitions are loose: any member of the
 * profile can advance the status; the rule is just "use the obvious
 * one" — the schema only enforces that the value is in the enum.
 *
 * RBAC: read + write requires explicit profile membership (or owner
 * via the access helper's bypass). Outbound managers don't get to
 * see Upwork conversations.
 */

export async function listForProfile(
  userId: string,
  profileId: string,
  opts: { status?: string | null } = {}
): Promise<UpworkConversation[]> {
  await requireUpworkProfileAccess(userId, profileId)
  let status: UpworkConversationStatus | 'any' = 'any'
  if (opts.status && opts.status !== 'any') {
    const parsed = UpworkConversationStatusSchema.safeParse(opts.status)
    if (parsed.success) status = parsed.data
  }
  return dbConv.listForProfile(profileId, { status })
}

export async function getDetail(
  userId: string,
  conversationId: string
): Promise<UpworkConversationDetail> {
  const conversation = await dbConv.getById(conversationId)
  if (!conversation) throw new NotFoundError('Conversation not found')
  const access = await requireUpworkProfileAccess(userId, conversation.profile_id)
  const messages = await dbConv.listMessages(conversationId)
  return { conversation, messages, can_manage: access.canManage }
}

/**
 * Create a conversation manually OR convert from a proposal. When
 * proposal_id is supplied and we don't already have a conversation
 * for it, we link them. Sometimes the bidder gets a direct DM
 * without a proposal — that path leaves proposal_id null.
 */
export async function createConversation(
  userId: string,
  raw: unknown
): Promise<UpworkConversation> {
  const parsed = UpworkConversationCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  await requireUpworkProfileAccess(userId, parsed.data.profile_id)

  if (parsed.data.proposal_id) {
    const proposal = await dbProposals.getById(parsed.data.proposal_id)
    if (!proposal) throw new ValidationError('proposal_id does not exist')
    if (proposal.profile_id !== parsed.data.profile_id) {
      throw new ValidationError('Proposal does not belong to that profile')
    }
    const existing = await dbConv.findByProposal(parsed.data.proposal_id)
    if (existing) {
      throw new ConflictError(
        'A conversation already exists for that proposal — open it instead of creating a new one.'
      )
    }
  }

  return dbConv.insert({
    profile_id: parsed.data.profile_id,
    proposal_id: parsed.data.proposal_id ?? null,
    client_id: parsed.data.client_id ?? null,
    title: parsed.data.title ?? null,
    status: parsed.data.status ?? 'replying',
    notes: parsed.data.notes ?? null,
  })
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  raw: unknown
): Promise<void> {
  const conversation = await dbConv.getById(conversationId)
  if (!conversation) throw new NotFoundError('Conversation not found')
  await requireUpworkProfileAccess(userId, conversation.profile_id)
  const parsed = UpworkConversationUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.status !== undefined && parsed.data.status !== conversation.status) {
    patch.status = parsed.data.status
    patch.status_changed_at = new Date().toISOString()
  }
  if (parsed.data.needs_reply !== undefined) patch.needs_reply = parsed.data.needs_reply
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? null
  if (parsed.data.title !== undefined) patch.title = parsed.data.title ?? null
  if (Object.keys(patch).length === 0) return
  await dbConv.update(conversationId, patch)
}

/**
 * Append a message to the thread. Posting a 'sent' message clears
 * needs_reply (we just replied). Posting a 'received' message sets
 * needs_reply (ball's in our court). Updates last_message_at +
 * last_message_from in the same go.
 */
export async function appendMessage(
  userId: string,
  conversationId: string,
  raw: unknown
): Promise<UpworkMessage> {
  const conversation = await dbConv.getById(conversationId)
  if (!conversation) throw new NotFoundError('Conversation not found')
  await requireUpworkProfileAccess(userId, conversation.profile_id)
  const parsed = UpworkMessageAppendInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const occurredAt = parsed.data.occurred_at ?? new Date().toISOString()
  const message = await dbConv.appendMessage({
    conversation_id: conversationId,
    direction: parsed.data.direction,
    body: parsed.data.body,
    recorded_by_user_id: userId,
    occurred_at: occurredAt,
  })

  // Update last_message_* on the conversation for fast list rendering.
  await dbConv.update(conversationId, {
    last_message_at: occurredAt,
    last_message_from: parsed.data.direction === 'sent' ? 'us' : 'them',
    needs_reply: parsed.data.direction === 'received',
  })

  return message
}
