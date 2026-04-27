import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Apollo phone-reveal webhook landing pad.
 *
 * Apollo POSTs here once their async phone lookup completes. We match the
 * payload's request_id against contacts.phone_request_id (set when we kicked
 * off the reveal) and write the phone + audit timestamp.
 *
 * Auth: shared secret via ?secret= query param, since Apollo doesn't sign
 * webhooks. The secret lives in env (APOLLO_WEBHOOK_SECRET) and is only ever
 * embedded in webhook URLs we send Apollo, never in browser-visible code.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.APOLLO_WEBHOOK_SECRET
  if (!expected) {
    console.error('[Apollo webhook] APOLLO_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = url.searchParams.get('secret')
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Apollo's payload shape is not always documented stably — accept the most
  // common field names. Logged at warn-level if we can't extract a request_id
  // so we can correct without losing the inbound credit.
  const requestId =
    body?.request_id ??
    body?.requestId ??
    body?.data?.request_id ??
    null

  const phone =
    body?.phone_number ??
    body?.phone ??
    body?.sanitized_phone ??
    body?.mobile_phone ??
    body?.person?.phone_number ??
    body?.person?.phone ??
    null

  if (!requestId) {
    console.error('[Apollo webhook] no request_id in payload', JSON.stringify(body).slice(0, 500))
    return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })
  }

  const { data: updated, error } = await supabaseAdmin
    .from('contacts')
    .update({
      phone: phone ?? null,
      phone_revealed_at: new Date().toISOString(),
    })
    .eq('phone_request_id', requestId)
    .select('id')

  if (error) {
    console.error('[Apollo webhook] DB update failed:', error.message)
    return NextResponse.json({ error: 'Persist failed' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    console.warn('[Apollo webhook] no contact row matched request_id', requestId)
    // 200 anyway — Apollo will retry on non-2xx and we don't want a retry storm
    // for a stale or already-handled request_id.
    return NextResponse.json({ ok: true, matched: 0 })
  }

  return NextResponse.json({ ok: true, matched: updated.length })
}
