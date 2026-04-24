import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generatePlan } from '@/lib/plans'

/**
 * Runs daily at 08:00 UTC via vercel.json. For each user with a configured
 * ICP that has target_categories, generates today's plan if one doesn't
 * already exist for today.
 *
 * Idempotent: re-running on the same UTC day does nothing (checks lead_plans
 * for plan_date = today).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: icps, error } = await supabaseAdmin
    .from('icp_profile')
    .select('user_id, target_categories')
  if (error) {
    return NextResponse.json({ error: `ICP lookup failed: ${error.message}` }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const results: any[] = []

  for (const icp of (icps ?? []) as any[]) {
    const userId = icp.user_id
    if (!icp.target_categories || icp.target_categories.length === 0) {
      results.push({ user_id: userId, skipped: 'no target_categories' })
      continue
    }

    // Skip if a plan already exists for today
    const { data: existing } = await supabaseAdmin
      .from('lead_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('plan_date', today)
      .maybeSingle()
    if (existing) {
      results.push({ user_id: userId, skipped: 'plan already exists for today', plan_id: existing.id })
      continue
    }

    try {
      const planId = await generatePlan(userId)
      results.push({ user_id: userId, plan_id: planId, status: 'generated' })
    } catch (e: any) {
      results.push({ user_id: userId, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, today, results })
}
