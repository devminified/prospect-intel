import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_BODY_LEN = 10_000

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
    .from('prospect_notes')
    .select('id, body, created_at, updated_at, user_id')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ notes: data ?? [] })
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

  const { data, error } = await supabaseAdmin
    .from('prospect_notes')
    .insert({ prospect_id: prospectId, user_id: auth.userId, body: text })
    .select('id, body, created_at, updated_at, user_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ note: data })
}
