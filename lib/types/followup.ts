import { z } from 'zod'

export const FollowupSchema = z.object({
  id: z.string().uuid(),
  due_at: z.string(),
  note: z.string().nullable(),
  done: z.boolean(),
  done_at: z.string().nullable(),
  created_at: z.string(),
})
export type Followup = z.infer<typeof FollowupSchema>

export const FollowupCreateInputSchema = z.object({
  due_at: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: 'due_at must be a valid date',
  }),
  note: z.string().max(1_000, 'Note too long (max 1000 chars)').nullable().optional(),
})
export type FollowupCreateInput = z.infer<typeof FollowupCreateInputSchema>

export const FollowupUpdateInputSchema = z
  .object({
    due_at: FollowupCreateInputSchema.shape.due_at.optional(),
    note: z.string().max(1_000).nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields provided' })
export type FollowupUpdateInput = z.infer<typeof FollowupUpdateInputSchema>
