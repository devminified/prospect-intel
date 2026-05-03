import * as dbNotes from '@/lib/db/notes'
import { NoteCreateInputSchema, NoteUpdateInputSchema } from '@/lib/types'
import type { Note } from '@/lib/types'
import { requireProspectAccess } from './access'
import { NotFoundError, ValidationError } from './errors'

/**
 * All notes-related business logic. Routes call these after auth;
 * services do their own ownership + role checks. RLS is the second
 * line of defense at the SELECT/UPDATE level.
 *
 * Note creation and edits are open to ANY team member — adding context
 * isn't a privileged action. Delete is also open since a member should
 * be able to remove their own notes. (If we want to gate delete to
 * only-author or owner/manager later, the role check goes here.)
 */

export async function listForProspect(userId: string, prospectId: string): Promise<Note[]> {
  await requireProspectAccess(userId, prospectId)
  return dbNotes.listByProspect(prospectId)
}

export async function add(
  userId: string,
  prospectId: string,
  raw: unknown
): Promise<Note> {
  await requireProspectAccess(userId, prospectId)
  const parsed = NoteCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid note', parsed.error.issues)
  }
  return dbNotes.create({ prospectId, userId, body: parsed.data.body })
}

export async function edit(
  userId: string,
  prospectId: string,
  noteId: string,
  raw: unknown
): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  const owns = await dbNotes.findOwnership(noteId)
  if (!owns) throw new NotFoundError('Note not found')
  if (owns.prospect_id !== prospectId) {
    throw new NotFoundError('Note does not belong to this prospect')
  }
  const parsed = NoteUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid note', parsed.error.issues)
  }
  await dbNotes.update(noteId, parsed.data.body)
}

export async function remove(
  userId: string,
  prospectId: string,
  noteId: string
): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  const owns = await dbNotes.findOwnership(noteId)
  if (!owns) throw new NotFoundError('Note not found')
  if (owns.prospect_id !== prospectId) {
    throw new NotFoundError('Note does not belong to this prospect')
  }
  await dbNotes.remove(noteId)
}
