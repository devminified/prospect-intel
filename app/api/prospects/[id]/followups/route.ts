import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_NOTE_LEN = 1_000

async function authAndOwnProspect(request: NextRequest, prospectId: string) {
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

  const { data: prospect, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, batches!inner(user_id)')
    .eq('id', prospectId)
    .single()
  if (pErr || !prospect) {
    return { error: NextResponse.json({ error: 'Prospect not found' }, { status: 404 }) }
  }
  if ((prospect as any).batches?.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: prospectId } = await context.params
  const auth = await authAndOwnProspect(request, prospectId)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('prospect_followups')
    .select('id, due_at, note, done, done_at, created_at')
    .eq('prospect_id', prospectId)
    .order('done', { ascending: true })
    .order('due_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ followups: data ?? [] })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: prospectId } = await context.params
  const auth = await authAndOwnProspect(request, prospectId)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const dueAtRaw = (body as any).due_at
  if (typeof dueAtRaw !== 'string' || !dueAtRaw) {
    return NextResponse.json({ error: 'due_at required (ISO timestamp)' }, { status: 400 })
  }
  const dueAt = new Date(dueAtRaw)
  if (Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: 'due_at is not a valid date' }, { status: 400 })
  }

  let note: string | null = null
  if ((body as any).note != null) {
    if (typeof (body as any).note !== 'string') {
      return NextResponse.json({ error: 'note must be a string' }, { status: 400 })
    }
    const trimmed = ((body as any).note as string).trim()
    if (trimmed.length > MAX_NOTE_LEN) {
      return NextResponse.json(
        { error: `Note too long (max ${MAX_NOTE_LEN} chars)` },
        { status: 400 }
      )
    }
    note = trimmed || null
  }

  const { data, error } = await supabaseAdmin
    .from('prospect_followups')
    .insert({
      prospect_id: prospectId,
      user_id: auth.userId,
      due_at: dueAt.toISOString(),
      note,
    })
    .select('id, due_at, note, done, done_at, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ followup: data })
}
