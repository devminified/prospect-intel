import { z } from 'zod'

export const PitchStatusSchema = z.enum(['draft', 'approved', 'sent', 'replied'])
export type PitchStatus = z.infer<typeof PitchStatusSchema>

export const PitchSchema = z.object({
  id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  edited_body: z.string().nullable(),
  status: PitchStatusSchema,
  approved_at: z.string().nullable().optional(),
  sent_at: z.string().nullable().optional(),
})
export type Pitch = z.infer<typeof PitchSchema>

export const PitchPatchInputSchema = z.object({
  edited_body: z.string().optional(),
  status: PitchStatusSchema.optional(),
})
export type PitchPatchInput = z.infer<typeof PitchPatchInputSchema>
