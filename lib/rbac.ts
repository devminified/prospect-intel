import { supabaseAdmin } from './supabase/server'

export type Role = 'owner' | 'manager' | 'lead_gen' | 'cold_caller' | 'closer'

/**
 * Returns the role the user holds on the given team, or null if not a
 * member. Used by API routes to gate write actions per the role matrix.
 *
 * Matrix:
 *   owner       — full access, billing, invite/remove/rename team
 *   manager     — full data access, invite/remove members
 *   lead_gen    — create batches/plans, edit ICP, find leads. NO email
 *                  send, NO outreach_status changes (only call/closer).
 *   cold_caller — set outreach_status, add notes/followups, edit
 *                  contact phone/name. NO batch creation, NO email send.
 *   closer      — send emails, set outreach_status, edit contacts.
 *                  NO batch/plan creation, NO ICP edits.
 *
 * All roles can READ everything (RLS-enforced) and add notes/followups.
 */
export async function getUserRole(userId: string, teamId: string): Promise<Role | null> {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle()
  return ((data as any)?.role as Role | undefined) ?? null
}

const W = {
  ownerOrManager: new Set<Role>(['owner', 'manager']),
  createWork: new Set<Role>(['owner', 'manager', 'lead_gen']),
  sendEmail: new Set<Role>(['owner', 'manager', 'closer']),
  outreachWrite: new Set<Role>(['owner', 'manager', 'cold_caller', 'closer']),
  editContact: new Set<Role>(['owner', 'manager', 'cold_caller', 'closer']),
}

export function canCreateBatch(role: Role | null): boolean {
  return !!role && W.createWork.has(role)
}

export function canGeneratePlan(role: Role | null): boolean {
  return !!role && W.createWork.has(role)
}

export function canEditIcp(role: Role | null): boolean {
  return !!role && W.createWork.has(role)
}

export function canSendEmail(role: Role | null): boolean {
  return !!role && W.sendEmail.has(role)
}

export function canSetOutreachStatus(role: Role | null): boolean {
  return !!role && W.outreachWrite.has(role)
}

export function canEditContact(role: Role | null): boolean {
  return !!role && W.editContact.has(role)
}

export function canManageTeam(role: Role | null): boolean {
  return !!role && W.ownerOrManager.has(role)
}

/** Convenience: human-readable forbidden message for the role + action. */
export function roleForbiddenMessage(role: Role | null, action: string): string {
  if (!role) return `You're not a member of this team.`
  return `Your role (${role}) does not permit: ${action}. Ask an owner or manager.`
}
