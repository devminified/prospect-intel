import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveUserTeamId } from '@/lib/team'
import { canSetOutreachStatus, getUserRole, roleForbiddenMessage } from '@/lib/rbac'

const ALLOWED_PROSPECT_STATUSES = ['new', 'enriched', 'analyzed', 'ready', 'contacted', 'replied', 'rejected']
const ALLOWED_PITCH_STATUSES = ['draft', 'approved', 'sent', 'replied']
const ALLOWED_OUTREACH_STATUSES = [
  'calling',
  'voicemail',
  'no_answer',
  'call_ended',
  'follow_up',
  'qualified',
  'not_interested',
  'do_not_contact',
]

interface PatchBody {
  prospect_status?: string
  pitch_edited_body?: string
  pitch_status?: string
  outreach_status?: string | null
  mark_viewed?: boolean
  assigned_to?: string | null
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: prospectId } = await context.params

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

  const { data: prospect, error: prospectError } = await supabaseAdmin
    .from('prospects')
    .select('id, batch_id, batches!inner(user_id)')
    .eq('id', prospectId)
    .single()
  if (prospectError || !prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
  }
  const ownerId = (prospect as any).batches?.user_id
  if (ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.assigned_to !== undefined) {
    const teamId = await resolveUserTeamId(userId)
    const role = await getUserRole(userId, teamId)
    const targetUserId = body.assigned_to

    // Verify the prospect belongs to the current user's team. RLS already
    // gates ownership at SELECT, but PATCH goes through supabaseAdmin —
    // re-check here so we can return a clean 403 with explanation.
    const { data: prospectRow } = await supabaseAdmin
      .from('prospects')
      .select('batch_id, batches!inner(team_id)')
      .eq('id', prospectId)
      .single()
    const prospectTeamId = (prospectRow as any)?.batches?.team_id
    if (prospectTeamId !== teamId) {
      return NextResponse.json({ error: 'Prospect not in your team' }, { status: 403 })
    }

    if (targetUserId === null || targetUserId === '') {
      // Unassign — any team member can do this.
      const { error } = await supabaseAdmin
        .from('prospects')
        .update({ assigned_to: null, assigned_at: null })
        .eq('id', prospectId)
      if (error) {
        return NextResponse.json({ error: `Unassign failed: ${error.message}` }, { status: 500 })
      }
    } else if (typeof targetUserId === 'string') {
      const isSelfAssign = targetUserId === userId
      // Self-assign is open to any team member; assigning others requires owner/manager.
      if (!isSelfAssign && role !== 'owner' && role !== 'manager') {
        return NextResponse.json(
          { error: roleForbiddenMessage(role, 'assign leads to other members (only self-assignment allowed)') },
          { status: 403 }
        )
      }
      // Verify target is a member of the same team.
      const { data: targetMembership } = await supabaseAdmin
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('user_id', targetUserId)
        .maybeSingle()
      if (!targetMembership) {
        return NextResponse.json({ error: 'Target user is not a member of your team' }, { status: 400 })
      }
      const { error } = await supabaseAdmin
        .from('prospects')
        .update({ assigned_to: targetUserId, assigned_at: new Date().toISOString() })
        .eq('id', prospectId)
      if (error) {
        return NextResponse.json({ error: `Assign failed: ${error.message}` }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'assigned_to must be a user id or null' }, { status: 400 })
    }
  }

  if (body.outreach_status !== undefined) {
    const teamId = await resolveUserTeamId(userId)
    const role = await getUserRole(userId, teamId)
    if (!canSetOutreachStatus(role)) {
      return NextResponse.json(
        { error: roleForbiddenMessage(role, 'change outreach status') },
        { status: 403 }
      )
    }
    if (body.outreach_status === null || body.outreach_status === '') {
      const { error } = await supabaseAdmin
        .from('prospects')
        .update({ outreach_status: null })
        .eq('id', prospectId)
      if (error) {
        return NextResponse.json({ error: `Failed to clear outreach_status: ${error.message}` }, { status: 500 })
      }
    } else if (typeof body.outreach_status === 'string') {
      const v = body.outreach_status.trim()
      if (!ALLOWED_OUTREACH_STATUSES.includes(v)) {
        return NextResponse.json(
          { error: `Invalid outreach_status. Allowed: ${ALLOWED_OUTREACH_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      const { error } = await supabaseAdmin
        .from('prospects')
        .update({ outreach_status: v })
        .eq('id', prospectId)
      if (error) {
        return NextResponse.json({ error: `Failed to update outreach_status: ${error.message}` }, { status: 500 })
      }
    }
  }

  if (body.mark_viewed === true) {
    const { error } = await supabaseAdmin
      .from('prospects')
      .update({ last_viewed_at: new Date().toISOString() })
      .eq('id', prospectId)
    if (error) {
      // Non-fatal — viewed-tracking is best-effort, don't block the rest of the PATCH.
      console.warn('mark_viewed failed:', error.message)
    }
  }

  if (body.prospect_status !== undefined) {
    if (!ALLOWED_PROSPECT_STATUSES.includes(body.prospect_status)) {
      return NextResponse.json(
        { error: `Invalid prospect_status. Allowed: ${ALLOWED_PROSPECT_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
    const { error } = await supabaseAdmin
      .from('prospects')
      .update({ status: body.prospect_status })
      .eq('id', prospectId)
    if (error) {
      return NextResponse.json({ error: `Failed to update prospect: ${error.message}` }, { status: 500 })
    }
  }

  if (body.pitch_edited_body !== undefined || body.pitch_status !== undefined) {
    const pitchUpdate: Record<string, any> = {}
    if (body.pitch_edited_body !== undefined) pitchUpdate.edited_body = body.pitch_edited_body
    if (body.pitch_status !== undefined) {
      if (!ALLOWED_PITCH_STATUSES.includes(body.pitch_status)) {
        return NextResponse.json(
          { error: `Invalid pitch_status. Allowed: ${ALLOWED_PITCH_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      pitchUpdate.status = body.pitch_status
      if (body.pitch_status === 'approved') pitchUpdate.approved_at = new Date().toISOString()
      if (body.pitch_status === 'sent') pitchUpdate.sent_at = new Date().toISOString()
    }

    const { error } = await supabaseAdmin
      .from('pitches')
      .update(pitchUpdate)
      .eq('prospect_id', prospectId)
    if (error) {
      return NextResponse.json({ error: `Failed to update pitch: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
