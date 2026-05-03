import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveUserTeamId } from '@/lib/team'

const ROLES = new Set(['manager', 'lead_gen', 'cold_caller', 'closer'])

/**
 * Owner/manager: change a member's role (excluding owner — that's via
 * /api/team/transfer-ownership).
 *
 * Only owners can promote to manager; managers can demote but not
 * promote. Owners can change anyone (except themselves — they have to
 * transfer ownership first).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ user_id: string }> }
) {
  const { user_id: targetUserId } = await context.params

  const auth = await authedTeamCtx(request)
  if (auth.error) return auth.error
  const { userId, teamId, myRole } = auth

  if (myRole !== 'owner' && myRole !== 'manager') {
    return NextResponse.json(
      { error: 'Only owners and managers can change member roles' },
      { status: 403 }
    )
  }
  if (targetUserId === userId) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const newRole = typeof (body as any)?.role === 'string' ? (body as any).role : ''
  if (!ROLES.has(newRole)) {
    return NextResponse.json(
      { error: `Role must be one of: ${Array.from(ROLES).join(', ')}` },
      { status: 400 }
    )
  }

  // Prevent demoting an owner via this route — must use transfer-ownership.
  const { data: target } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json(
      { error: 'Use ownership transfer to change the owner role' },
      { status: 400 }
    )
  }
  if (newRole === 'manager' && myRole !== 'owner') {
    return NextResponse.json(
      { error: 'Only the owner can promote members to manager' },
      { status: 403 }
    )
  }

  const { error } = await supabaseAdmin
    .from('team_members')
    .update({ role: newRole })
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/**
 * Owner-only: remove a member from the team.
 *
 * Side-effects:
 *   - Their email_accounts rows for this team are deleted (only that user
 *     has the Zoho tokens; the row would be unusable to others). If they
 *     rejoin, they'd reconnect via OAuth.
 *   - Prospects they were assigned to fall back to "Unassigned"
 *     (prospects.assigned_to has on delete set null).
 *
 * Owners cannot remove themselves — they must transfer ownership first.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ user_id: string }> }
) {
  const { user_id: targetUserId } = await context.params

  const auth = await authedTeamCtx(request)
  if (auth.error) return auth.error
  const { userId, teamId, myRole } = auth

  if (myRole !== 'owner') {
    return NextResponse.json(
      { error: 'Only the team owner can remove members' },
      { status: 403 }
    )
  }
  if (targetUserId === userId) {
    return NextResponse.json(
      { error: 'You cannot remove yourself. Transfer ownership first, then leave from the new owner account.' },
      { status: 400 }
    )
  }

  const { data: target } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json(
      { error: 'Cannot remove the owner. Transfer ownership first.' },
      { status: 400 }
    )
  }

  // Drop email_accounts they connected for THIS team (other teams' rows
  // are unaffected). Done before the membership delete because the email
  // table's RLS depends on team membership and we want service-role
  // execution to be unambiguous.
  await supabaseAdmin
    .from('email_accounts')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)

  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

interface AuthCtx {
  userId: string
  teamId: string
  myRole: string
}

async function authedTeamCtx(
  request: NextRequest
): Promise<({ error: NextResponse } & Partial<AuthCtx>) | (AuthCtx & { error?: undefined })> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const userId = userData.user.id
  const teamId = await resolveUserTeamId(userId)
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single()
  if (!membership) {
    return { error: NextResponse.json({ error: 'Not a team member' }, { status: 403 }) }
  }
  return { userId, teamId, myRole: membership.role }
}
