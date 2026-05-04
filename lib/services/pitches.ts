import { supabaseAdmin } from '@/lib/supabase/server'
import { PitchStatusSchema, type PitchStatus, type Role } from '@/lib/types'
import { canSendEmail, roleForbiddenMessage } from '@/lib/rbac'
import { generatePitch as legacyGeneratePitch } from '@/lib/pipeline/pitch'
import { refreshAccessToken, sendMessage } from '@/lib/email/zoho'
import { buildEmailHtml, b64url } from '@/lib/email/templates'
import { requireProspectAccess, requireTeamAccess } from './access'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors'

const MIN_SEND_SPACING_MS = 30_000

/**
 * Update pitch fields for a prospect. Today this is bundled into the
 * /api/prospects/:id PATCH route alongside prospect_status / outreach_status,
 * so the service mirrors that bundling. Future cleanup could extract a
 * dedicated /api/pitches/:id route if multiple consumers need it.
 */
export async function update(
  userId: string,
  prospectId: string,
  patch: { edited_body?: string; status?: string }
): Promise<void> {
  await requireProspectAccess(userId, prospectId)

  const update: Record<string, unknown> = {}
  if (patch.edited_body !== undefined) {
    if (typeof patch.edited_body !== 'string') {
      throw new ValidationError('pitch_edited_body must be a string')
    }
    update.edited_body = patch.edited_body
  }
  if (patch.status !== undefined) {
    const parsed = PitchStatusSchema.safeParse(patch.status)
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid pitch_status. Allowed: ${PitchStatusSchema.options.join(', ')}`
      )
    }
    const status: PitchStatus = parsed.data
    update.status = status
    if (status === 'approved') update.approved_at = new Date().toISOString()
    if (status === 'sent') update.sent_at = new Date().toISOString()
  }
  if (Object.keys(update).length === 0) return

  const { error } = await supabaseAdmin
    .from('pitches')
    .update(update)
    .eq('prospect_id', prospectId)
  if (error) throw new Error(`pitches.update: ${error.message}`)
}

/**
 * Re-run Sonnet pitch generation for a prospect. Owner / manager / closer
 * only — the people actually shipping cold emails are the ones who
 * iterate copy, not lead-gens or cold-callers.
 */
export async function regenerate(userId: string, prospectId: string): Promise<void> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canSendEmail(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'regenerate pitch copy'))
  }
  await legacyGeneratePitch(prospectId)
}

interface ExportResult {
  filename: string
  csv: string
}

const CSV_COLUMNS = [
  'name',
  'website',
  'email',
  'subject',
  'body',
  'phone',
  'recommended_channel',
  'phone_fit_score',
  'email_fit_score',
  'phone_script',
] as const

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Build the approved-pitches CSV for one batch. The route returns the
 * { filename, csv } result with the appropriate Content-Disposition
 * headers; auth, ownership, and column escaping live here.
 */
export async function exportApprovedCsv(userId: string, batchId: string): Promise<ExportResult> {
  if (!batchId) throw new ValidationError('Missing batch_id')

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('batches')
    .select('id, city, category, team_id')
    .eq('id', batchId)
    .single()
  if (batchError || !batch) throw new ValidationError('Batch not found')

  // Ownership check via team membership.
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', (batch as any).team_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!membership) {
    throw new ForbiddenError('This batch belongs to a different team')
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('pitches')
    .select(
      `
      subject,
      body,
      edited_body,
      prospects!inner(
        id,
        name,
        website,
        email,
        phone,
        batch_id,
        channel_recommendations(recommended_channel, phone_fit_score, email_fit_score, phone_script)
      )
    `
    )
    .eq('status', 'approved')
    .eq('prospects.batch_id', batchId)
  if (rowsError) throw new Error(`Query failed: ${rowsError.message}`)

  const csvLines: string[] = [CSV_COLUMNS.join(',')]
  for (const row of (rows ?? []) as any[]) {
    const p = row.prospects ?? {}
    const rec = Array.isArray(p.channel_recommendations)
      ? p.channel_recommendations[0] ?? null
      : p.channel_recommendations ?? null
    const bodyToSend: string = row.edited_body ?? row.body ?? ''
    const values = [
      p.name ?? '',
      p.website ?? '',
      p.email ?? '',
      row.subject ?? '',
      bodyToSend,
      p.phone ?? '',
      rec?.recommended_channel ?? '',
      rec?.phone_fit_score != null ? String(rec.phone_fit_score) : '',
      rec?.email_fit_score != null ? String(rec.email_fit_score) : '',
      rec?.phone_script ?? '',
    ]
    csvLines.push(values.map(csvEscape).join(','))
  }

  const csv = csvLines.join('\n') + '\n'
  const filename = `prospect-intel-${(batch as any).category}-${(batch as any).city}-${batchId.slice(0, 8)}.csv`.replace(
    /[^a-z0-9.\-]+/gi,
    '-'
  )
  return { filename, csv }
}

/**
 * Send a cold-outreach email via Zoho. The big one — handles auth +
 * RBAC + recipient resolution (Apollo primary > any Apollo > business
 * scrape), unsub check, daily cap + spacing, token refresh, MIME
 * tracking pixel + unsubscribe link, and bounce-on-failure.
 *
 * Owner / manager / closer only — only the people who actually ship
 * emails get to spend the daily quota.
 */
export async function send(
  userId: string,
  pitchId: string,
  appOrigin: string
): Promise<{ ok: true; sent_email_id: string }> {
  // 1. Role gate (team-level — any team).
  const { role } = await requireTeamAccess(userId)
  if (!canSendEmail(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'send cold-outreach emails'))
  }

  // 2. Load pitch + ownership check via team chain.
  const { data: pitch, error: pitchErr } = await supabaseAdmin
    .from('pitches')
    .select(
      `
      id, subject, body, edited_body, status,
      prospects!inner(
        id,
        name,
        email,
        email_source,
        email_confidence,
        batches!inner(team_id),
        contacts(id, full_name, email, is_primary)
      )
    `
    )
    .eq('id', pitchId)
    .single()
  if (pitchErr || !pitch) throw new NotFoundError('Pitch not found')
  const prospect: any = (pitch as any).prospects
  const prospectTeamId: string | undefined = prospect?.batches?.team_id
  if (!prospectTeamId) throw new ForbiddenError('Pitch not in your team')
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', prospectTeamId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!membership) throw new ForbiddenError('Pitch not in your team')

  // 3. Pick recipient (Apollo primary > Apollo any > business email).
  const contacts: any[] = prospect?.contacts ?? []
  const apolloPrimary =
    contacts.find((c) => c.is_primary && c.email) ?? contacts.find((c) => c.email)
  const businessEmail = (prospect.email as string | null) ?? null
  let recipientEmail: string | null = null
  let recipientContactId: string | null = null
  if (apolloPrimary?.email) {
    recipientEmail = apolloPrimary.email
    recipientContactId = apolloPrimary.id
  } else if (businessEmail) {
    recipientEmail = businessEmail
  }
  if (!recipientEmail) {
    throw new ValidationError(
      'No email available for this prospect — no Apollo contact and no business email scraped from the website.'
    )
  }

  // 4. Unsub list check.
  const { data: unsub } = await supabaseAdmin
    .from('email_unsubs')
    .select('id')
    .eq('contact_email', recipientEmail.toLowerCase())
    .maybeSingle()
  if (unsub) {
    throw new ValidationError(`${recipientEmail} has unsubscribed — cannot send.`)
  }

  // 5. Load sender's Zoho account.
  const { data: account, error: accErr } = await supabaseAdmin
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'zoho')
    .maybeSingle()
  if (accErr || !account) {
    throw new ValidationError('No Zoho account connected. Go to Settings → Email to connect one.')
  }

  // 6. Daily cap + spacing gates.
  const today = new Date().toISOString().slice(0, 10)
  let sendsToday = (account as any).sends_today ?? 0
  if ((account as any).sends_reset_at !== today) sendsToday = 0
  if (sendsToday >= ((account as any).daily_send_cap ?? 30)) {
    throw new ConflictError(`Daily cap reached (${(account as any).daily_send_cap}). Try again tomorrow.`)
  }
  if ((account as any).last_send_at) {
    const elapsed = Date.now() - new Date((account as any).last_send_at).getTime()
    if (elapsed < MIN_SEND_SPACING_MS) {
      const wait = Math.ceil((MIN_SEND_SPACING_MS - elapsed) / 1000)
      throw new ConflictError(`Too soon — wait ${wait}s before the next send.`)
    }
  }

  // 7. Token refresh if close to expiry.
  let accessToken = (account as any).access_token as string
  const expiresAt = (account as any).token_expires_at
    ? new Date((account as any).token_expires_at).getTime()
    : 0
  if (expiresAt - Date.now() < 60_000) {
    if (!(account as any).refresh_token) {
      throw new ValidationError('Zoho token expired and no refresh token. Reconnect Zoho.')
    }
    const refreshed = await refreshAccessToken((account as any).refresh_token)
    accessToken = refreshed.access_token
    const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString()
    await supabaseAdmin
      .from('email_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: newExpires,
        ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      })
      .eq('id', (account as any).id)
  }

  // 8. Build body + subject.
  const bodyText = ((pitch.edited_body as string | null) ?? (pitch.body as string | null) ?? '').trim()
  if (!bodyText) throw new ValidationError('Pitch has no body')
  const subject = (pitch.subject as string | null)?.trim() || `A quick thought on ${prospect.name}`

  // 9. Pre-create sent_emails row to anchor the tracking pixel.
  const { data: sentRow, error: insErr } = await supabaseAdmin
    .from('sent_emails')
    .insert({
      pitch_id: pitchId,
      contact_id: recipientContactId,
      account_id: (account as any).id,
      subject,
      to_email: recipientEmail,
    })
    .select('id')
    .single()
  if (insErr || !sentRow) {
    throw new Error(`Failed to create send record: ${insErr?.message}`)
  }

  const unsubToken = recipientContactId
    ? b64url(`contact:${recipientContactId}`)
    : b64url(`email:${recipientEmail}`)

  const html = buildEmailHtml({
    bodyText,
    appOrigin,
    sentEmailId: sentRow.id,
    unsubToken,
    signature: {
      sender_name: (account as any).display_name,
      sender_title: (account as any).sender_title,
      sender_company: (account as any).sender_company,
      calendly_url: (account as any).calendly_url,
      website_url: (account as any).website_url,
    },
  })

  // 10. Ship it.
  try {
    const result = await sendMessage(
      accessToken,
      (account as any).api_domain,
      (account as any).zoho_account_id,
      {
        fromAddress: (account as any).email,
        toAddress: recipientEmail,
        subject,
        htmlContent: html,
      }
    )

    await supabaseAdmin
      .from('sent_emails')
      .update({
        message_id: result.messageId,
        thread_id: result.threadId,
        body_html: html,
      })
      .eq('id', sentRow.id)

    await supabaseAdmin
      .from('email_accounts')
      .update({
        sends_today: sendsToday + 1,
        sends_reset_at: today,
        last_send_at: new Date().toISOString(),
      })
      .eq('id', (account as any).id)

    await supabaseAdmin
      .from('pitches')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', pitchId)

    await supabaseAdmin
      .from('prospects')
      .update({ status: 'contacted' })
      .eq('id', prospect.id)

    return { ok: true, sent_email_id: sentRow.id }
  } catch (e: any) {
    await supabaseAdmin
      .from('sent_emails')
      .update({ bounced: true, bounce_reason: e?.message ?? 'send failed' })
      .eq('id', sentRow.id)
    throw new Error(e?.message ?? 'Send failed')
  }
}
