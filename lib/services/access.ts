import * as dbProspects from '@/lib/db/prospects'
import * as dbTeams from '@/lib/db/teams'
import { resolveUserTeamId } from '@/lib/team'
import type { Role } from '@/lib/types'
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
  const membership = await dbTeams.getMembership(teamId, userId)
  if (!membership) throw new ForbiddenError('Not a team member')
  return { teamId, role: membership.role }
}
