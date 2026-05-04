import { z } from 'zod'

export const IcpProfileSchema = z.object({
  user_id: z.string().uuid(),
  team_id: z.string().uuid().optional(),
  services: z.array(z.string()).default([]),
  avg_deal_size: z.number().nullable(),
  daily_capacity: z.number().int().min(0).max(500),
  preferred_cities: z.array(z.string()).default([]),
  excluded_cities: z.array(z.string()).default([]),
  min_gmb_rating: z.number().nullable(),
  min_review_count: z.number().int().nullable(),
  target_categories: z.array(z.string()).default([]),
  require_linkedin: z.boolean().default(false),
  require_instagram: z.boolean().default(false),
  require_facebook: z.boolean().default(false),
  require_business_phone: z.boolean().default(false),
  require_reachable: z.boolean().default(false).optional(),
  updated_at: z.string().optional(),
})
export type IcpProfile = z.infer<typeof IcpProfileSchema>

const stringArray = z.array(z.unknown()).transform((arr) =>
  arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
)

export const IcpPatchInputSchema = z.object({
  services: stringArray.default([]),
  avg_deal_size: z.union([z.number(), z.string(), z.null()]).optional(),
  daily_capacity: z.union([z.number(), z.string()]).default(0),
  preferred_cities: stringArray.default([]),
  excluded_cities: stringArray.default([]),
  min_gmb_rating: z.union([z.number(), z.string(), z.null()]).optional(),
  min_review_count: z.union([z.number(), z.string(), z.null()]).optional(),
  target_categories: stringArray.default([]),
  require_linkedin: z.boolean().default(false),
  require_instagram: z.boolean().default(false),
  require_facebook: z.boolean().default(false),
  require_business_phone: z.boolean().default(false),
  require_reachable: z.boolean().default(false),
})
export type IcpPatchInput = z.infer<typeof IcpPatchInputSchema>

/**
 * UI-form shape for the /settings/icp page. Slimmer than `IcpProfile`
 * (no user_id / team_id / updated_at — those are server-managed and not
 * part of the form state). Used as the page's local `useState` shape.
 */
export interface IcpFormState {
  services: string[]
  avg_deal_size: number | null
  daily_capacity: number
  preferred_cities: string[]
  excluded_cities: string[]
  min_gmb_rating: number | null
  min_review_count: number | null
  target_categories: string[]
  require_linkedin: boolean
  require_instagram: boolean
  require_facebook: boolean
  require_business_phone: boolean
  require_reachable: boolean
}

/** GET /api/icp wire shape — `icp` is undefined when none is saved yet. */
export interface IcpResponse {
  icp?: Partial<IcpFormState>
}
