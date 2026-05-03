import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_NOTE_LEN = 1_000

async function authAndOwnFollowup(
  request: NextRequest,
  prospectId: string,
  fid: string
) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const userId = userData.user.id

  const { data: row, error } = await supabaseAdmin
    .from('prospect_followups')
    .select('id, prospect_id, prospects!inner(batches!inner(user_id))')
    .eq('id', fid)
    .single()

  if (error || !row) {
    return { error: NextResponse.json({ error: 'Follow-up not found' }, { status: 404 }) }
  }
  if ((row as any).prospect_id !== prospectId) {
    return {
      error: NextResponse.json(
        { error: 'Follow-up does not belong to this prospect' },
        { status: 400 }
      ),
    }
  }
  if ((row as any).prospects?.batches?.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; fid: string }> }
) {
  const { id: prospectId, fid } = await context.params
  const auth = await authAndOwnFollowup(request, prospectId, fid)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if ('due_at' in body) {
    const raw = (body as any).due_at
    if (typeof raw !== 'string' || !raw) {
      return NextResponse.json({ error: 'due_at must be an ISO string' }, { status: 400 })
    }
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'due_at is not a valid date' }, { status: 400 })
    }
    update.due_at = d.toISOString()
  }

  if ('note' in body) {
    const raw = (body as any).note
    if (raw === null || raw === '') {
      update.note = null
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed.length > MAX_NOTE_LEN) {
        return NextResponse.json(
          { error: `Note too long (max ${MAX_NOTE_LEN} chars)` },
          { status: 400 }
        )
      }
      update.note = trimmed || null
    }
  }

  if ('done' in body) {
    const raw = (body as any).done
    if (typeof raw !== 'boolean') {
      return NextResponse.json({ error: 'done must be boolean' }, { status: 400 })
    }
    update.done = raw
    update.done_at = raw ? new Date().toISOString() : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('prospect_followups')
    .update(update)
    .eq('id', fid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; fid: string }> }
) {
  const { id: prospectId, fid } = await context.params
  const auth = await authAndOwnFollowup(request, prospectId, fid)
  if (auth.error) return auth.error

  const { error } = await supabaseAdmin
    .from('prospect_followups')
    .delete()
    .eq('id', fid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
