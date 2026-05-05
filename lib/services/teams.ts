import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import * as dbTeams from '@/lib/db/teams'
import * as dbProfiles from '@/lib/db/upwork-profiles'
import {
  InviteCreateInputSchema,
  InviteRedeemInputSchema,
  OwnershipTransferInputSchema,
  RoleChangeInputSchema,
  TeamRenameInputSchema,
} from '@/lib/types'
import type {
  InvitableRole,
  InvitePreset,
  Role,
  Team,
  TeamInvite,
  TeamMemberWithEmail,
  UpworkAssignment,
} from '@/lib/types'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './errors'
import { requireTeamAccess } from './access'

/**
 * Returns the current user's team + members + pending invites enriched
 * for the /settings/team page. The caller's role is included so the UI
 * can gate buttons without a second roundtrip.
 */
export async function getCurrentTeamView(userId: string): Promise<{
  team: Team
  members: TeamMemberWithEmail[]
  invites: TeamInvite[]
  my_role: Role
}> {
  const { teamId, role } = await requireTeamAccess(userId)
  const team = await dbTeams.getById(teamId)
  if (!team) throw new NotFoundError('Team not found')

  const members = await dbTeams.listMembers(teamId)
  const invites = await dbTeams.listPendingInvites(teamId)

  // Enrich members with email lookup.
  const enriched: TeamMemberWithEmail[] = []
  for (const m of members) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
    enriched.push({
      ...m,
      email: u.user?.email ?? null,
      is_self: m.user_id === userId,
    })
  }

  return { team, members: enriched, invites, my_role: role }
}

export async function rename(userId: string, raw: unknown): Promise<void> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role !== 'owner') {
    throw new ForbiddenError('Only the team owner can rename the team')
  }
  const parsed = TeamRenameInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid name', parsed.error.issues)
  }
  await dbTeams.rename(teamId, parsed.data.name)
}

/**
 * Maps an invite preset to the team-wide role that gets stamped on the
 * `team_members` row at redeem time. Presets exist so the UI can offer
 * meaningful grouping (Outbound / Upwork / Combined) instead of forcing
 * the user to pick a raw role + remember to also click "assign to
 * profile" afterwards.
 */
function presetToTeamRole(preset: InvitePreset): InvitableRole {
  switch (preset) {
    case 'outbound_manager':
    case 'combined_manager':
      return 'manager'
    case 'outbound_lead_gen':
      return 'lead_gen'
    case 'outbound_cold_caller':
      return 'cold_caller'
    case 'outbound_closer':
      return 'closer'
    case 'upwork_bidder':
    case 'upwork_manager':
      return 'bidder'
  }
}

/**
 * Resolves the snapshot of Upwork profile assignments to attach to the
 * invite at create time. For combined-manager invites we eagerly snapshot
 * profiles that currently have NO manager — new profiles created later
 * are not auto-included, matching the documented column comment.
 */
async function resolveUpworkAssignments(
  teamId: string,
  preset: InvitePreset,
  profileIds: string[] | undefined
): Promise<UpworkAssignment[]> {
  if (preset === 'upwork_bidder' || preset === 'upwork_manager') {
    if (!profileIds || profileIds.length === 0) {
      throw new ValidationError('Pick at least one Upwork profile for this invite')
    }
    const role: 'manager' | 'bidder' = preset === 'upwork_manager' ? 'manager' : 'bidder'
    const out: UpworkAssignment[] = []
    for (const pid of profileIds) {
      const profile = await dbProfiles.getById(pid)
      if (!profile || profile.team_id !== teamId) {
        throw new NotFoundError('Upwork profile not found in this team')
      }
      if (role === 'manager') {
        const existingMembers = await dbProfiles.listMembers(pid)
        if (existingMembers.some((m) => m.role === 'manager')) {
          throw new ConflictError(
            `Profile "${profile.name}" already has a manager. Demote them first or remove it from this invite.`
          )
        }
      }
      out.push({ profile_id: pid, role })
    }
    return out
  }

  if (preset === 'combined_manager') {
    const profiles = await dbProfiles.listForTeam(teamId)
    const eligible: UpworkAssignment[] = []
    for (const p of profiles) {
      if (p.status !== 'active') continue
      const members = await dbProfiles.listMembers(p.id)
      if (members.some((m) => m.role === 'manager')) continue
      eligible.push({ profile_id: p.id, role: 'manager' })
    }
    return eligible
  }

  return []
}

export async function createInvite(
  userId: string,
  raw: unknown
): Promise<{ invite: TeamInvite; redeem_url: string }> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owners and managers can invite members')
  }
  const parsed = InviteCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid invite', parsed.error.issues)
  }

  // Combined manager and Upwork manager both grant manager-level
  // authority somewhere — restrict creation to owners. (Outbound
  // managers can still invite bidders / lead-gen / cold-caller / closer.)
  const grantsManagerAuthority =
    parsed.data.preset === 'outbound_manager' ||
    parsed.data.preset === 'upwork_manager' ||
    parsed.data.preset === 'combined_manager'
  if (grantsManagerAuthority && role !== 'owner') {
    throw new ForbiddenError('Only an owner can invite a manager')
  }

  const teamRole = presetToTeamRole(parsed.data.preset)
  const upworkAssignments = await resolveUpworkAssignments(
    teamId,
    parsed.data.preset,
    parsed.data.profile_ids
  )

  const token = randomBytes(32).toString('hex')
  let invite: TeamInvite
  try {
    invite = await dbTeams.createInvite({
      teamId,
      email: parsed.data.email,
      role: teamRole,
      invitedBy: userId,
      token,
      upworkAssignments,
    })
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.includes('team_invites_pending_email_idx')) {
      throw new ConflictError(`${parsed.data.email} already has a pending invite to this team`)
    }
    throw err
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  const redeemUrl = `${baseUrl}/invite/${token}`

  try {
    await supabaseAdmin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { invite_token: token, team_id: teamId, role: teamRole },
      redirectTo: redeemUrl,
    })
  } catch (e: any) {
    console.warn('[invite] magic-link send failed (non-fatal):', e?.message ?? e)
  }

  return { invite, redeem_url: redeemUrl }
}

export async function revokeInvite(userId: string, inviteId: string): Promise<void> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owners and managers can revoke invites')
  }
  await dbTeams.deleteInvite(teamId, inviteId)
}

export async function redeemInvite(
  userId: string,
  userEmail: string | null,
  raw: unknown
): Promise<{ team_id: string }> {
  const parsed = InviteRedeemInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid redeem', parsed.error.issues)
  }
  const invite = await dbTeams.getInviteByToken(parsed.data.token)
  if (!invite) throw new NotFoundError('Invite not found or expired')
  if (invite.accepted_at) throw new ConflictError('Invite already redeemed')
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new ConflictError('Invite has expired — ask for a new one')
  }
  if (invite.email.toLowerCase() !== (userEmail ?? '').toLowerCase()) {
    throw new ForbiddenError(
      `This invite was sent to ${invite.email}. Sign in with that account to redeem.`
    )
  }

  const existing = await dbTeams.getMembership(invite.team_id, userId)
  if (!existing) {
    await dbTeams.addMember({
      teamId: invite.team_id,
      userId,
      role: invite.role,
    })
  }

  // Fan out the snapshot of Upwork profile assignments. Manager-on-
  // profile entries skip silently if a manager has shown up since the
  // snapshot — partial unique index would reject the second one anyway,
  // and the team owner can finish the assignment manually. Bidder
  // entries skip if the user is already a member of that profile.
  for (const assignment of invite.upwork_assignments_json) {
    const existingMembers = await dbProfiles.listMembers(assignment.profile_id)
    if (existingMembers.some((m) => m.user_id === userId)) continue
    if (assignment.role === 'manager' && existingMembers.some((m) => m.role === 'manager')) {
      console.warn(
        `[invite ${invite.id}] skipping manager fan-out for profile ${assignment.profile_id} — manager already exists`
      )
      continue
    }
    try {
      await dbProfiles.addMember({
        profile_id: assignment.profile_id,
        user_id: userId,
        role: assignment.role,
        invited_by: invite.invited_by,
      })
    } catch (err: any) {
      console.warn(
        `[invite ${invite.id}] failed to fan out ${assignment.role} on profile ${assignment.profile_id}:`,
        err?.message ?? err
      )
    }
  }

  await dbTeams.markInviteAccepted(invite.id, userId)
  return { team_id: invite.team_id }
}

/** Counts how many owners currently exist on a team. */
async function countOwners(teamId: string): Promise<number> {
  const members = await dbTeams.listMembers(teamId)
  return members.filter((m) => m.role === 'owner').length
}

export async function changeMemberRole(
  userId: string,
  targetUserId: string,
  raw: unknown
): Promise<void> {
  const { teamId, role: myRole } = await requireTeamAccess(userId)
  if (myRole !== 'owner' && myRole !== 'manager') {
    throw new ForbiddenError('Only owners and managers can change member roles')
  }
  const parsed = RoleChangeInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid role', parsed.error.issues)
  }
  const target = await dbTeams.getMembership(teamId, targetUserId)
  if (!target) throw new NotFoundError('Member not found')

  const newRole = parsed.data.role
  const isSelf = targetUserId === userId

  // Only an existing owner can promote to or demote from 'owner'.
  if ((newRole === 'owner' || target.role === 'owner') && myRole !== 'owner') {
    throw new ForbiddenError('Only an owner can promote or demote owners')
  }

  // Self-demotion: allowed when another owner exists. This is the
  // primary "step down" path now that 2 owners are supported.
  if (isSelf && target.role === 'owner' && newRole !== 'owner') {
    const owners = await countOwners(teamId)
    if (owners <= 1) {
      throw new ValidationError(
        'You are the only owner — promote another member to owner before stepping down.'
      )
    }
  } else if (isSelf) {
    // Other self-changes still blocked (only step-down is meaningful).
    throw new ValidationError('You cannot change your own role')
  }

  // Promotion to owner: respect the ≤2 cap. The DB trigger enforces this
  // too, but we check here for a friendlier error message.
  if (newRole === 'owner' && target.role !== 'owner') {
    const owners = await countOwners(teamId)
    if (owners >= 2) {
      throw new ValidationError(
        'Team already has the maximum of 2 owners. Demote one first.'
      )
    }
  }

  // Demoting an owner that isn't yourself — must keep at least one owner.
  if (target.role === 'owner' && newRole !== 'owner' && !isSelf) {
    const owners = await countOwners(teamId)
    if (owners <= 1) {
      throw new ValidationError('Cannot demote the only owner.')
    }
  }

  // Manager promotion still owner-only (matches prior behavior).
  if (newRole === 'manager' && target.role !== 'manager' && myRole !== 'owner') {
    throw new ForbiddenError('Only an owner can promote members to manager')
  }

  await dbTeams.setMemberRole(teamId, targetUserId, newRole)
}

export async function removeMember(userId: string, targetUserId: string): Promise<void> {
  const { teamId, role: myRole } = await requireTeamAccess(userId)
  if (myRole !== 'owner') {
    throw new ForbiddenError('Only an owner can remove members')
  }
  if (targetUserId === userId) {
    throw new ValidationError(
      'You cannot remove yourself. Step down to manager first (if a second owner exists), then ask the other owner to remove you.'
    )
  }
  const target = await dbTeams.getMembership(teamId, targetUserId)
  if (!target) throw new NotFoundError('Member not found')

  // Removing another owner is allowed (2-owner mode), but never the last.
  if (target.role === 'owner') {
    const owners = await countOwners(teamId)
    if (owners <= 1) {
      throw new ValidationError('Cannot remove the only owner.')
    }
  }

  await dbTeams.dropMemberEmailAccountsForTeam(teamId, targetUserId)
  await dbTeams.removeMember(teamId, targetUserId)
}

export async function transferOwnership(userId: string, raw: unknown): Promise<void> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (role !== 'owner') {
    throw new ForbiddenError('Only the current owner can transfer ownership')
  }
  const parsed = OwnershipTransferInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  await dbTeams.transferOwnership(teamId, parsed.data.user_id)
}

