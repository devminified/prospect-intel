import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { refreshAccessToken, sendMessage } from '@/lib/email/zoho'
import { buildEmailHtml, b64url } from '@/lib/email/templates'

const MIN_SEND_SPACING_MS = 30_000

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: pitchId } = await context.params

  // 1. Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  // 2. Load pitch + ownership check + contact
  const { data: pitch, error: pitchErr } = await supabaseAdmin
    .from('pitches')
    .select(`
      id, subject, body, edited_body, status,
      prospects!inner(
        id,
        name,
        batches!inner(user_id),
        contacts(id, full_name, email, is_primary)
      )
    `)
    .eq('id', pitchId)
    .single()

  if (pitchErr || !pitch) {
    return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
  }
  const prospect: any = (pitch as any).prospects
  if (prospect?.batches?.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Pick recipient — primary contact with a revealed email, else any contact with email
  const contacts: any[] = prospect?.contacts ?? []
  const primary = contacts.find((c) => c.is_primary && c.email) ?? contacts.find((c) => c.email)
  if (!primary?.email) {
    return NextResponse.json(
      { error: 'No contact with a revealed email on this prospect. Reveal an email first.' },
      { status: 400 }
    )
  }

  // 4. Check unsub list
  const { data: unsub } = await supabaseAdmin
    .from('email_unsubs')
    .select('id')
    .eq('contact_email', primary.email.toLowerCase())
    .maybeSingle()
  if (unsub) {
    return NextResponse.json(
      { error: `${primary.email} has unsubscribed — cannot send.` },
      { status: 400 }
    )
  }

  // 5. Load user's Zoho account
  const { data: account, error: accErr } = await supabaseAdmin
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'zoho')
    .maybeSingle()
  if (accErr || !account) {
    return NextResponse.json(
      { error: 'No Zoho account connected. Go to Settings → Email to connect one.' },
      { status: 400 }
    )
  }

  // 6. Daily cap + spacing gates
  const today = new Date().toISOString().slice(0, 10)
  let sendsToday = account.sends_today ?? 0
  if (account.sends_reset_at !== today) {
    sendsToday = 0
  }
  if (sendsToday >= (account.daily_send_cap ?? 30)) {
    return NextResponse.json(
      { error: `Daily cap reached (${account.daily_send_cap}). Try again tomorrow.` },
      { status: 429 }
    )
  }
  if (account.last_send_at) {
    const elapsed = Date.now() - new Date(account.last_send_at).getTime()
    if (elapsed < MIN_SEND_SPACING_MS) {
      const wait = Math.ceil((MIN_SEND_SPACING_MS - elapsed) / 1000)
      return NextResponse.json(
        { error: `Too soon — wait ${wait}s before the next send.` },
        { status: 429 }
      )
    }
  }

  // 7. Refresh token if close to expiry
  let accessToken = account.access_token as string
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000) {
    if (!account.refresh_token) {
      return NextResponse.json(
        { error: 'Zoho token expired and no refresh token. Reconnect Zoho.' },
        { status: 401 }
      )
    }
    try {
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
        .eq('id', account.id)
    } catch (e: any) {
      return NextResponse.json({ error: `Token refresh failed: ${e?.message ?? e}` }, { status: 500 })
    }
  }

  // 8. Build the body. Use edited_body if present, else body.
  const bodyText = ((pitch.edited_body as string | null) ?? (pitch.body as string | null) ?? '').trim()
  if (!bodyText) {
    return NextResponse.json({ error: 'Pitch has no body' }, { status: 400 })
  }
  const subject = (pitch.subject as string | null)?.trim() || `A quick thought on ${prospect.name}`

  // 9. Pre-create sent_emails row so we have an id for the tracking pixel
  const { data: sentRow, error: insErr } = await supabaseAdmin
    .from('sent_emails')
    .insert({
      pitch_id: pitchId,
      contact_id: primary.id,
      account_id: account.id,
      subject,
      to_email: primary.email,
    })
    .select('id')
    .single()
  if (insErr || !sentRow) {
    return NextResponse.json({ error: `Failed to create send record: ${insErr?.message}` }, { status: 500 })
  }

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, '')
  const html = buildEmailHtml({
    bodyText,
    appOrigin,
    sentEmailId: sentRow.id,
    unsubToken: b64url(primary.id),
    signature: {
      sender_name: account.display_name,
      sender_title: account.sender_title,
      sender_company: account.sender_company,
      calendly_url: account.calendly_url,
      website_url: account.website_url,
    },
  })

  // 10. Send
  try {
    const result = await sendMessage(accessToken, account.api_domain, account.zoho_account_id, {
      fromAddress: account.email,
      toAddress: primary.email,
      subject,
      htmlContent: html,
    })

    // Update sent_emails row with message/thread IDs + body for audit
    await supabaseAdmin
      .from('sent_emails')
      .update({
        message_id: result.messageId,
        thread_id: result.threadId,
        body_html: html,
      })
      .eq('id', sentRow.id)

    // Update account counters
    await supabaseAdmin
      .from('email_accounts')
      .update({
        sends_today: sendsToday + 1,
        sends_reset_at: today,
        last_send_at: new Date().toISOString(),
      })
      .eq('id', account.id)

    // Flip pitch status to sent
    await supabaseAdmin
      .from('pitches')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', pitchId)

    await supabaseAdmin
      .from('prospects')
      .update({ status: 'contacted' })
      .eq('id', prospect.id)

    return NextResponse.json({ ok: true, sent_email_id: sentRow.id })
  } catch (e: any) {
    // On failure, mark the sent_emails row as bounced so the UI surfaces it
    await supabaseAdmin
      .from('sent_emails')
      .update({ bounced: true, bounce_reason: e?.message ?? 'send failed' })
      .eq('id', sentRow.id)
    return NextResponse.json({ error: e?.message ?? 'Send failed' }, { status: 500 })
  }
}
