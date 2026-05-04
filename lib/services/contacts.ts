import * as dbContacts from '@/lib/db/contacts'
import { ContactPatchInputSchema } from '@/lib/types'
import type { Contact, Role } from '@/lib/types'
import {
  canCreateBatch,
  canEditContact,
  roleForbiddenMessage,
} from '@/lib/rbac'
import {
  useBusinessPhone as legacyUseBusinessPhone,
  findDirectLine as legacyFindDirectLine,
  discoverPeople as legacyDiscoverPeople,
  revealEmail as legacyRevealEmail,
} from '@/lib/contacts'
import { requireProspectAccess } from './access'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'

/**
 * Service-layer wrappers around the legacy lib/contacts.ts mutation
 * functions. The legacy functions stay where they are for now (they're
 * the integration surface for Apollo/Lusha); these services add
 * ownership + role checks before delegating.
 *
 * Phone-edit role mapping:
 *   - Free actions (manual phone, business phone, name/linkedin edit):
 *     canEditContact = owner / manager / cold_caller / closer.
 *   - Lusha credit spend (find direct line): canCreateBatch =
 *     owner / manager / lead_gen.
 */

async function checkContactOwnership(prospectId: string, contactId: string): Promise<Contact> {
  const contact = await dbContacts.getById(contactId)
  if (!contact || contact.prospect_id !== prospectId) {
    throw new NotFoundError('Contact not found')
  }
  return contact
}

export async function listForProspect(userId: string, prospectId: string): Promise<Contact[]> {
  await requireProspectAccess(userId, prospectId)
  return dbContacts.listByProspect(prospectId)
}

export async function patch(
  userId: string,
  prospectId: string,
  contactId: string,
  raw: unknown
): Promise<void> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canEditContact(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'edit contact details'))
  }
  await checkContactOwnership(prospectId, contactId)

  const parsed = ContactPatchInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const patchPayload: Parameters<typeof dbContacts.update>[1] = {}

  if ('linkedin_url' in parsed.data) {
    const v = parsed.data.linkedin_url
    patchPayload.linkedin_url = v === undefined || v === null || v === '' ? null : v.trim()
  }
  if ('first_name' in parsed.data) {
    patchPayload.first_name =
      parsed.data.first_name === undefined || parsed.data.first_name === null || parsed.data.first_name === ''
        ? null
        : (parsed.data.first_name as string).trim() || null
  }
  if ('last_name' in parsed.data) {
    patchPayload.last_name =
      parsed.data.last_name === undefined || parsed.data.last_name === null || parsed.data.last_name === ''
        ? null
        : (parsed.data.last_name as string).trim() || null
  }
  if ('full_name' in parsed.data) {
    patchPayload.full_name =
      parsed.data.full_name === undefined || parsed.data.full_name === null || parsed.data.full_name === ''
        ? null
        : (parsed.data.full_name as string).trim() || null
  }
  if ('phone' in parsed.data) {
    if (parsed.data.phone === undefined || parsed.data.phone === null || parsed.data.phone === '') {
      patchPayload.phone = null
      patchPayload.phone_source = null
      patchPayload.phone_revealed_at = null
    } else {
      patchPayload.phone = (parsed.data.phone as string).trim()
      patchPayload.phone_source = 'manual'
      patchPayload.phone_revealed_at = new Date().toISOString()
    }
  }

  if (Object.keys(patchPayload).length === 0) {
    throw new ValidationError('No editable fields provided')
  }

  await dbContacts.update(contactId, patchPayload)
}

export async function useBusinessPhone(
  userId: string,
  prospectId: string,
  contactId: string
): Promise<{ phone: string | null }> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canEditContact(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'edit contact phone'))
  }
  await checkContactOwnership(prospectId, contactId)
  return legacyUseBusinessPhone(contactId)
}

export async function findDirectLine(
  userId: string,
  prospectId: string,
  contactId: string
): Promise<{ phone: string | null }> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(
      roleForbiddenMessage(role as Role, 'spend Lusha credits to find a direct line')
    )
  }
  await checkContactOwnership(prospectId, contactId)
  return legacyFindDirectLine(contactId)
}

/**
 * Apollo people-search to populate the prospect's contacts table. Spends
 * Apollo people-search quota (no per-credit cost for this endpoint), so
 * gated on canCreateBatch (lead_gen / manager / owner) — same group that
 * runs the lead-generation pipeline.
 */
export async function discover(userId: string, prospectId: string): Promise<void> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(
      roleForbiddenMessage(role as Role, 'discover contacts (spends Apollo quota)')
    )
  }
  await legacyDiscoverPeople(prospectId)
}

/**
 * Spend one Apollo email credit to reveal a contact's verified email.
 * Gated on canCreateBatch since this is a credit-spending lead-gen action.
 */
export async function revealEmail(
  userId: string,
  prospectId: string,
  contactId: string
): Promise<{ email: string | null }> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(
      roleForbiddenMessage(role as Role, 'spend Apollo credits to reveal an email')
    )
  }
  await checkContactOwnership(prospectId, contactId)
  return legacyRevealEmail(contactId)
}
