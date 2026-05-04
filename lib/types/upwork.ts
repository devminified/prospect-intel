import { z } from 'zod'

/**
 * Upwork module types — Phase 11A foundation. The module lives parallel
 * to the outbound-leads side, isolated by per-profile membership rather
 * than the team-wide role model used for outbound RBAC.
 */

// ─── Upwork-specific role names ────────────────────────────────────

export const UpworkProfileRoleSchema = z.enum(['manager', 'bidder'])
export type UpworkProfileRole = z.infer<typeof UpworkProfileRoleSchema>

// ─── Profiles ──────────────────────────────────────────────────────

export const UpworkProfileStatusSchema = z.enum(['active', 'paused', 'archived'])
export type UpworkProfileStatus = z.infer<typeof UpworkProfileStatusSchema>

export const UpworkAccountTypeSchema = z.enum(['individual', 'agency'])
export type UpworkAccountType = z.infer<typeof UpworkAccountTypeSchema>

export const UpworkProfileSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  profile_url: z.string().nullable(),
  account_type: UpworkAccountTypeSchema,
  hourly_rate_usd: z.number().nullable(),
  connects_balance: z.number().int(),
  status: UpworkProfileStatusSchema,
  archived_at: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkProfile = z.infer<typeof UpworkProfileSchema>

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

export const UpworkProfileCreateInputSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'Slug must be 1–40 chars, lowercase letters/numbers/hyphens'),
  description: z.string().trim().max(2000).optional().nullable(),
  profile_url: z
    .string()
    .trim()
    .url('Profile URL must be a full URL')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  account_type: UpworkAccountTypeSchema.default('individual'),
  hourly_rate_usd: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null || v === '') return null
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }),
})
export type UpworkProfileCreateInput = z.infer<typeof UpworkProfileCreateInputSchema>

export const UpworkProfileUpdateInputSchema = UpworkProfileCreateInputSchema.partial().extend({
  status: UpworkProfileStatusSchema.optional(),
  connects_balance: z.number().int().min(0).optional(),
})
export type UpworkProfileUpdateInput = z.infer<typeof UpworkProfileUpdateInputSchema>

// ─── Profile members ───────────────────────────────────────────────

export const UpworkProfileMemberSchema = z.object({
  profile_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: UpworkProfileRoleSchema,
  joined_at: z.string(),
  invited_by: z.string().uuid().nullable(),
})
export type UpworkProfileMember = z.infer<typeof UpworkProfileMemberSchema>

/**
 * Membership row enriched with the user's auth.users.email — drives the
 * /upwork/profiles/[id] members table.
 */
export interface UpworkProfileMemberWithEmail extends UpworkProfileMember {
  email: string | null
  is_self: boolean
}

export const UpworkProfileMemberAddInputSchema = z.object({
  user_id: z.string().uuid('user_id must be a uuid'),
  role: UpworkProfileRoleSchema,
})
export type UpworkProfileMemberAddInput = z.infer<typeof UpworkProfileMemberAddInputSchema>

export const UpworkProfileMemberRoleChangeInputSchema = z.object({
  role: UpworkProfileRoleSchema,
})
export type UpworkProfileMemberRoleChangeInput = z.infer<
  typeof UpworkProfileMemberRoleChangeInputSchema
>

// ─── Aggregate "profile detail" view ───────────────────────────────

export interface UpworkProfileDetail {
  profile: UpworkProfile
  members: UpworkProfileMemberWithEmail[]
  /** Caller's per-profile role; null if they only have access via team owner/manager. */
  my_profile_role: UpworkProfileRole | null
  /** Whether the caller can manage this profile (manager-of-profile OR team owner/manager). */
  can_manage: boolean
}

// ─── Clients ───────────────────────────────────────────────────────

export const UpworkClientStatusSchema = z.enum(['active', 'do_not_pursue', 'archived'])
export type UpworkClientStatus = z.infer<typeof UpworkClientStatusSchema>

export const UpworkClientSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  upwork_client_id: z.string().nullable(),
  display_name: z.string(),
  country: z.string().nullable(),
  payment_verified: z.boolean().nullable(),
  total_spent_usd: z.number().nullable(),
  hire_rate: z.number().nullable(),
  avg_hourly_paid_usd: z.number().nullable(),
  jobs_posted: z.number().int().nullable(),
  member_since: z.string().nullable(),
  status: UpworkClientStatusSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
})
export type UpworkClient = z.infer<typeof UpworkClientSchema>

// ─── Caller's Upwork access summary ────────────────────────────────

/**
 * Returned by `GET /api/upwork/access` — drives the nav gate + the
 * pure-bidder redirect. `team_role` is the user's role on team_members
 * (or null if they're not on the team), `profile_count` is how many
 * upwork_profile_members rows they have.
 *
 * `has_access` = team_role is owner/manager OR profile_count > 0.
 * `is_pure_upwork` = team_role is 'bidder' AND has_access.
 */
export interface UpworkAccessInfo {
  team_role: string | null
  profile_count: number
  has_access: boolean
  is_pure_upwork: boolean
}
