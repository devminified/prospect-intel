import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_KNOWN_IPS = 10

/**
 * Lightweight heartbeat. Dashboard layout calls this on mount with the user's
 * Bearer token. We capture the requester's IP and prepend it to every email
 * account this user owns (`known_self_ips`). Tracking-pixel hits from these
 * IPs get flagged `is_probably_self=true` and excluded from real-open counts.
 *
 * Solves the "I open my own Sent folder and it counts as a recipient open"
 * false positive without requiring user-managed IP allowlists.
 */
export async function POST(request: NextRequest) {
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

  const ip = extractIp(request)
  if (!ip) return NextResponse.json({ ok: true, ip: null, updated: 0 })

  const { data: accounts, error } = await supabaseAdmin
    .from('email_accounts')
    .select('id, known_self_ips')
    .eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const a of (accounts ?? []) as any[]) {
    const existing: string[] = Array.isArray(a.known_self_ips) ? a.known_self_ips : []
    if (existing.includes(ip)) continue
    const next = [ip, ...existing.filter((x) => x !== ip)].slice(0, MAX_KNOWN_IPS)
    const { error: upErr } = await supabaseAdmin
      .from('email_accounts')
      .update({ known_self_ips: next })
      .eq('id', a.id)
    if (!upErr) updated++
  }

  return NextResponse.json({ ok: true, ip, updated })
}

function extractIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? null
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}
