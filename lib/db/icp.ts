import { supabaseAdmin } from '@/lib/supabase/server'
import type { IcpProfile } from '@/lib/types'

export async function getByUserId(userId: string): Promise<IcpProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('icp_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`db.icp.getByUserId: ${error.message}`)
  return (data as IcpProfile | null) ?? null
}

export async function upsert(row: IcpProfile): Promise<IcpProfile> {
  const { data, error } = await supabaseAdmin
    .from('icp_profile')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error || !data) throw new Error(`db.icp.upsert: ${error?.message ?? 'no row returned'}`)
  return data as IcpProfile
}

/**
 * Returns the floors used by `filterByIcpFloors` at batch creation.
 * Always returns a row even if the user has no ICP yet — fields default
 * to nulls / false so the caller can apply them safely.
 */
export async function getBatchFloors(userId: string): Promise<{
  min_gmb_rating: number | null
  min_review_count: number | null
  require_business_phone: boolean
}> {
  const { data } = await supabaseAdmin
    .from('icp_profile')
    .select('min_gmb_rating, min_review_count, require_business_phone')
    .eq('user_id', userId)
    .maybeSingle()
  const r = (data ?? {}) as any
  return {
    min_gmb_rating: r.min_gmb_rating ?? null,
    min_review_count: r.min_review_count ?? null,
    require_business_phone: !!r.require_business_phone,
  }
}
