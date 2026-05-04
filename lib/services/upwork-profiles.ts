import { supabaseAdmin } from '@/lib/supabase/server'
import * as dbProfiles from '@/lib/db/upwork-profiles'
import * as dbTeams from '@/lib/db/teams'
import {
  UpworkProfileCreateInputSchema,
  UpworkProfileMemberAddInputSchema,
  UpworkProfileMemberRoleChangeInputSchema,
  UpworkProfileUpdateInputSchema,
} from '@/lib/types'
import type {
  UpworkAccessInfo,
  UpworkProfile,
  UpworkProfileDetail,
} from '@/lib/types'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './errors'
import {
  requireTeamAccess,
  requireUpworkAccess,
  requireUpworkProfileAccess,
  requireUpworkProfileManager,
} from './access'

/**
 * Upwork profile + membership service. Mirrors the patterns in
 * lib/services/teams.ts for team membership: the service owns RBAC +
 * Zod validation; the db module is a typed thin layer.
 */

// ─── Caller's access summary ──────────────────────────────────────

/**
 * Returns the user's Upwork access status. Drives the nav gate + the
 * "you don't have access" landing for non-Upwork team members.
 *
 * Doesn't throw on absent access — the caller (a layout / nav) wants
 * a yes/no, not a 403.
 *
 * Module isolation rule: only `owner` bypasses Upwork gates. The team
 * `manager` role grants outbound management, NOT Upwork access — they
 * must be explicitly added to a profile.
 */
export async function getMyAccess(userId: string): Promise<UpworkAccessInfo> {
  const { teamId, role: teamRole } = await requireTeamAccess(userId)
  const profileCount = await dbProfiles.countMembershipsForUser(teamId, userId)
  const has_access = teamRole === 'owner' || profileCount > 0
  const is_pure_upwork = teamRole === 'bidder' && profileCount > 0
  return {
    team_role: teamRole,
    profile_count: profileCount,
    has_access,
    is_pure_upwork,
  }
}

// ─── Profile CRUD ─────────────────────────────────────────────────

export async function listProfiles(userId: string): Promise<UpworkProfile[]> {
  const { teamId, teamRole } = await requireUpworkAccess(userId)
  const all = await dbProfiles.listForTeam(teamId)
  // Owner sees every profile. Everyone else (including outbound
  // managers) sees only profiles they're explicitly a member of.
  if (teamRole === 'owner') return all
  const filtered: UpworkProfile[] = []
  for (const p of all) {
    const m = await dbProfiles.getMembership(p.id, userId)
    if (m) filtered.push(p)
  }
  return filtered
}

export async function getProfileDetail(
  userId: string,
  profileId: string
): Promise<UpworkProfileDetail> {
  const acc = await requireUpworkProfileAccess(userId, profileId)
  const profile = await dbProfiles.getById(profileId)
  if (!profile) throw new NotFoundError('Profile not found')
  const members = await dbProfiles.listMembersWithEmail(profileId, userId)
  return {
    profile,
    members,
    my_profile_role: acc.profileRole,
    can_manage: acc.canManage,
  }
}

/** Only the team owner can create Upwork profiles. */
export async function createProfile(userId: string, raw: unknown): Promise<UpworkProfile> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role !== 'owner') {
    throw new ForbiddenError('Only the team owner can create Upwork profiles')
  }
  const parsed = UpworkProfileCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const existing = await dbProfiles.getBySlug(teamId, parsed.data.slug)
  if (existing) throw new ConflictError(`A profile with slug "${parsed.data.slug}" already exists.`)

  return dbProfiles.insert({
    team_id: teamId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description ?? null,
    profile_url: parsed.data.profile_url ?? null,
    account_type: parsed.data.account_type,
    hourly_rate_usd: parsed.data.hourly_rate_usd ?? null,
  })
}

/** Profile manager OR team owner/manager can edit. */
export async function updateProfile(
  userId: string,
  profileId: string,
  raw: unknown
): Promise<void> {
  await requireUpworkProfileManager(userId, profileId)
  const parsed = UpworkProfileUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null
  if (parsed.data.profile_url !== undefined) patch.profile_url = parsed.data.profile_url ?? null
  if (parsed.data.account_type !== undefined) patch.account_type = parsed.data.account_type
  if (parsed.data.hourly_rate_usd !== undefined) {
    patch.hourly_rate_usd = parsed.data.hourly_rate_usd ?? null
  }
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status
    patch.archived_at = parsed.data.status === 'archived' ? new Date().toISOString() : null
  }
  if (parsed.data.connects_balance !== undefined) {
    patch.connects_balance = parsed.data.connects_balance
  }
  await dbProfiles.update(profileId, patch)
}

/** Archive — soft-delete, preserves history. Owner-only. */
export async function archiveProfile(userId: string, profileId: string): Promise<void> {
  const { role } = await requireTeamAccess(userId)
  if (role !== 'owner') {
    throw new ForbiddenError('Only the team owner can archive Upwork profiles')
  }
  await dbProfiles.update(profileId, {
    status: 'archived',
    archived_at: new Date().toISOString(),
  })
}

// ─── Member management ────────────────────────────────────────────

export async function addMember(
  userId: string,
  profileId: string,
  raw: unknown
): Promise<void> {
  await requireUpworkProfileManager(userId, profileId)
  const parsed = UpworkProfileMemberAddInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const profile = await dbProfiles.getById(profileId)
  if (!profile) throw new NotFoundError('Profile not found')

  // Target must already be on the team.
  const teamMembership = await dbTeams.getMembership(profile.team_id, parsed.data.user_id)
  if (!teamMembership) {
    throw new ValidationError(
      'Target user is not a team member. Invite them via /settings/team first.'
    )
  }

  // No-op if already a member with the same role.
  const existing = await dbProfiles.getMembership(profileId, parsed.data.user_id)
  if (existing) {
    if (existing.role === parsed.data.role) return
    await dbProfiles.setMemberRole(profileId, parsed.data.user_id, parsed.data.role)
    return
  }

  try {
    await dbProfiles.addMember({
      profile_id: profileId,
      user_id: parsed.data.user_id,
      role: parsed.data.role,
      invited_by: userId,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Partial unique index: at most one manager per profile.
    if (msg.includes('upwork_profile_one_manager_idx')) {
      throw new ConflictError(
        'This profile already has a manager. Demote the current manager to bidder first.'
      )
    }
    throw e
  }
}

export async function setMemberRole(
  userId: string,
  profileId: string,
  targetUserId: string,
  raw: unknown
): Promise<void> {
  await requireUpworkProfileManager(userId, profileId)
  const parsed = UpworkProfileMemberRoleChangeInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  const target = await dbProfiles.getMembership(profileId, targetUserId)
  if (!target) throw new NotFoundError('Profile member not found')
  if (target.role === parsed.data.role) return

  // Prevent demoting yourself if you're the only manager.
  if (
    targetUserId === userId &&
    target.role === 'manager' &&
    parsed.data.role !== 'manager'
  ) {
    throw new ValidationError(
      'You are this profile\'s only manager. Promote another bidder to manager before stepping down.'
    )
  }

  try {
    await dbProfiles.setMemberRole(profileId, targetUserId, parsed.data.role)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('upwork_profile_one_manager_idx')) {
      throw new ConflictError(
        'This profile already has a manager. Demote the current manager to bidder first.'
      )
    }
    throw e
  }
}

export async function removeMember(
  userId: string,
  profileId: string,
  targetUserId: string
): Promise<void> {
  await requireUpworkProfileManager(userId, profileId)
  const target = await dbProfiles.getMembership(profileId, targetUserId)
  if (!target) throw new NotFoundError('Profile member not found')
  if (targetUserId === userId && target.role === 'manager') {
    throw new ValidationError(
      'You are this profile\'s manager. Promote a replacement before removing yourself.'
    )
  }
  await dbProfiles.removeMember(profileId, targetUserId)
}

/** Helper for the member-picker UI: list team members not yet on this profile. */
export async function listAddableTeamMembers(
  userId: string,
  profileId: string
): Promise<Array<{ user_id: string; email: string | null; team_role: string }>> {
  await requireUpworkProfileManager(userId, profileId)
  const profile = await dbProfiles.getById(profileId)
  if (!profile) throw new NotFoundError('Profile not found')

  const allMembers = await dbTeams.listMembers(profile.team_id)
  const profileMembers = await dbProfiles.listMembers(profileId)
  const onProfile = new Set(profileMembers.map((m) => m.user_id))
  const out: Array<{ user_id: string; email: string | null; team_role: string }> = []
  for (const m of allMembers) {
    if (onProfile.has(m.user_id)) continue
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
    out.push({ user_id: m.user_id, email: u.user?.email ?? null, team_role: m.role })
  }
  return out
}
