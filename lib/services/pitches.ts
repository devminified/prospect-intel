import { supabaseAdmin } from '@/lib/supabase/server'
import { PitchStatusSchema, type PitchStatus } from '@/lib/types'
import { requireProspectAccess } from './access'
import { ValidationError } from './errors'

/**
 * Update pitch fields for a prospect. Today this is bundled into the
 * /api/prospects/:id PATCH route alongside prospect_status / outreach_status,
 * so the service mirrors that bundling. Future cleanup could extract a
 * dedicated /api/pitches/:id route if multiple consumers need it.
 */
export async function update(
  userId: string,
  prospectId: string,
  patch: { edited_body?: string; status?: string }
): Promise<void> {
  await requireProspectAccess(userId, prospectId)

  const update: Record<string, unknown> = {}
  if (patch.edited_body !== undefined) {
    if (typeof patch.edited_body !== 'string') {
      throw new ValidationError('pitch_edited_body must be a string')
    }
    update.edited_body = patch.edited_body
  }
  if (patch.status !== undefined) {
    const parsed = PitchStatusSchema.safeParse(patch.status)
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid pitch_status. Allowed: ${PitchStatusSchema.options.join(', ')}`
      )
    }
    const status: PitchStatus = parsed.data
    update.status = status
    if (status === 'approved') update.approved_at = new Date().toISOString()
    if (status === 'sent') update.sent_at = new Date().toISOString()
  }
  if (Object.keys(update).length === 0) return

  const { error } = await supabaseAdmin
    .from('pitches')
    .update(update)
    .eq('prospect_id', prospectId)
  if (error) throw new Error(`pitches.update: ${error.message}`)
}
