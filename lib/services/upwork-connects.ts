import * as dbConnects from '@/lib/db/upwork-connects'
import {
  UpworkConnectsEntryInputSchema,
} from '@/lib/types'
import type {
  UpworkConnectsLogEntry,
  UpworkConnectsType,
} from '@/lib/types'
import { ValidationError } from './errors'
import {
  requireUpworkProfileAccess,
  requireUpworkProfileManager,
} from './access'

/**
 * Connects ledger service. The ledger is the source of truth for a
 * profile's Connects budget; the `upwork_profiles.connects_balance`
 * snapshot is auto-maintained by a DB trigger on insert.
 *
 * Manual entries (purchase / grant / refund / adjustment) require the
 * profile manager role. Proposal-driven 'spend' entries are written by
 * the proposals service via `recordSpendForProposal` — they're allowed
 * for any profile member because the proposal-create flow already
 * gated on profile access.
 */

export async function listEntries(
  userId: string,
  profileId: string
): Promise<UpworkConnectsLogEntry[]> {
  await requireUpworkProfileAccess(userId, profileId)
  return dbConnects.listForProfile(profileId)
}

export async function getBalance(userId: string, profileId: string): Promise<number> {
  await requireUpworkProfileAccess(userId, profileId)
  return dbConnects.getCurrentBalance(profileId)
}

/**
 * Manual ledger entry — purchase / grant / refund / adjustment. Spend
 * entries don't go through this path; they're written automatically
 * when a proposal is submitted.
 */
export async function recordEntry(
  userId: string,
  profileId: string,
  raw: unknown
): Promise<UpworkConnectsLogEntry> {
  await requireUpworkProfileManager(userId, profileId)
  const parsed = UpworkConnectsEntryInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }

  const positive: UpworkConnectsType[] = ['purchase', 'grant', 'refund']
  const isPositive = positive.includes(parsed.data.type as UpworkConnectsType)
  const isAdjustment = parsed.data.type === 'adjustment'
  if (isAdjustment && !parsed.data.direction) {
    throw new ValidationError('Adjustment entries must specify direction (add or subtract)')
  }

  const sign = isAdjustment
    ? parsed.data.direction === 'add'
      ? 1
      : -1
    : isPositive
    ? 1
    : -1
  const signedAmount = sign * parsed.data.amount

  const currentBalance = await dbConnects.getCurrentBalance(profileId)
  const balanceAfter = currentBalance + signedAmount
  if (balanceAfter < 0) {
    throw new ValidationError(
      `That entry would make the balance negative (${balanceAfter}). Adjust the amount.`
    )
  }

  return dbConnects.insert({
    profile_id: profileId,
    type: parsed.data.type as UpworkConnectsType,
    amount: parsed.data.amount,
    signed_amount: signedAmount,
    balance_after: balanceAfter,
    related_proposal_id: null,
    notes: parsed.data.notes ?? null,
    occurred_at: parsed.data.occurred_at ?? null,
    recorded_by_user_id: userId,
  })
}

/**
 * Internal — invoked by the proposals service when a bid is submitted.
 * Skips the manager-only gate because the proposal-create path already
 * checked profile access. The spend is recorded with the related
 * proposal id so the ledger UI can show "spent on bid X".
 */
export async function recordSpendForProposal(input: {
  userId: string
  profileId: string
  proposalId: string
  amount: number
}): Promise<UpworkConnectsLogEntry | null> {
  if (input.amount <= 0) return null
  const currentBalance = await dbConnects.getCurrentBalance(input.profileId)
  const balanceAfter = currentBalance - input.amount
  if (balanceAfter < 0) {
    throw new ValidationError(
      `Profile only has ${currentBalance} Connects — can't spend ${input.amount}. Log a purchase first.`
    )
  }
  return dbConnects.insert({
    profile_id: input.profileId,
    type: 'spend',
    amount: input.amount,
    signed_amount: -input.amount,
    balance_after: balanceAfter,
    related_proposal_id: input.proposalId,
    notes: null,
    occurred_at: null,
    recorded_by_user_id: input.userId,
  })
}
