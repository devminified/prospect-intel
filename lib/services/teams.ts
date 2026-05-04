import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import * as dbTeams from '@/lib/db/teams'
import {
  InviteCreateInputSchema,
  InviteRedeemInputSchema,
  OwnershipTransferInputSchema,
  RoleChangeInputSchema,
  TeamRenameInputSchema,
} from '@/lib/types'
import type { Role, Team, TeamInvite, TeamMemberWithEmail } from '@/lib/types'
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

  const token = randomBytes(32).toString('hex')
  let invite: TeamInvite
  try {
    invite = await dbTeams.createInvite({
      teamId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: userId,
      token,
    })
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.includes('team_invites_pending_email_idx')) {
      throw new ConflictError(`${parsed.data.email} already has a pending invite to this team`)
    }
    throw err
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  const redeemUrl = `${baseUrl}/invite/${token}`

  // Best-effort magic-link dispatch — the redeem URL works even if
  // SMTP is dodgy, so we never fail the request on a send error.
  try {
    await supabaseAdmin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { invite_token: token, team_id: teamId, role: parsed.data.role },
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
  await dbTeams.markInviteAccepted(invite.id, userId)
  return { team_id: invite.team_id }
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
  if (targetUserId === userId) {
    throw new ValidationError('You cannot change your own role')
  }
  const parsed = RoleChangeInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid role', parsed.error.issues)
  }
  const target = await dbTeams.getMembership(teamId, targetUserId)
  if (!target) throw new NotFoundError('Member not found')
  if (target.role === 'owner') {
    throw new ValidationError('Use ownership transfer to change the owner role')
  }
  if (parsed.data.role === 'manager' && myRole !== 'owner') {
    throw new ForbiddenError('Only the owner can promote members to manager')
  }
  await dbTeams.setMemberRole(teamId, targetUserId, parsed.data.role)
}

export async function removeMember(userId: string, targetUserId: string): Promise<void> {
  const { teamId, role: myRole } = await requireTeamAccess(userId)
  if (myRole !== 'owner') {
    throw new ForbiddenError('Only the team owner can remove members')
  }
  if (targetUserId === userId) {
    throw new ValidationError(
      'You cannot remove yourself. Transfer ownership first, then leave from the new owner account.'
    )
  }
  const target = await dbTeams.getMembership(teamId, targetUserId)
  if (!target) throw new NotFoundError('Member not found')
  if (target.role === 'owner') {
    throw new ValidationError('Cannot remove the owner. Transfer ownership first.')
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

