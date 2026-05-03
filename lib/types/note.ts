import { z } from 'zod'

export const NoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  user_id: z.string().uuid(),
})
export type Note = z.infer<typeof NoteSchema>

export const NoteCreateInputSchema = z.object({
  body: z.string().min(1, 'Note body cannot be empty').max(10_000, 'Note body too long (max 10000 chars)'),
})
export type NoteCreateInput = z.infer<typeof NoteCreateInputSchema>

export const NoteUpdateInputSchema = NoteCreateInputSchema
export type NoteUpdateInput = z.infer<typeof NoteUpdateInputSchema>
