import { NextRequest, NextResponse } from 'next/server'
import * as dbTeams from '@/lib/db/teams'

/**
 * Public endpoint — no auth required. Used by /signup?token=... and the
 * /invite/[token] page to validate an invite token before showing the
 * signup form. Returns the recipient email + role + expiry, or 404.
 *
 * Deliberately leaks minimal info: no team name, no inviter id. Just
 * enough for the signup form to (a) show "Sign up to join as a Cold
 * Caller" copy and (b) pre-fill the email address.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }
  const invite = await dbTeams.getInviteByToken(token)
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invite already redeemed' }, { status: 410 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite expired' }, { status: 410 })
  }
  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
  })
}
