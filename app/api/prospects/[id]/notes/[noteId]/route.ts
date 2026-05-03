import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_BODY_LEN = 10_000

async function authAndOwnNote(
  request: NextRequest,
  prospectId: string,
  noteId: string
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

  const { data: note, error } = await supabaseAdmin
    .from('prospect_notes')
    .select('id, prospect_id, prospects!inner(batches!inner(user_id))')
    .eq('id', noteId)
    .single()

  if (error || !note) {
    return { error: NextResponse.json({ error: 'Note not found' }, { status: 404 }) }
  }
  if ((note as any).prospect_id !== prospectId) {
    return {
      error: NextResponse.json(
        { error: 'Note does not belong to this prospect' },
        { status: 400 }
      ),
    }
  }
  if ((note as any).prospects?.batches?.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: prospectId, noteId } = await context.params
  const auth = await authAndOwnNote(request, prospectId, noteId)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const text = typeof (body as any).body === 'string' ? (body as any).body.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'Note body cannot be empty' }, { status: 400 })
  }
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `Note body too long (max ${MAX_BODY_LEN} chars)` },
      { status: 400 }
    )
  }

  const { error } = await supabaseAdmin
    .from('prospect_notes')
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq('id', noteId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: prospectId, noteId } = await context.params
  const auth = await authAndOwnNote(request, prospectId, noteId)
  if (auth.error) return auth.error

  const { error } = await supabaseAdmin
    .from('prospect_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
