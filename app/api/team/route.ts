import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveUserTeamId } from '@/lib/team'

/**
 * Returns the current user's team plus members and pending invites.
 * Used by the /settings/team page.
 */
export async function GET(request: NextRequest) {
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

  const [teamRes, membersRes, invitesRes] = await Promise.all([
    supabaseAdmin.from('teams').select('id, name, created_at').eq('id', teamId).single(),
    supabaseAdmin
      .from('team_members')
      .select('team_id, user_id, role, joined_at')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true }),
    supabaseAdmin
      .from('team_invites')
      .select('id, email, role, token, expires_at, created_at, accepted_at')
      .eq('team_id', teamId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (teamRes.error) {
    return NextResponse.json({ error: teamRes.error.message }, { status: 500 })
  }

  // Pull email addresses for members from auth.users.
  const memberUserIds = (membersRes.data ?? []).map((m: any) => m.user_id)
  const memberEmails = new Map<string, string | null>()
  for (const uid of memberUserIds) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid)
    memberEmails.set(uid, u.user?.email ?? null)
  }

  const members = (membersRes.data ?? []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    email: memberEmails.get(m.user_id) ?? null,
    is_self: m.user_id === userId,
  }))

  // Determine current user's role for RBAC gating in the UI.
  const me = members.find((m: any) => m.is_self)

  return NextResponse.json({
    team: teamRes.data,
    members,
    invites: invitesRes.data ?? [],
    my_role: me?.role ?? null,
  })
}

/**
 * Owner-only: rename the team.
 */
export async function PATCH(request: NextRequest) {
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
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the team owner can rename the team' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const name = typeof (body as any).name === 'string' ? (body as any).name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Team name cannot be empty' }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Team name too long (max 80 chars)' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('teams')
    .update({ name })
    .eq('id', teamId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
