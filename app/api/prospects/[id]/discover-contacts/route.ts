import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { discoverPeople } from '@/lib/contacts'
import { getProspectTeamAccess } from '@/lib/team'
import { canCreateBatch, type Role, roleForbiddenMessage } from '@/lib/rbac'

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

  // Team-scoped ownership + role gate. Discovery spends Apollo people-
  // search quota, so it sits behind canCreateBatch (lead_gen / manager /
  // owner) — same group that runs the lead-generation pipeline.
  const access = await getProspectTeamAccess(userId, prospectId)
  if (!access) {
    return NextResponse.json({ error: 'Prospect not found in your team' }, { status: 404 })
  }
  if (!canCreateBatch(access.role as Role)) {
    return NextResponse.json(
      { error: roleForbiddenMessage(access.role as Role, 'discover contacts (spends Apollo quota)') },
      { status: 403 }
    )
  }

  try {
    await discoverPeople(prospectId)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Discovery failed' },
      { status: 500 }
    )
  }
}
