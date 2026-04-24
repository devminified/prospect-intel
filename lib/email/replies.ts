import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { listFolders, listMessages, refreshAccessToken } from './zoho'
import { replyClassificationPrompt } from '@/lib/prompts'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// How far back to look on first poll. After that, we advance last_poll_at and only fetch new.
const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

// Hard cap on messages scanned per poll, to stay under Vercel's 60s cron budget
const MAX_MESSAGES_PER_POLL = 50

type Classification = 'interested' | 'not_interested' | 'ooo' | 'unsubscribe' | 'question'

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['interested', 'not_interested', 'ooo', 'unsubscribe', 'question'],
    },
  },
  required: ['classification'],
  additionalProperties: false,
}

export interface PollReplyResult {
  account_id: string
  scanned: number
  matched: number
  classified: number
  new_replies: number
  errors: string[]
}

/**
 * Poll one Zoho account's inbox for replies to our sent emails.
 *
 * Match strategy: case-insensitive fromAddress == our sent_emails.to_email for
 * this account. Dedupes by raw_message_id (unique index in DB).
 *
 * On match: insert email_replies row, flip pitches.status='replied' and
 * prospects.status='replied'. Classifier is best-effort — if it fails we
 * still record the reply with classification=null.
 */
export async function pollReplies(accountId: string): Promise<PollReplyResult> {
  const result: PollReplyResult = {
    account_id: accountId,
    scanned: 0,
    matched: 0,
    classified: 0,
    new_replies: 0,
    errors: [],
  }

  const { data: account, error: accErr } = await supabaseAdmin
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()
  if (accErr || !account) throw new Error(`Account not found: ${accountId}`)

  // 1. Refresh token if close to expiry
  let accessToken = account.access_token as string
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000) {
    if (!account.refresh_token) {
      throw new Error('Zoho token expired — no refresh token on file. Reconnect.')
    }
    const refreshed = await refreshAccessToken(account.refresh_token)
    accessToken = refreshed.access_token
    const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString()
    await supabaseAdmin
      .from('email_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: newExpires,
        ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      })
      .eq('id', accountId)
  }

  // 2. Resolve inbox folder id (cache to DB on first run)
  let folderId = account.inbox_folder_id as string | null
  if (!folderId) {
    const folders = await listFolders(accessToken, account.api_domain, account.zoho_account_id)
    const inbox = folders.find((f) => /^inbox$/i.test(f.folderName))
    if (!inbox) throw new Error('Inbox folder not found in Zoho folders list')
    folderId = inbox.folderId
    await supabaseAdmin
      .from('email_accounts')
      .update({ inbox_folder_id: folderId })
      .eq('id', accountId)
  }

  // 3. Establish the poll window
  const pollSince = account.last_poll_at
    ? new Date(account.last_poll_at).getTime()
    : Date.now() - INITIAL_LOOKBACK_MS

  // 4. List messages
  const messages = await listMessages(
    accessToken,
    account.api_domain,
    account.zoho_account_id,
    folderId,
    MAX_MESSAGES_PER_POLL
  )
  result.scanned = messages.length

  // Filter to only messages received after our last-poll high-water mark
  const newMessages = messages.filter((m) => m.receivedTimeMs > pollSince)

  // 5. Build a lookup of "who we've sent to from this account" so we can match quickly
  const senderEmails = Array.from(new Set(newMessages.map((m) => m.fromAddress).filter(Boolean)))
  let sentMap = new Map<string, { id: string; pitch_id: string; contact_id: string | null }>()
  if (senderEmails.length) {
    const { data: sentRows } = await supabaseAdmin
      .from('sent_emails')
      .select('id, pitch_id, contact_id, to_email')
      .eq('account_id', accountId)
      .in('to_email', senderEmails)
    for (const r of (sentRows ?? []) as any[]) {
      // most recent sent_email wins if we sent to the same address twice
      const key = String(r.to_email).toLowerCase()
      if (!sentMap.has(key)) {
        sentMap.set(key, { id: r.id, pitch_id: r.pitch_id, contact_id: r.contact_id })
      }
    }
  }

  // 6. Process each matched message
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null

  for (const msg of newMessages) {
    const match = sentMap.get(msg.fromAddress)
    if (!match) continue
    result.matched++

    // Classify (best-effort)
    let classification: Classification | null = null
    if (anthropic && msg.summary) {
      try {
        classification = await classifyReply(anthropic, {
          snippet: msg.summary,
          sender_email: msg.fromAddress,
          original_subject: msg.subject,
        })
        result.classified++
      } catch (e: any) {
        result.errors.push(`classify ${msg.messageId}: ${e?.message ?? e}`)
      }
    }

    // Insert email_replies (on raw_message_id conflict, skip — dedupe across polls)
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('email_replies')
      .insert({
        sent_email_id: match.id,
        received_at: new Date(msg.receivedTimeMs).toISOString(),
        snippet: msg.summary.slice(0, 2000),
        classification,
        raw_message_id: msg.messageId,
      })
      .select('id')
      .maybeSingle()

    if (insErr) {
      // Duplicate = 23505. Silently skip.
      if (!/duplicate key value/i.test(insErr.message)) {
        result.errors.push(`insert ${msg.messageId}: ${insErr.message}`)
      }
      continue
    }
    if (!inserted) continue // already existed via unique index

    result.new_replies++

    // Flip pitch + prospect status to replied
    await supabaseAdmin
      .from('pitches')
      .update({ status: 'replied' })
      .eq('id', match.pitch_id)

    const { data: pitchRow } = await supabaseAdmin
      .from('pitches')
      .select('prospect_id')
      .eq('id', match.pitch_id)
      .maybeSingle()
    if (pitchRow?.prospect_id) {
      await supabaseAdmin
        .from('prospects')
        .update({ status: 'replied' })
        .eq('id', pitchRow.prospect_id)
    }
  }

  // 7. Advance poll high-water mark to now
  await supabaseAdmin
    .from('email_accounts')
    .update({ last_poll_at: new Date().toISOString() })
    .eq('id', accountId)

  return result
}

async function classifyReply(
  client: Anthropic,
  input: { snippet: string; sender_email: string; original_subject: string | null }
): Promise<Classification> {
  const prompt = replyClassificationPrompt({
    snippet: input.snippet,
    sender_email: input.sender_email,
    original_subject: input.original_subject,
  })

  const res = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    temperature: 0,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  } as any)

  const text = res.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
  const parsed = JSON.parse(text) as { classification: Classification }
  return parsed.classification
}
