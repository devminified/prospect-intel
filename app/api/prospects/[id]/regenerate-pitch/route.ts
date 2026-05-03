import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generatePitch } from '@/lib/pitch'
import { getProspectTeamAccess } from '@/lib/team'
import { canSendEmail, type Role, roleForbiddenMessage } from '@/lib/rbac'

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

  // Pitch belongs to the email-output workflow — gate behind canSendEmail
  // so closer / manager / owner can iterate, but lead_gen / cold_caller
  // can't burn Sonnet credits regenerating copy they aren't going to ship.
  const access = await getProspectTeamAccess(userId, prospectId)
  if (!access) {
    return NextResponse.json({ error: 'Prospect not found in your team' }, { status: 404 })
  }
  if (!canSendEmail(access.role as Role)) {
    return NextResponse.json(
      { error: roleForbiddenMessage(access.role as Role, 'regenerate pitch copy') },
      { status: 403 }
    )
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
