import * as dbProspects from '@/lib/db/prospects'
import * as dbTeams from '@/lib/db/teams'
import { DealStageSchema, OutreachStatusSchema, ProspectStatusSchema } from '@/lib/types'
import type { Role } from '@/lib/types'
import { canSetOutreachStatus, roleForbiddenMessage } from '@/lib/rbac'
import { requireProspectAccess } from './access'
import { ForbiddenError, ValidationError } from './errors'

const ALLOWED_PROSPECT_STATUSES = ProspectStatusSchema.options.filter((s) => s !== 'failed' && s !== 'filtered_out')

export async function setStatus(
  userId: string,
  prospectId: string,
  raw: unknown
): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  if (typeof raw !== 'string') {
    throw new ValidationError('prospect_status must be a string')
  }
  if (!(ALLOWED_PROSPECT_STATUSES as readonly string[]).includes(raw)) {
    throw new ValidationError(
      `Invalid prospect_status. Allowed: ${ALLOWED_PROSPECT_STATUSES.join(', ')}`
    )
  }
  await dbProspects.update(prospectId, { status: raw as any })
}

export async function setOutreachStatus(
  userId: string,
  prospectId: string,
  raw: unknown
): Promise<void> {
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canSetOutreachStatus(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'change outreach status'))
  }

  if (raw === null || raw === '') {
    await dbProspects.update(prospectId, { outreach_status: null })
    return
  }
  const parsed = OutreachStatusSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid outreach_status. Allowed: ${OutreachStatusSchema.options.join(', ')}`
    )
  }
  await dbProspects.update(prospectId, { outreach_status: parsed.data })
}

export async function assign(
  userId: string,
  prospectId: string,
  rawTargetUserId: unknown
): Promise<void> {
  const { teamId, role } = await requireProspectAccess(userId, prospectId)

  if (rawTargetUserId === null || rawTargetUserId === '') {
    await dbProspects.update(prospectId, { assigned_to: null, assigned_at: null })
    return
  }
  if (typeof rawTargetUserId !== 'string') {
    throw new ValidationError('assigned_to must be a user id or null')
  }
  const isSelfAssign = rawTargetUserId === userId
  if (!isSelfAssign && role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError(
      roleForbiddenMessage(role as Role, 'assign leads to other members (only self-assignment allowed)')
    )
  }

  // Verify target is a member of the same team. (The on delete set null
  // FK guarantees we never get a dangling reference if the target leaves
  // later — but at insert time we still want a clean error if you typo
  // a userId or pass someone outside the team.)
  const target = await dbTeams.getMembership(teamId, rawTargetUserId)
  if (!target) {
    throw new ValidationError('Target user is not a member of your team')
  }

  await dbProspects.update(prospectId, {
    assigned_to: rawTargetUserId,
    assigned_at: new Date().toISOString(),
  })
}

export async function markViewed(userId: string, prospectId: string): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  await dbProspects.markViewed(prospectId)
}

export async function setDealStage(
  userId: string,
  prospectId: string,
  raw: unknown
): Promise<void> {
  // Same RBAC as outreach_status — anyone who can record a call outcome
  // should be able to advance the deal stage. Owners/managers always
  // can; closers / cold-callers / lead-gen do via canSetOutreachStatus.
  const { role } = await requireProspectAccess(userId, prospectId)
  if (!canSetOutreachStatus(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'change deal stage'))
  }

  const parsed = DealStageSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid deal_stage. Allowed: ${DealStageSchema.options.join(', ')}`
    )
  }
  await dbProspects.update(prospectId, {
    deal_stage: parsed.data,
    deal_stage_changed_at: new Date().toISOString(),
  })
}
