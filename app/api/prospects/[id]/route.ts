import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const ALLOWED_PROSPECT_STATUSES = ['new', 'enriched', 'analyzed', 'ready', 'contacted', 'replied', 'rejected']
const ALLOWED_PITCH_STATUSES = ['draft', 'approved', 'sent', 'replied']

interface PatchBody {
  prospect_status?: string
  pitch_edited_body?: string
  pitch_status?: string
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
