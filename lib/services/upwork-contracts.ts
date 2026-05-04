import * as dbContracts from '@/lib/db/upwork-contracts'
import * as dbConv from '@/lib/db/upwork-conversations'
import * as dbProposals from '@/lib/db/upwork-proposals'
import {
  UpworkContractCreateInputSchema,
  UpworkContractStatusSchema,
  UpworkContractUpdateInputSchema,
  UpworkMilestoneCreateInputSchema,
  UpworkMilestoneUpdateInputSchema,
  UpworkTimeLogStatusChangeInputSchema,
  UpworkTimeLogUpsertInputSchema,
} from '@/lib/types'
import type {
  UpworkContract,
  UpworkContractDetail,
  UpworkContractStatus,
  UpworkMilestone,
  UpworkTimeLog,
} from '@/lib/types'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './errors'
import { requireUpworkProfileAccess } from './access'

/**
 * Contracts service. A contract is a signed Upwork engagement attached
 * to a profile. Fixed-price contracts use the milestones table; hourly
 * contracts use the time_logs table.
 *
 * RBAC:
 *   - Read: any profile member
 *   - Create / update / archive contract: profile manager OR owner
 *   - Add / change milestones: profile manager
 *   - Log hours: any profile member can log their own; manager edits all
 */

// ─── Contracts ────────────────────────────────────────────────────

export async function listForProfile(
  userId: string,
  profileId: string,
  opts: { status?: string | null } = {}
): Promise<UpworkContract[]> {
  await requireUpworkProfileAccess(userId, profileId)
  let status: UpworkContractStatus | 'any' = 'any'
  if (opts.status && opts.status !== 'any') {
    const parsed = UpworkContractStatusSchema.safeParse(opts.status)
    if (parsed.success) status = parsed.data
  }
  return dbContracts.listForProfile(profileId, { status })
}

export async function getDetail(
  userId: string,
  contractId: string
): Promise<UpworkContractDetail> {
  const contract = await dbContracts.getById(contractId)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  const [milestones, timeLogs] = await Promise.all([
    contract.contract_type === 'fixed' ? dbContracts.listMilestones(contractId) : Promise.resolve([] as UpworkMilestone[]),
    contract.contract_type === 'hourly' ? dbContracts.listTimeLogs(contractId) : Promise.resolve([] as UpworkTimeLog[]),
  ])
  return { contract, milestones, time_logs: timeLogs, can_manage: access.canManage }
}

export async function createContract(
  userId: string,
  raw: unknown
): Promise<UpworkContract> {
  const parsed = UpworkContractCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  const access = await requireUpworkProfileAccess(userId, parsed.data.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager or team owner can create contracts')
  }

  // FK sanity — proposal/conversation must belong to the same profile.
  if (parsed.data.proposal_id) {
    const proposal = await dbProposals.getById(parsed.data.proposal_id)
    if (!proposal || proposal.profile_id !== parsed.data.profile_id) {
      throw new ValidationError('Proposal does not belong to that profile')
    }
  }
  if (parsed.data.conversation_id) {
    const conv = await dbConv.getById(parsed.data.conversation_id)
    if (!conv || conv.profile_id !== parsed.data.profile_id) {
      throw new ValidationError('Conversation does not belong to that profile')
    }
  }
  if (parsed.data.contract_type === 'hourly' && parsed.data.agreed_rate_usd == null) {
    throw new ValidationError('Hourly contracts require an agreed_rate_usd')
  }

  const now = new Date().toISOString()
  return dbContracts.insert({
    profile_id: parsed.data.profile_id,
    proposal_id: parsed.data.proposal_id ?? null,
    conversation_id: parsed.data.conversation_id ?? null,
    client_id: parsed.data.client_id ?? null,
    upwork_contract_id: parsed.data.upwork_contract_id ?? null,
    title: parsed.data.title,
    contract_type: parsed.data.contract_type,
    agreed_total_usd: parsed.data.agreed_total_usd ?? null,
    agreed_rate_usd: parsed.data.agreed_rate_usd ?? null,
    status: 'active',
    end_reason: null,
    started_at: parsed.data.started_at ?? now,
    ended_at: null,
    notes: parsed.data.notes ?? null,
  })
}

export async function updateContract(
  userId: string,
  contractId: string,
  raw: unknown
): Promise<void> {
  const contract = await dbContracts.getById(contractId)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager or team owner can edit contracts')
  }
  const parsed = UpworkContractUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  const patch: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.upwork_contract_id !== undefined) patch.upwork_contract_id = parsed.data.upwork_contract_id ?? null
  if (parsed.data.agreed_total_usd !== undefined) patch.agreed_total_usd = parsed.data.agreed_total_usd
  if (parsed.data.agreed_rate_usd !== undefined) patch.agreed_rate_usd = parsed.data.agreed_rate_usd
  if (parsed.data.status !== undefined && parsed.data.status !== contract.status) {
    patch.status = parsed.data.status
    if (parsed.data.status === 'ended' && !contract.ended_at) {
      patch.ended_at = parsed.data.ended_at ?? new Date().toISOString()
    }
  }
  if (parsed.data.end_reason !== undefined) patch.end_reason = parsed.data.end_reason ?? null
  if (parsed.data.ended_at !== undefined) patch.ended_at = parsed.data.ended_at ?? null
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? null
  if (Object.keys(patch).length === 0) return
  await dbContracts.update(contractId, patch)
}

// ─── Milestones (fixed contracts) ─────────────────────────────────

export async function addMilestone(
  userId: string,
  contractId: string,
  raw: unknown
): Promise<UpworkMilestone> {
  const contract = await dbContracts.getById(contractId)
  if (!contract) throw new NotFoundError('Contract not found')
  if (contract.contract_type !== 'fixed') {
    throw new ValidationError('Milestones only apply to fixed-price contracts')
  }
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager can add milestones')
  }
  const parsed = UpworkMilestoneCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const sequence = await dbContracts.nextMilestoneSequence(contractId)
  return dbContracts.insertMilestone({
    contract_id: contractId,
    sequence,
    name: parsed.data.name,
    amount_usd: parsed.data.amount_usd,
    due_at: parsed.data.due_at ?? null,
    notes: parsed.data.notes ?? null,
    status: 'pending',
  })
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  raw: unknown
): Promise<void> {
  const milestone = await dbContracts.getMilestoneById(milestoneId)
  if (!milestone) throw new NotFoundError('Milestone not found')
  const contract = await dbContracts.getById(milestone.contract_id)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager can edit milestones')
  }
  const parsed = UpworkMilestoneUpdateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.amount_usd !== undefined) patch.amount_usd = parsed.data.amount_usd
  if (parsed.data.due_at !== undefined) patch.due_at = parsed.data.due_at ?? null
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? null
  if (parsed.data.status !== undefined && parsed.data.status !== milestone.status) {
    patch.status = parsed.data.status
    const now = new Date().toISOString()
    if (parsed.data.status === 'funded' && !milestone.funded_at) patch.funded_at = now
    if (parsed.data.status === 'submitted' && !milestone.submitted_at) patch.submitted_at = now
    if (parsed.data.status === 'paid' && !milestone.paid_at) patch.paid_at = now
  }
  if (Object.keys(patch).length === 0) return
  await dbContracts.updateMilestone(milestoneId, patch)
}

export async function deleteMilestone(userId: string, milestoneId: string): Promise<void> {
  const milestone = await dbContracts.getMilestoneById(milestoneId)
  if (!milestone) throw new NotFoundError('Milestone not found')
  const contract = await dbContracts.getById(milestone.contract_id)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager can delete milestones')
  }
  if (milestone.status !== 'pending') {
    throw new ConflictError(
      'Only pending milestones can be deleted. Once funded, change the status to track its outcome.'
    )
  }
  await dbContracts.deleteMilestone(milestoneId)
}

// ─── Time logs (hourly contracts) ─────────────────────────────────

/**
 * Returns the Monday of the week containing the given date (ISO yyyy-mm-dd).
 * The schema unique-key is keyed on this Monday so two log entries from
 * different days in the same week collapse into one row.
 */
function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  const day = d.getUTCDay()
  // Sunday = 0 → push back 6 days; Monday = 1 → 0 days; etc.
  const offset = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/**
 * Bidder logs hours for a (contract, week). If a row exists for the
 * same (contract, bidder, week), the hours are REPLACED (not added) —
 * the user enters their cumulative weekly total each time. Service-
 * layer choice; could change to additive if the workflow demands.
 */
export async function logHours(
  userId: string,
  contractId: string,
  raw: unknown
): Promise<UpworkTimeLog> {
  const contract = await dbContracts.getById(contractId)
  if (!contract) throw new NotFoundError('Contract not found')
  if (contract.contract_type !== 'hourly') {
    throw new ValidationError('Time logs only apply to hourly contracts')
  }
  await requireUpworkProfileAccess(userId, contract.profile_id)
  const parsed = UpworkTimeLogUpsertInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const weekMonday = mondayOf(parsed.data.week_starting)
  const rate = parsed.data.hourly_rate_usd ?? contract.agreed_rate_usd ?? 0
  if (rate <= 0) {
    throw new ValidationError(
      'No hourly rate available — set agreed_rate_usd on the contract or pass hourly_rate_usd.'
    )
  }

  const existing = await dbContracts.findTimeLogForWeek(contractId, userId, weekMonday)
  if (existing) {
    if (existing.status !== 'logged') {
      throw new ConflictError(
        `Week of ${weekMonday} is already ${existing.status} — can't overwrite. Edit status first.`
      )
    }
    await dbContracts.updateTimeLog(existing.id, {
      hours: parsed.data.hours,
      hourly_rate_usd: rate,
      notes: parsed.data.notes ?? null,
    })
    const refreshed = await dbContracts.getTimeLogById(existing.id)
    if (!refreshed) throw new Error('Refresh after update failed')
    return refreshed
  }
  return dbContracts.insertTimeLog({
    contract_id: contractId,
    bidder_user_id: userId,
    week_starting: weekMonday,
    hours: parsed.data.hours,
    hourly_rate_usd: rate,
    status: 'logged',
    notes: parsed.data.notes ?? null,
  })
}

export async function changeTimeLogStatus(
  userId: string,
  timeLogId: string,
  raw: unknown
): Promise<void> {
  const timeLog = await dbContracts.getTimeLogById(timeLogId)
  if (!timeLog) throw new NotFoundError('Time log not found')
  const contract = await dbContracts.getById(timeLog.contract_id)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  if (!access.canManage) {
    throw new ForbiddenError('Only the profile manager can change time-log status')
  }
  const parsed = UpworkTimeLogStatusChangeInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  if (parsed.data.status === timeLog.status) return

  const patch: Record<string, unknown> = { status: parsed.data.status }
  const now = new Date().toISOString()
  if (parsed.data.status === 'billed' && !timeLog.billed_at) patch.billed_at = now
  if (parsed.data.status === 'paid' && !timeLog.paid_at) patch.paid_at = now
  await dbContracts.updateTimeLog(timeLogId, patch)
}

export async function deleteTimeLog(userId: string, timeLogId: string): Promise<void> {
  const timeLog = await dbContracts.getTimeLogById(timeLogId)
  if (!timeLog) throw new NotFoundError('Time log not found')
  const contract = await dbContracts.getById(timeLog.contract_id)
  if (!contract) throw new NotFoundError('Contract not found')
  const access = await requireUpworkProfileAccess(userId, contract.profile_id)
  // Bidder can delete their own LOGGED entry; manager can delete any.
  if (timeLog.bidder_user_id !== userId && !access.canManage) {
    throw new ForbiddenError('Only the bidder or profile manager can delete this entry')
  }
  if (timeLog.status !== 'logged') {
    throw new ConflictError('Cannot delete a billed/paid/disputed entry')
  }
  await dbContracts.deleteTimeLog(timeLogId)
}
