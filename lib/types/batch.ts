import { z } from 'zod'

export const BatchStatusSchema = z.enum(['processing', 'done', 'failed'])
export type BatchStatus = z.infer<typeof BatchStatusSchema>

export const BatchSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  team_id: z.string().uuid(),
  city: z.string(),
  category: z.string(),
  count_requested: z.number().int(),
  count_completed: z.number().int().optional(),
  count_filtered_below_icp: z.number().int().default(0),
  count_duplicates_skipped: z.number().int().default(0),
  status: BatchStatusSchema,
  auto_enrich_top_n: z.number().int().default(0).optional(),
  pitch_score_threshold: z.number().int().nullable().optional(),
  created_at: z.string(),
})
export type Batch = z.infer<typeof BatchSchema>

export const BatchCreateInputSchema = z.object({
  city: z.string().trim().min(1, 'City required'),
  category: z.string().trim().min(1, 'Category required'),
  count: z.number().int().min(1, 'Count must be at least 1').max(50, 'Count must be at most 50'),
  auto_enrich_top_n: z.number().int().min(0).max(50).optional(),
  pitch_score_threshold: z.number().int().min(0).max(100).nullable().optional(),
})
export type BatchCreateInput = z.infer<typeof BatchCreateInputSchema>

/**
 * Wire shape for `POST /api/batches` from the browser. Distinct from
 * `BatchCreateInput` (which the server uses post-validation) because the
 * client always sends every field — the server-side schema makes the
 * optionals truly optional via `.optional()`.
 */
export interface CreateBatchClientInput {
  city: string
  category: string
  count: number
  auto_enrich_top_n: number
  pitch_score_threshold: number | null
}

export interface CreateBatchResponse {
  prospects_created: number
}
