import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generatePitch } from '@/lib/pitch'

export const maxDuration = 60

export async function POST(
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

  const { data: prospect, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, batches!inner(user_id)')
    .eq('id', prospectId)
    .single()
  if (pErr || !prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
  }
  const ownerId = (prospect as any).batches?.user_id
  if (ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await generatePitch(prospectId)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Regenerate failed' },
      { status: 500 }
    )
  }
}
