import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

/**
 * Tracking pixel. Public — no auth. Logs an email_opens row and returns 1x1 PNG.
 *
 * Caveat (user already knows): Apple Mail Privacy Protection + Gmail image proxy
 * pre-fetch pixels server-side. is_probably_mpp flags opens that happen within
 * 10 seconds of send (likely MPP, not a real read).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    const { data: sent } = await supabaseAdmin
      .from('sent_emails')
      .select('id, sent_at, account_id, email_accounts(known_self_ips)')
      .eq('id', id)
      .maybeSingle()

    if (sent) {
      const elapsed = Date.now() - new Date(sent.sent_at).getTime()
      const isProbablyMpp = elapsed < 10_000

      const ip =
        _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        _request.headers.get('x-real-ip') ??
        null
      const ua = _request.headers.get('user-agent') ?? null

      // Self-open detection: if the requesting IP matches one we know
      // belongs to the sender (captured via /api/auth/heartbeat from the
      // dashboard), flag this open. The sender opening their own Sent folder
      // should not pad the recipient open count.
      const knownSelfIps: string[] =
        ((sent as any).email_accounts?.known_self_ips as string[] | null | undefined) ?? []
      const isProbablySelf = !!ip && knownSelfIps.includes(ip)

      await supabaseAdmin.from('email_opens').insert({
        sent_email_id: id,
        ip,
        user_agent: ua,
        is_probably_mpp: isProbablyMpp,
        is_probably_self: isProbablySelf,
      })
    }
  } catch {
    // Pixel must always return 200 + image bytes, even if logging fails
  }

  return new NextResponse(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  })
}
