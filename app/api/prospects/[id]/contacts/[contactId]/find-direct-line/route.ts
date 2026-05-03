import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { findDirectLine } from '@/lib/contacts'
import { getProspectTeamAccess } from '@/lib/team'
import { canCreateBatch, type Role, roleForbiddenMessage } from '@/lib/rbac'

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

  // Validate the contact belongs to a prospect in a team this user is in,
  // then gate on canCreateBatch — Lusha credits cost money, so spending
  // them is part of the lead-generation budget like Apollo discovery.
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('prospect_id')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact || (contact as any).prospect_id !== prospectId) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }
  const access = await getProspectTeamAccess(userId, prospectId)
  if (!access) {
    return NextResponse.json({ error: 'Prospect not found in your team' }, { status: 404 })
  }
  if (!canCreateBatch(access.role as Role)) {
    return NextResponse.json(
      { error: roleForbiddenMessage(access.role as Role, 'spend Lusha credits to find a direct line') },
      { status: 403 }
    )
  }

  try {
    const result = await findDirectLine(contactId)
    return NextResponse.json({ ok: true, phone: result.phone })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Find direct line failed' },
      { status: 500 }
    )
  }
}
