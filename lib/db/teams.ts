import { supabaseAdmin } from '@/lib/supabase/server'
import type { Role, Team, TeamInvite, TeamMember } from '@/lib/types'

export async function getById(teamId: string): Promise<Team | null> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, created_at')
    .eq('id', teamId)
    .maybeSingle()
  if (error) throw new Error(`db.teams.getById: ${error.message}`)
  return (data as Team | null) ?? null
}

export async function rename(teamId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin.from('teams').update({ name }).eq('id', teamId)
  if (error) throw new Error(`db.teams.rename: ${error.message}`)
}

export async function listMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id, user_id, role, joined_at')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(`db.teams.listMembers: ${error.message}`)
  return (data as TeamMember[] | null) ?? []
}

export async function getMembership(
  teamId: string,
  userId: string
): Promise<{ role: Role } | null> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`db.teams.getMembership: ${error.message}`)
  return data ? { role: (data as any).role as Role } : null
}

export async function setMemberRole(teamId: string, userId: string, role: Role): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw new Error(`db.teams.setMemberRole: ${error.message}`)
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw new Error(`db.teams.removeMember: ${error.message}`)
}

/**
 * Atomic ownership transfer via the M50 `transfer_team_ownership`
 * SQL function. Demotes the current owner to 'manager' and promotes
 * the target in a single PL/pgSQL block.
 */
export async function transferOwnership(teamId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('transfer_team_ownership', {
    p_team_id: teamId,
    p_new_owner: newOwnerId,
  })
  if (error) throw new Error(`db.teams.transferOwnership: ${error.message}`)
}

export async function listPendingInvites(teamId: string): Promise<TeamInvite[]> {
  const { data, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id, email, role, invited_by, token, expires_at, accepted_at, created_at')
    .eq('team_id', teamId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`db.teams.listPendingInvites: ${error.message}`)
  return (data as TeamInvite[] | null) ?? []
}

export async function createInvite(input: {
  teamId: string
  email: string
  role: Role
  invitedBy: string
  token: string
}): Promise<TeamInvite> {
  const { data, error } = await supabaseAdmin
    .from('team_invites')
    .insert({
      team_id: input.teamId,
      email: input.email,
      role: input.role,
      invited_by: input.invitedBy,
      token: input.token,
    })
    .select('id, team_id, email, role, invited_by, token, expires_at, accepted_at, created_at')
    .single()
  if (error || !data) throw new Error(`db.teams.createInvite: ${error?.message ?? 'no row returned'}`)
  return data as TeamInvite
}

export async function deleteInvite(teamId: string, inviteId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_invites')
    .delete()
    .eq('id', inviteId)
    .eq('team_id', teamId)
  if (error) throw new Error(`db.teams.deleteInvite: ${error.message}`)
}

export async function getInviteByToken(token: string): Promise<TeamInvite | null> {
  const { data, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id, email, role, invited_by, token, expires_at, accepted_at, created_at')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(`db.teams.getInviteByToken: ${error.message}`)
  return (data as TeamInvite | null) ?? null
}

export async function markInviteAccepted(inviteId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', inviteId)
  if (error) throw new Error(`db.teams.markInviteAccepted: ${error.message}`)
}

export async function addMember(input: {
  teamId: string
  userId: string
  role: Role
  invitedBy?: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('team_members').insert({
    team_id: input.teamId,
    user_id: input.userId,
    role: input.role,
    invited_by: input.invitedBy ?? null,
  })
  if (error) throw new Error(`db.teams.addMember: ${error.message}`)
}

/**
 * Deletes the email_accounts a removed member had connected for THIS
 * team — only that user holds the Zoho tokens; the row would be
 * unusable to others. Other teams' rows for the same user are
 * unaffected. Best-effort: failure is logged, not thrown, so member
 * removal still proceeds.
 */
export async function dropMemberEmailAccountsForTeam(
  teamId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('email_accounts')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) {
    console.warn('db.teams.dropMemberEmailAccountsForTeam:', error.message)
  }
}

