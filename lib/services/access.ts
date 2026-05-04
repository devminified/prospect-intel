import * as dbProspects from '@/lib/db/prospects'
import * as dbTeams from '@/lib/db/teams'
import * as dbUpworkProfiles from '@/lib/db/upwork-profiles'
import { NO_TEAM, resolveUserTeamId } from '@/lib/team'
import type { Role, UpworkProfileRole } from '@/lib/types'
import { ForbiddenError, NotFoundError } from './errors'

/**
 * Ensures the user is a member of the team that owns the prospect, and
 * returns that team_id + the user's role on it. Routes mutating
 * prospect-scoped data call this before delegating to a service action.
 */
export async function requireProspectAccess(
  userId: string,
  prospectId: string
): Promise<{ teamId: string; role: Role }> {
  const teamId = await dbProspects.getTeamId(prospectId)
  if (!teamId) throw new NotFoundError('Prospect not found')

  const membership = await dbTeams.getMembership(teamId, userId)
  if (!membership) throw new ForbiddenError('Prospect not in your team')

  return { teamId, role: membership.role }
}

/**
 * Resolves the user's active team and their role on it. Useful for
 * routes that act team-wide (create batch, edit ICP, list invites)
 * rather than against a specific resource.
 */
export async function requireTeamAccess(
  userId: string
): Promise<{ teamId: string; role: Role }> {
  const teamId = await resolveUserTeamId(userId)
  if (teamId === NO_TEAM) throw new ForbiddenError('Not a team member')
  const membership = await dbTeams.getMembership(teamId, userId)
  if (!membership) throw new ForbiddenError('Not a team member')
  return { teamId, role: membership.role }
}

// ─── Upwork module access ─────────────────────────────────────────
//
// Outbound and Upwork are isolated modules. Membership in one does NOT
// confer access to the other — outbound managers don't auto-see Upwork
// and Upwork bidders don't auto-see /leads.
//
// Only the team OWNER bypasses module gates (CEO-level visibility, by
// design — the owner can see everything they own). Everyone else needs
// an explicit upwork_profile_members row to access Upwork; bidders need
// the row to access Upwork at all.
//
// "Outbound manager" (team_members.role='manager') and "Upwork manager"
// (upwork_profile_members.role='manager') are different concepts.

/**
 * Generic "any Upwork access at all" gate. Owner-bypass plus explicit
 * profile membership. Used by the /upwork landing + nav probe.
 */
export async function requireUpworkAccess(
  userId: string
): Promise<{ teamId: string; teamRole: Role; profileCount: number }> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role === 'owner') {
    return { teamId, teamRole: role, profileCount: -1 }
  }
  const count = await dbUpworkProfiles.countMembershipsForUser(teamId, userId)
  if (count === 0) {
    throw new ForbiddenError(
      'No Upwork access. Ask the owner or a profile manager to add you to an Upwork profile.'
    )
  }
  return { teamId, teamRole: role, profileCount: count }
}

/**
 * Per-profile gate. Owner bypasses with full management rights; everyone
 * else needs an explicit upwork_profile_members row. The team-wide
 * manager role does NOT confer Upwork access — they need to be added to
 * a profile like anyone else.
 */
export async function requireUpworkProfileAccess(
  userId: string,
  profileId: string
): Promise<{
  teamId: string
  teamRole: Role
  profileRole: UpworkProfileRole | null
  canManage: boolean
}> {
  const profile = await dbUpworkProfiles.getById(profileId)
  if (!profile) throw new NotFoundError('Upwork profile not found')

  const teamMembership = await dbTeams.getMembership(profile.team_id, userId)
  if (!teamMembership) throw new ForbiddenError('Profile not in your team')

  // Owner-only bypass.
  if (teamMembership.role === 'owner') {
    return {
      teamId: profile.team_id,
      teamRole: teamMembership.role,
      profileRole: null,
      canManage: true,
    }
  }

  const profileMembership = await dbUpworkProfiles.getMembership(profileId, userId)
  if (!profileMembership) {
    throw new ForbiddenError('You are not a member of this Upwork profile')
  }
  return {
    teamId: profile.team_id,
    teamRole: teamMembership.role,
    profileRole: profileMembership.role,
    canManage: profileMembership.role === 'manager',
  }
}

/**
 * Manage-level gate: owner OR upwork_profile_members.role='manager'.
 * The outbound team manager does not pass this gate.
 */
export async function requireUpworkProfileManager(
  userId: string,
  profileId: string
): Promise<{ teamId: string; teamRole: Role }> {
  const acc = await requireUpworkProfileAccess(userId, profileId)
  if (!acc.canManage) {
    throw new ForbiddenError(
      'Only the profile manager or the team owner can change this profile.'
    )
  }
  return { teamId: acc.teamId, teamRole: acc.teamRole }
}
