import * as dbIcp from '@/lib/db/icp'
import { IcpPatchInputSchema } from '@/lib/types'
import type { IcpProfile, Role } from '@/lib/types'
import { canEditIcp, roleForbiddenMessage } from '@/lib/rbac'
import { requireTeamAccess } from './access'
import { ForbiddenError, ValidationError } from './errors'

/** Returns the user's ICP profile, or null if they haven't set one yet. */
export async function get(userId: string): Promise<IcpProfile | null> {
  await requireTeamAccess(userId)
  return dbIcp.getByUserId(userId)
}

/**
 * Save the ICP profile. Owner / manager / lead_gen only.
 *
 * Note: icp_profile.user_id is the PK in the current schema, so we
 * still upsert by user_id even though the data is conceptually
 * team-scoped. Future migration could move to one-ICP-per-team if
 * multi-lead-gen friction surfaces.
 */
export async function save(userId: string, raw: unknown): Promise<IcpProfile> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (!canEditIcp(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'edit ICP'))
  }

  const parsed = IcpPatchInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid ICP', parsed.error.issues)
  }

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const row: IcpProfile = {
    user_id: userId,
    team_id: teamId,
    services: parsed.data.services,
    avg_deal_size: toNum(parsed.data.avg_deal_size),
    daily_capacity: Math.max(0, Math.min(500, Number(parsed.data.daily_capacity ?? 0) || 0)),
    preferred_cities: parsed.data.preferred_cities,
    excluded_cities: parsed.data.excluded_cities,
    min_gmb_rating: toNum(parsed.data.min_gmb_rating),
    min_review_count:
      parsed.data.min_review_count == null || parsed.data.min_review_count === ''
        ? null
        : Math.floor(Number(parsed.data.min_review_count)),
    target_categories: parsed.data.target_categories,
    require_linkedin: parsed.data.require_linkedin,
    require_instagram: parsed.data.require_instagram,
    require_facebook: parsed.data.require_facebook,
    require_business_phone: parsed.data.require_business_phone,
    require_reachable: parsed.data.require_reachable,
    updated_at: new Date().toISOString(),
  }

  return dbIcp.upsert(row)
}

