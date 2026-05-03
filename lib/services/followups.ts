import * as dbFollowups from '@/lib/db/followups'
import { FollowupCreateInputSchema, FollowupUpdateInputSchema } from '@/lib/types'
import type { Followup } from '@/lib/types'
import { requireProspectAccess } from './access'
import { NotFoundError, ValidationError } from './errors'

/**
 * Follow-ups are scheduling annotations. Like notes, they're open to
 * any team member — anyone calling a prospect should be able to set
 * a reminder for themselves.
 */

export async function listForProspect(userId: string, prospectId: string): Promise<Followup[]> {
  await requireProspectAccess(userId, prospectId)
  return dbFollowups.listByProspect(prospectId)
}

export async function add(
  userId: string,
  prospectId: string,
  raw: unknown
): Promise<Followup> {
  await requireProspectAccess(userId, prospectId)
  const parsed = FollowupCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid follow-up', parsed.error.issues)
  }
  const dueAtIso = new Date(parsed.data.due_at).toISOString()
  return dbFollowups.create({
    prospectId,
    userId,
    dueAt: dueAtIso,
    note: parsed.data.note?.trim() || null,
  })
}

export async function update(
  userId: string,
  prospectId: string,
  followupId: string,
  raw: unknown
): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  const owns = await dbFollowups.findOwnership(followupId)
  if (!owns) throw new NotFoundError('Follow-up not found')
  if (owns.prospect_id !== prospectId) {
    throw new NotFoundError('Follow-up does not belong to this prospect')
  }

  const parsed = FollowupUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid update', parsed.error.issues)
  }

  const patch: Parameters<typeof dbFollowups.update>[1] = {}
  if (parsed.data.due_at !== undefined) {
    patch.due_at = new Date(parsed.data.due_at).toISOString()
  }
  if (parsed.data.note !== undefined) {
    patch.note = parsed.data.note?.trim() || null
  }
  if (parsed.data.done !== undefined) {
    patch.done = parsed.data.done
    patch.done_at = parsed.data.done ? new Date().toISOString() : null
  }
  await dbFollowups.update(followupId, patch)
}

export async function remove(
  userId: string,
  prospectId: string,
  followupId: string
): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  const owns = await dbFollowups.findOwnership(followupId)
  if (!owns) throw new NotFoundError('Follow-up not found')
  if (owns.prospect_id !== prospectId) {
    throw new NotFoundError('Follow-up does not belong to this prospect')
  }
  await dbFollowups.remove(followupId)
}
