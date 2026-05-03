import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Redeem a team invite. The signed-in user must have an email matching
 * the invited email (case-insensitive). On success, inserts the member
 * row and marks the invite accepted.
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
  const userEmail = (userData.user.email ?? '').toLowerCase()

  const body = await request.json().catch(() => null)
  const inviteToken = typeof (body as any)?.token === 'string' ? (body as any).token : ''
  if (!inviteToken) {
    return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
  }

  const { data: invite, error: lookupErr } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id, email, role, expires_at, accepted_at')
    .eq('token', inviteToken)
    .single()

  if (lookupErr || !invite) {
    return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invite already redeemed' }, { status: 410 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invite has expired — ask for a new one' }, { status: 410 })
  }
  if (invite.email.toLowerCase() !== userEmail) {
    return NextResponse.json(
      {
        error: `This invite was sent to ${invite.email}. Sign in with that account to redeem.`,
      },
      { status: 403 }
    )
  }

  // Insert membership. If the user is already a member of this team,
  // upgrade to no-op so re-clicks don't 500.
  const { data: existing } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', invite.team_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existing) {
    const { error: insertErr } = await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: invite.team_id,
        user_id: userId,
        role: invite.role,
        invited_by: null,
      })
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
  }

  await supabaseAdmin
    .from('team_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true, team_id: invite.team_id })
}
