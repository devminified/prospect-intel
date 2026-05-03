import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { useBusinessPhone } from '@/lib/contacts'
import { getProspectTeamAccess } from '@/lib/team'
import { canEditContact, type Role, roleForbiddenMessage } from '@/lib/rbac'

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
  if (!canEditContact(access.role as Role)) {
    return NextResponse.json(
      { error: roleForbiddenMessage(access.role as Role, 'edit contact phone') },
      { status: 403 }
    )
  }

  try {
    const result = await useBusinessPhone(contactId)
    return NextResponse.json({ ok: true, phone: result.phone })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Use business phone failed' },
      { status: 500 }
    )
  }
}
