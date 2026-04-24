import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { revealEmail } from '@/lib/contacts'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id: prospectId, contactId } = await context.params

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

  // Ownership: contact → prospect → batch → user
  const { data: contact, error: cErr } = await supabaseAdmin
    .from('contacts')
    .select('id, prospect_id, prospects!inner(batches!inner(user_id))')
    .eq('id', contactId)
    .single()
  if (cErr || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }
  if ((contact as any).prospect_id !== prospectId) {
    return NextResponse.json({ error: 'Contact does not belong to this prospect' }, { status: 400 })
  }
  const ownerId = (contact as any).prospects?.batches?.user_id
  if (ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await revealEmail(contactId)
    return NextResponse.json({ ok: true, email: result.email, phone: result.phone })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Reveal failed' },
      { status: 500 }
    )
  }
}
