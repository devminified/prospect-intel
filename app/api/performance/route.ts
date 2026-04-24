import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { computeRecentPerformance } from '@/lib/plans'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysParam = request.nextUrl.searchParams.get('days')
  const days = daysParam ? Math.max(1, Math.min(365, parseInt(daysParam, 10) || 30)) : 30

  try {
    const rows = await computeRecentPerformance(userData.user.id, days)
    return NextResponse.json({ days, rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Performance failed' }, { status: 500 })
  }
}
