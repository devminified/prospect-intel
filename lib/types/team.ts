import { z } from 'zod'

export const RoleSchema = z.enum([
  'owner',
  'manager',
  'lead_gen',
  'cold_caller',
  'closer',
  'bidder',
])
export type Role = z.infer<typeof RoleSchema>

/**
 * Roles that can be invited via the magic-link flow. 'owner' is excluded
 * because there's exactly one per team and it's set at team creation.
 */
export const InvitableRoleSchema = z.enum(['manager', 'lead_gen', 'cold_caller', 'closer'])
export type InvitableRole = z.infer<typeof InvitableRoleSchema>

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
})
export type Team = z.infer<typeof TeamSchema>

export const TeamMemberSchema = z.object({
  team_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: RoleSchema,
  invited_by: z.string().uuid().nullable().optional(),
  joined_at: z.string(),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>

/** API-shape — the TeamMember row enriched with the auth.users.email lookup. */
export const TeamMemberWithEmailSchema = TeamMemberSchema.extend({
  email: z.string().nullable(),
  is_self: z.boolean().optional(),
})
export type TeamMemberWithEmail = z.infer<typeof TeamMemberWithEmailSchema>

export const TeamInviteSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  email: z.string(),
  role: InvitableRoleSchema,
  invited_by: z.string().uuid(),
  token: z.string(),
  expires_at: z.string(),
  accepted_at: z.string().nullable(),
  accepted_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
})
export type TeamInvite = z.infer<typeof TeamInviteSchema>

export const TeamRenameInputSchema = z.object({
  name: z.string().trim().min(1, 'Team name cannot be empty').max(80, 'Team name too long (max 80 chars)'),
})
export type TeamRenameInput = z.infer<typeof TeamRenameInputSchema>

export const InviteCreateInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email required'),
  role: InvitableRoleSchema,
})
export type InviteCreateInput = z.infer<typeof InviteCreateInputSchema>

export const InviteRedeemInputSchema = z.object({
  token: z.string().min(1, 'Missing invite token'),
})
export type InviteRedeemInput = z.infer<typeof InviteRedeemInputSchema>

/**
 * Role transitions accepted by `PATCH /api/team/members/[id]`. Includes
 * 'owner' for promotions; service layer enforces the ≤2-owner cap and
 * the rule that only existing owners can promote/demote owners.
 */
export const RoleChangeInputSchema = z.object({
  role: z.enum(['owner', 'manager', 'lead_gen', 'cold_caller', 'closer']),
})
export type RoleChangeInput = z.infer<typeof RoleChangeInputSchema>

export const OwnershipTransferInputSchema = z.object({
  user_id: z.string().uuid('user_id must be a uuid'),
})
export type OwnershipTransferInput = z.infer<typeof OwnershipTransferInputSchema>

/**
 * Aggregate returned by `GET /api/team` — the team row plus its
 * members (with auth.users.email folded in) and pending invites, plus
 * the caller's role on this team. Consumed by /settings/team and the
 * `useCurrentTeam` query.
 */
export interface TeamView {
  team: Team
  members: TeamMemberWithEmail[]
  invites: TeamInvite[]
  my_role: Role
}

/** POST /api/team/invites response — redeem URL is shown in the UI when SMTP isn't configured. */
export interface CreateInviteResponse {
  redeem_url?: string
}

/**
 * Per-member rollup over the last N days, returned by GET /api/team/progress.
 * Used by the team-progress card on /dashboard. Only owners + managers see
 * this — RBAC enforced in the service layer.
 *
 * `won` is total (not date-windowed) because it's a terminal state we want
 * to surface for the whole funnel, not just the recent window. The other
 * counts respect the `days` parameter.
 *
 * `user_id === null` represents the Unassigned bucket — leads no team
 * member owns yet.
 */
export interface TeamMemberProgress {
  user_id: string | null
  email: string | null
  role: Role | null
  leads_owned: number
  sent: number
  opened: number
  replied: number
  won: number
}

export interface TeamProgressResponse {
  rows: TeamMemberProgress[]
  days: number
}
