import { z } from 'zod'

export const RecommendedChannelSchema = z.enum(['phone', 'email', 'either'])
export type RecommendedChannel = z.infer<typeof RecommendedChannelSchema>

export const ChannelRecommendationSchema = z.object({
  prospect_id: z.string().uuid().optional(),
  phone_fit_score: z.number().int().min(0).max(100),
  email_fit_score: z.number().int().min(0).max(100),
  recommended_channel: RecommendedChannelSchema,
  reasoning: z.string(),
  phone_script: z.string(),
  generated_at: z.string().optional(),
})
export type ChannelRecommendation = z.infer<typeof ChannelRecommendationSchema>
