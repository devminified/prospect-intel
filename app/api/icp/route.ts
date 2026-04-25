import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

async function requireUser(request: NextRequest): Promise<string | NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return userData.user.id
}

export async function GET(request: NextRequest) {
  const userId = await requireUser(request)
  if (userId instanceof NextResponse) return userId

  const { data, error } = await supabaseAdmin
    .from('icp_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ icp: data })
}

export async function PATCH(request: NextRequest) {
  const userId = await requireUser(request)
  if (userId instanceof NextResponse) return userId

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const row: any = {
    user_id: userId,
    services: Array.isArray(body.services) ? body.services.filter((s: any) => typeof s === 'string' && s.trim()) : [],
    avg_deal_size: body.avg_deal_size != null ? Number(body.avg_deal_size) : null,
    daily_capacity: Math.max(0, Math.min(500, Number(body.daily_capacity ?? 0))),
    preferred_cities: Array.isArray(body.preferred_cities) ? body.preferred_cities.filter((s: any) => typeof s === 'string' && s.trim()) : [],
    excluded_cities: Array.isArray(body.excluded_cities) ? body.excluded_cities.filter((s: any) => typeof s === 'string' && s.trim()) : [],
    min_gmb_rating: body.min_gmb_rating != null ? Number(body.min_gmb_rating) : null,
    min_review_count: body.min_review_count != null ? Number(body.min_review_count) : null,
    target_categories: Array.isArray(body.target_categories) ? body.target_categories.filter((s: any) => typeof s === 'string' && s.trim()) : [],
    require_linkedin: !!body.require_linkedin,
    require_instagram: !!body.require_instagram,
    require_facebook: !!body.require_facebook,
    require_business_phone: !!body.require_business_phone,
    require_reachable: !!body.require_reachable,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from('icp_profile')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ icp: data })
}
