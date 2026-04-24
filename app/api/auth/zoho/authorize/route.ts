import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/email/zoho'
import crypto from 'crypto'

/**
 * Kick off Zoho OAuth. Sets a short-lived httpOnly cookie with a random state
 * value + the requesting user_id (signed). Callback verifies both.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  let userId: string | null = null

  // Accept either a Bearer token (API call) or a Supabase cookie (direct nav from UI)
  if (authHeader?.startsWith('Bearer ')) {
    const { data } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    userId = data?.user?.id ?? null
  } else {
    // Fallback: user_id in query string (the /settings/email page will include it)
    userId = request.nextUrl.searchParams.get('uid')
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — pass uid' }, { status: 401 })
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const state = `${userId}.${nonce}`

  const url = getAuthUrl(state)
  const res = NextResponse.redirect(url)
  res.cookies.set('zoho_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 min
    path: '/',
  })
  return res
}
