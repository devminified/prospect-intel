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
