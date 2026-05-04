import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  UpworkConversation,
  UpworkConversationStatus,
  UpworkMessage,
  UpworkMessageDirection,
} from '@/lib/types'

/** Typed Supabase queries for conversations + messages. */

export async function listForProfile(
  profileId: string,
  opts: { status?: UpworkConversationStatus | 'any'; limit?: number } = {}
): Promise<UpworkConversation[]> {
  let q = supabaseAdmin
    .from('upwork_conversations')
    .select('*')
    .eq('profile_id', profileId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status && opts.status !== 'any') q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new Error(`db.upwork.conversations.listForProfile: ${error.message}`)
  return (data as UpworkConversation[]) ?? []
}

export async function getById(conversationId: string): Promise<UpworkConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.conversations.getById: ${error.message}`)
  return (data as UpworkConversation | null) ?? null
}

export async function findByProposal(proposalId: string): Promise<UpworkConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_conversations')
    .select('*')
    .eq('proposal_id', proposalId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.conversations.findByProposal: ${error.message}`)
  return (data as UpworkConversation | null) ?? null
}

export async function insert(input: {
  profile_id: string
  proposal_id: string | null
  client_id: string | null
  title: string | null
  status: UpworkConversationStatus
  notes: string | null
}): Promise<UpworkConversation> {
  const { data, error } = await supabaseAdmin
    .from('upwork_conversations')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.conversations.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkConversation
}

export async function update(
  conversationId: string,
  patch: Partial<Omit<UpworkConversation, 'id' | 'profile_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_conversations')
    .update(patch)
    .eq('id', conversationId)
  if (error) throw new Error(`db.upwork.conversations.update: ${error.message}`)
}

// ─── Messages ──────────────────────────────────────────────────────

export async function listMessages(conversationId: string): Promise<UpworkMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('occurred_at', { ascending: true })
  if (error) throw new Error(`db.upwork.messages.list: ${error.message}`)
  return (data as UpworkMessage[]) ?? []
}

export async function appendMessage(input: {
  conversation_id: string
  direction: UpworkMessageDirection
  body: string
  recorded_by_user_id: string
  occurred_at: string | null
}): Promise<UpworkMessage> {
  const { data, error } = await supabaseAdmin
    .from('upwork_messages')
    .insert({
      conversation_id: input.conversation_id,
      direction: input.direction,
      body: input.body,
      recorded_by_user_id: input.recorded_by_user_id,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.messages.append: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkMessage
}
