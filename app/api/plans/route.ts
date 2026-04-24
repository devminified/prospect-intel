import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generatePlan } from '@/lib/plans'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const planId = await generatePlan(userData.user.id)
    return NextResponse.json({ ok: true, plan_id: planId })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Plan generation failed' },
      { status: 500 }
    )
  }
}
