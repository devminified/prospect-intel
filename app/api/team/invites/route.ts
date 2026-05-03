import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveUserTeamId } from '@/lib/team'
import { randomBytes } from 'crypto'

const ALLOWED_INVITE_ROLES = ['manager', 'lead_gen', 'cold_caller', 'closer']

/**
 * Owner/manager-only: create a team invite. Returns the invite token in
 * the response so the UI can build a shareable URL. M47 will additionally
 * dispatch a magic-link email via Supabase auth.admin.inviteUserByEmail
 * so the invitee can sign up + redeem in one click.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id
  const teamId = await resolveUserTeamId(userId)

  // Role check.
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single()
  if (!membership || (membership.role !== 'owner' && membership.role !== 'manager')) {
    return NextResponse.json(
      { error: 'Only owners and managers can invite members' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = typeof (body as any).email === 'string' ? (body as any).email.trim().toLowerCase() : ''
  const role = typeof (body as any).role === 'string' ? (body as any).role : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }
  if (!ALLOWED_INVITE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  const inviteToken = randomBytes(32).toString('hex')

  const { data: invite, error: insertErr } = await supabaseAdmin
    .from('team_invites')
    .insert({
      team_id: teamId,
      email,
      role,
      invited_by: userId,
      token: inviteToken,
    })
    .select('id, email, role, token, expires_at, created_at')
    .single()

  if (insertErr) {
    if (insertErr.message.includes('team_invites_pending_email_idx')) {
      return NextResponse.json(
        { error: `${email} already has a pending invite to this team` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Best-effort: dispatch a magic-link email via Supabase auth so the
  // invitee can sign up + redeem in one click. The redirect lands on
  // /invite/<token> where they accept the invite. If this fails (e.g.
  // SMTP misconfigured), the invite still exists — the inviter can copy
  // the URL and share manually.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  const redeemUrl = `${baseUrl}/invite/${inviteToken}`
  try {
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { invite_token: inviteToken, team_id: teamId, role },
      redirectTo: redeemUrl,
    })
  } catch (e: any) {
    console.warn('[invite] magic-link send failed (non-fatal):', e?.message ?? e)
  }

  return NextResponse.json({ invite, redeem_url: redeemUrl })
}

/**
 * Owner/manager-only: revoke a pending invite.
 */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id
  const teamId = await resolveUserTeamId(userId)

  const inviteId = request.nextUrl.searchParams.get('id')
  if (!inviteId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single()
  if (!membership || (membership.role !== 'owner' && membership.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('team_invites')
    .delete()
    .eq('id', inviteId)
    .eq('team_id', teamId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
