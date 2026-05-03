import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveUserTeamId } from '@/lib/team'

/**
 * Owner-only: transfer ownership to another team member. The current
 * owner is demoted to 'manager' atomically with the promotion via the
 * `transfer_team_ownership(team_id, new_owner)` SQL function so the
 * partial unique "one owner per team" index never sees a conflict.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id
  const teamId = await resolveUserTeamId(userId)

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single()
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the current owner can transfer ownership' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const newOwnerId = typeof (body as any)?.user_id === 'string' ? (body as any).user_id : ''
  if (!newOwnerId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.rpc('transfer_team_ownership', {
    p_team_id: teamId,
    p_new_owner: newOwnerId,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
