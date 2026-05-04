import * as dbProposals from '@/lib/db/upwork-proposals'
import * as dbJobs from '@/lib/db/upwork-jobs'
import * as dbProfiles from '@/lib/db/upwork-profiles'
import {
  UpworkProposalCreateInputSchema,
  UpworkProposalStatusChangeInputSchema,
} from '@/lib/types'
import type { UpworkProposal, UpworkProposalStatus } from '@/lib/types'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './errors'
import {
  requireUpworkAccess,
  requireUpworkProfileAccess,
} from './access'
import * as connectsService from './upwork-connects'

/**
 * Upwork proposals service. Creating a proposal requires explicit
 * profile membership — outbound managers don't get to bid. Status
 * updates are limited to the bidder themselves OR the profile manager.
 *
 * Proposal submit auto-writes a 'spend' row to the Connects ledger
 * so the profile's connects_balance stays accurate. The two writes
 * aren't transactional (Supabase REST doesn't expose multi-statement
 * txns); if the ledger insert fails, we surface the error and the
 * proposal stays — the team can manually reconcile.
 */

export async function listForProfile(
  userId: string,
  profileId: string,
  opts: { status?: string | null } = {}
): Promise<UpworkProposal[]> {
  await requireUpworkProfileAccess(userId, profileId)
  let status: UpworkProposalStatus | 'any' = 'any'
  if (opts.status && opts.status !== 'any') {
    // Tolerant: unknown filter falls through to 'any'.
    const known: UpworkProposalStatus[] = [
      'drafted',
      'sent',
      'viewed',
      'shortlisted',
      'interview',
      'declined',
      'withdrawn',
      'hired',
      'no_response',
    ]
    if (known.includes(opts.status as UpworkProposalStatus)) {
      status = opts.status as UpworkProposalStatus
    }
  }
  return dbProposals.listForProfile(profileId, { status })
}

/**
 * Proposals on a job, scoped to profiles the caller can see. Used by
 * the job detail page to show "your team has already bid from these
 * profiles" without leaking other profiles' proposals to non-members.
 */
export async function listForJobScoped(
  userId: string,
  jobId: string
): Promise<UpworkProposal[]> {
  // Gate: caller has any Upwork access on the team that owns the job.
  await requireUpworkAccess(userId)
  const all = await dbProposals.listForJob(jobId)
  // Owner sees all. Others see only proposals for profiles they belong to.
  // We can short-circuit by inspecting one profile; let access helper
  // handle the per-row check.
  const visible: UpworkProposal[] = []
  for (const p of all) {
    try {
      await requireUpworkProfileAccess(userId, p.profile_id)
      visible.push(p)
    } catch {
      // forbidden — silently skip
    }
  }
  return visible
}

export async function getProposal(
  userId: string,
  proposalId: string
): Promise<UpworkProposal> {
  const p = await dbProposals.getById(proposalId)
  if (!p) throw new NotFoundError('Proposal not found')
  await requireUpworkProfileAccess(userId, p.profile_id)
  return p
}

/**
 * Send a bid. Validates the input, ensures no other proposal exists
 * for (profile, job), inserts the proposal, then writes the Connects
 * spend entry. RBAC: caller must be a member of the target profile.
 */
export async function createProposal(
  userId: string,
  raw: unknown
): Promise<UpworkProposal> {
  const parsed = UpworkProposalCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  // Profile access (the bidder must belong to this profile).
  await requireUpworkProfileAccess(userId, parsed.data.profile_id)

  // Job must exist + belong to the same team as the profile.
  const profile = await dbProfiles.getById(parsed.data.profile_id)
  if (!profile) throw new NotFoundError('Profile not found')
  const job = await dbJobs.getById(parsed.data.job_id)
  if (!job || job.team_id !== profile.team_id) {
    throw new ValidationError('That job does not belong to your team.')
  }

  // Dedup — at most one proposal per (profile, job).
  const existing = await dbProposals.findExisting(parsed.data.profile_id, parsed.data.job_id)
  if (existing) {
    throw new ConflictError(
      `This profile already has a proposal on this job (status: ${existing.status}). Update or withdraw the existing one instead.`
    )
  }

  const isSent = parsed.data.status === 'sent'
  const proposal = await dbProposals.insert({
    profile_id: parsed.data.profile_id,
    job_id: parsed.data.job_id,
    bidder_user_id: userId,
    cover_letter: parsed.data.cover_letter ?? null,
    bid_type: parsed.data.bid_type,
    bid_amount_usd: parsed.data.bid_amount_usd,
    proposed_milestones_json: parsed.data.proposed_milestones_json ?? null,
    connects_spent: parsed.data.connects_spent,
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
    sent_at: isSent ? new Date().toISOString() : null,
  })

  // Write the spend entry. Skipped for drafts (status='drafted'), since
  // Upwork doesn't charge Connects until you actually submit.
  if (isSent && parsed.data.connects_spent > 0) {
    await connectsService.recordSpendForProposal({
      userId,
      profileId: parsed.data.profile_id,
      proposalId: proposal.id,
      amount: parsed.data.connects_spent,
    })
  }

  return proposal
}

/**
 * Promote a draft to sent — same effect as the create-with-status='sent'
 * path, but for a row that already exists. Writes the Connects spend.
 */
export async function sendDraft(userId: string, proposalId: string): Promise<void> {
  const p = await getProposal(userId, proposalId)
  if (p.status !== 'drafted') {
    throw new ValidationError(`Cannot send a proposal in status "${p.status}".`)
  }
  if (!p.bid_amount_usd) {
    throw new ValidationError('Add a bid amount before sending.')
  }
  const now = new Date().toISOString()
  await dbProposals.update(proposalId, {
    status: 'sent',
    status_changed_at: now,
    sent_at: now,
  })
  if (p.connects_spent > 0) {
    await connectsService.recordSpendForProposal({
      userId,
      profileId: p.profile_id,
      proposalId: p.id,
      amount: p.connects_spent,
    })
  }
}

export async function changeStatus(
  userId: string,
  proposalId: string,
  raw: unknown
): Promise<void> {
  const p = await getProposal(userId, proposalId)
  const parsed = UpworkProposalStatusChangeInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)
  }
  if (parsed.data.status === p.status) return

  // Restrict who can change status: bidder OR profile manager.
  const access = await requireUpworkProfileAccess(userId, p.profile_id)
  if (!access.canManage && p.bidder_user_id !== userId) {
    throw new ForbiddenError(
      'Only the bidder or the profile manager can change this proposal\'s status.'
    )
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    status_changed_at: now,
  }
  if (parsed.data.status === 'withdrawn') patch.withdrawn_at = now
  if (parsed.data.status === 'hired') patch.hired_at = now
  if (parsed.data.status === 'declined') patch.declined_at = now
  if (parsed.data.status === 'sent' && !p.sent_at) patch.sent_at = now

  await dbProposals.update(proposalId, patch)
}

export async function updateNotes(
  userId: string,
  proposalId: string,
  notes: string
): Promise<void> {
  const p = await getProposal(userId, proposalId)
  const access = await requireUpworkProfileAccess(userId, p.profile_id)
  if (!access.canManage && p.bidder_user_id !== userId) {
    throw new ForbiddenError('Only the bidder or profile manager can edit notes.')
  }
  await dbProposals.update(proposalId, { notes: notes.trim() || null })
}
