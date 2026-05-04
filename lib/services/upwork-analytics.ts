import { supabaseAdmin } from '@/lib/supabase/server'
import * as dbProfiles from '@/lib/db/upwork-profiles'
import type {
  UpworkBidderRow,
  UpworkLeaderboard,
  UpworkOverview,
  UpworkOverviewProfileRow,
  UpworkProfileContractsSummary,
  UpworkProfileConnects,
  UpworkProfileDashboard,
  UpworkProfileFunnel,
  UpworkProfileRevenue,
} from '@/lib/types'
import { ForbiddenError } from './errors'
import {
  requireTeamAccess,
  requireUpworkAccess,
  requireUpworkProfileAccess,
} from './access'

/**
 * Phase 11D analytics. All read-only aggregations against existing
 * tables — no new schema. Done in JS over team-scoped queries because
 * the data per profile is small (hundreds of proposals, dozens of
 * contracts). If a single profile's row count grows past ~10k we'd
 * push these to SQL views, but the current shape stays well under that.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

function windowSinceIso(days: number): string | null {
  if (days <= 0) return null // all-time
  return new Date(Date.now() - days * MS_PER_DAY).toISOString()
}

/** Normalize 30/90/365/-1; default 30. */
function parseWindow(raw: unknown): number {
  if (raw == null) return 30
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 30
  if (n === -1) return -1
  if (n <= 0) return 30
  return Math.floor(n)
}

// ─── Per-profile dashboard ─────────────────────────────────────────

export async function getProfileDashboard(
  userId: string,
  profileId: string,
  rawDays: unknown
): Promise<UpworkProfileDashboard> {
  await requireUpworkProfileAccess(userId, profileId)
  const days = parseWindow(rawDays)
  const since = windowSinceIso(days)

  const [funnel, connects, contracts, revenue] = await Promise.all([
    computeFunnel(profileId, since),
    computeConnects(profileId),
    computeContractsSummary(profileId),
    computeRevenue(profileId),
  ])

  return {
    profile_id: profileId,
    window_days: days,
    funnel,
    connects,
    contracts,
    revenue,
  }
}

async function computeFunnel(
  profileId: string,
  since: string | null
): Promise<UpworkProfileFunnel> {
  // Jobs saved is team-wide, but we count "jobs the profile has at
  // least looked at" = jobs they bid on + jobs in the team list. For
  // the funnel display we use proposals as the entry point — saved
  // jobs without a bid aren't in this profile's funnel.
  let propQ = supabaseAdmin
    .from('upwork_proposals')
    .select('status, sent_at, created_at')
    .eq('profile_id', profileId)
  if (since) propQ = propQ.gte('created_at', since)
  const { data: proposals, error: pErr } = await propQ
  if (pErr) throw new Error(`analytics.funnel proposals: ${pErr.message}`)

  let drafted = 0,
    sent = 0,
    viewed = 0,
    shortlisted = 0,
    interview = 0,
    hired = 0,
    declined = 0,
    noresp = 0,
    withdrawn = 0
  for (const p of (proposals as Array<{ status: string }>) ?? []) {
    switch (p.status) {
      case 'drafted':
        drafted++
        break
      case 'sent':
        sent++
        break
      case 'viewed':
        viewed++
        break
      case 'shortlisted':
        shortlisted++
        break
      case 'interview':
        interview++
        break
      case 'hired':
        hired++
        break
      case 'declined':
        declined++
        break
      case 'no_response':
        noresp++
        break
      case 'withdrawn':
        withdrawn++
        break
    }
  }

  // Cumulative funnel: a hired proposal also counts as sent + viewed
  // + shortlisted + interview because Upwork's lifecycle moves through
  // those states. We don't track per-state timestamps, so we approximate
  // by saying anyone past stage X has been at X or later.
  const stagePastSent = sent + viewed + shortlisted + interview + hired + declined + noresp + withdrawn
  const stagePastViewed = viewed + shortlisted + interview + hired + declined
  const stagePastShortlisted = shortlisted + interview + hired
  const stagePastInterview = interview + hired

  // Job-saved count for the profile = unique job_ids on proposals.
  // Approximation; the team-wide saved-jobs total is queried separately
  // when needed.
  const jobsSaved = new Set(
    (proposals as Array<{ job_id?: string }>)?.map((p) => p.job_id ?? '') ?? []
  ).size

  return {
    jobs_saved: jobsSaved,
    proposals_drafted: drafted,
    proposals_sent: stagePastSent,
    proposals_viewed: stagePastViewed,
    proposals_shortlisted: stagePastShortlisted,
    proposals_interview: stagePastInterview,
    proposals_hired: hired,
    proposals_declined: declined,
    proposals_no_response: noresp,
    proposals_withdrawn: withdrawn,
  }
}

async function computeConnects(profileId: string): Promise<UpworkProfileConnects> {
  const { data: profile } = await supabaseAdmin
    .from('upwork_profiles')
    .select('connects_balance')
    .eq('id', profileId)
    .maybeSingle()
  const currentBalance = (profile as { connects_balance: number } | null)?.connects_balance ?? 0

  // Sum the ledger by type.
  const { data: rows, error } = await supabaseAdmin
    .from('upwork_connects_log')
    .select('type, amount')
    .eq('profile_id', profileId)
  if (error) throw new Error(`analytics.connects: ${error.message}`)
  let purchased = 0,
    spent = 0,
    refunded = 0
  for (const r of (rows as Array<{ type: string; amount: number }>) ?? []) {
    if (r.type === 'purchase' || r.type === 'grant') purchased += r.amount
    else if (r.type === 'spend') spent += r.amount
    else if (r.type === 'refund') refunded += r.amount
  }

  // Spend-per-hire = total spent / count of hired proposals (all-time).
  const { count: hires } = await supabaseAdmin
    .from('upwork_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('status', 'hired')

  return {
    current_balance: currentBalance,
    total_purchased: purchased,
    total_spent: spent,
    total_refunded: refunded,
    spend_per_hire: hires && hires > 0 ? Math.round((spent / hires) * 100) / 100 : null,
  }
}

async function computeContractsSummary(
  profileId: string
): Promise<UpworkProfileContractsSummary> {
  const { data, error } = await supabaseAdmin
    .from('upwork_contracts')
    .select('status')
    .eq('profile_id', profileId)
  if (error) throw new Error(`analytics.contracts: ${error.message}`)
  const out: UpworkProfileContractsSummary = {
    active: 0,
    paused: 0,
    ended: 0,
    disputed: 0,
    total: 0,
  }
  for (const r of (data as Array<{ status: string }>) ?? []) {
    out.total++
    if (r.status === 'active') out.active++
    else if (r.status === 'paused') out.paused++
    else if (r.status === 'ended') out.ended++
    else if (r.status === 'disputed') out.disputed++
  }
  return out
}

async function computeRevenue(profileId: string): Promise<UpworkProfileRevenue> {
  // Paid milestones: contract belongs to profile, milestone status = 'paid'.
  const { data: paidMilestones, error: mErr } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .select('amount_usd, paid_at, upwork_contracts!inner(profile_id)')
    .eq('upwork_contracts.profile_id', profileId)
    .eq('status', 'paid')
  if (mErr) throw new Error(`analytics.revenue milestones: ${mErr.message}`)

  // Pending milestones (anything not paid/refunded counts as scoped/pending).
  const { data: pendingMilestones, error: mErr2 } = await supabaseAdmin
    .from('upwork_contract_milestones')
    .select('amount_usd, status, upwork_contracts!inner(profile_id)')
    .eq('upwork_contracts.profile_id', profileId)
    .in('status', ['pending', 'funded', 'in_progress', 'submitted'])
  if (mErr2) throw new Error(`analytics.revenue pending: ${mErr2.message}`)

  // Paid time logs: amount_usd is a stored generated column.
  const { data: paidTimeLogs, error: tErr } = await supabaseAdmin
    .from('upwork_time_logs')
    .select('amount_usd, paid_at, billed_at, upwork_contracts!inner(profile_id)')
    .eq('upwork_contracts.profile_id', profileId)
    .eq('status', 'paid')
  if (tErr) throw new Error(`analytics.revenue time_logs: ${tErr.message}`)

  // Pending = logged + billed.
  const { data: pendingTimeLogs, error: tErr2 } = await supabaseAdmin
    .from('upwork_time_logs')
    .select('amount_usd, upwork_contracts!inner(profile_id)')
    .eq('upwork_contracts.profile_id', profileId)
    .in('status', ['logged', 'billed'])
  if (tErr2) throw new Error(`analytics.revenue time_logs pending: ${tErr2.message}`)

  const paidTotal =
    sumAmount(paidMilestones as Array<{ amount_usd: number }> | null) +
    sumAmount(paidTimeLogs as Array<{ amount_usd: number }> | null)
  const pendingTotal =
    sumAmount(pendingMilestones as Array<{ amount_usd: number }> | null) +
    sumAmount(pendingTimeLogs as Array<{ amount_usd: number }> | null)

  // Build last-12-months bucket. Each milestone's paid_at OR each
  // time-log's paid_at (fallback billed_at) puts it into a YYYY-MM bucket.
  const buckets = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    buckets.set(d.toISOString().slice(0, 7), 0)
  }
  for (const r of (paidMilestones as Array<{ amount_usd: number; paid_at: string | null }>) ?? []) {
    if (!r.paid_at) continue
    const month = r.paid_at.slice(0, 7)
    if (buckets.has(month)) {
      buckets.set(month, (buckets.get(month) ?? 0) + Number(r.amount_usd))
    }
  }
  for (const r of (paidTimeLogs as Array<{
    amount_usd: number
    paid_at: string | null
    billed_at: string | null
  }>) ?? []) {
    const ts = r.paid_at ?? r.billed_at
    if (!ts) continue
    const month = ts.slice(0, 7)
    if (buckets.has(month)) {
      buckets.set(month, (buckets.get(month) ?? 0) + Number(r.amount_usd))
    }
  }

  return {
    paid_total_usd: round2(paidTotal),
    pending_total_usd: round2(pendingTotal),
    monthly_paid_usd: Array.from(buckets, ([month, amount_usd]) => ({
      month,
      amount_usd: round2(amount_usd),
    })),
  }
}

function sumAmount(rows: Array<{ amount_usd: number }> | null): number {
  if (!rows) return 0
  return rows.reduce((sum, r) => sum + Number(r.amount_usd), 0)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Cross-profile overview (Upwork landing) ───────────────────────

export async function getOverview(
  userId: string,
  rawDays: unknown
): Promise<UpworkOverview> {
  const { teamId, teamRole } = await requireUpworkAccess(userId)
  const days = parseWindow(rawDays)

  // Profiles the caller can see — owner sees all, others only their
  // explicit memberships.
  const allProfiles = await dbProfiles.listForTeam(teamId)
  const visible = []
  for (const p of allProfiles) {
    if (teamRole === 'owner') {
      visible.push(p)
    } else {
      const m = await dbProfiles.getMembership(p.id, userId)
      if (m) visible.push(p)
    }
  }

  // Per-profile rollup.
  const perProfile: UpworkOverviewProfileRow[] = []
  let totalsSent = 0,
    totalsHires = 0,
    totalsRevenueWindow = 0,
    totalsRevenueAll = 0,
    totalsConnects = 0
  const monthlyAcrossAll = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    monthlyAcrossAll.set(d.toISOString().slice(0, 7), 0)
  }

  const sinceWindowIso = windowSinceIso(days)

  for (const p of visible) {
    // Use the per-profile builders for accuracy + reuse.
    const [funnelWindow, contracts, revenue] = await Promise.all([
      computeFunnel(p.id, sinceWindowIso),
      computeContractsSummary(p.id),
      computeRevenue(p.id),
    ])

    // Window-specific revenue: sum the buckets within the window.
    let revenueInWindow = 0
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * MS_PER_DAY)
        .toISOString()
        .slice(0, 7)
      for (const { month, amount_usd } of revenue.monthly_paid_usd) {
        if (month >= cutoff) revenueInWindow += amount_usd
      }
    } else {
      revenueInWindow = revenue.paid_total_usd
    }

    perProfile.push({
      profile_id: p.id,
      profile_name: p.name,
      status: p.status,
      connects_balance: p.connects_balance,
      active_contracts: contracts.active,
      proposals_sent_window: funnelWindow.proposals_sent,
      hires_window: funnelWindow.proposals_hired,
      revenue_window_usd: round2(revenueInWindow),
      revenue_all_time_usd: revenue.paid_total_usd,
    })

    totalsSent += funnelWindow.proposals_sent
    totalsHires += funnelWindow.proposals_hired
    totalsRevenueWindow += revenueInWindow
    totalsRevenueAll += revenue.paid_total_usd
    totalsConnects += p.connects_balance
    for (const { month, amount_usd } of revenue.monthly_paid_usd) {
      if (monthlyAcrossAll.has(month)) {
        monthlyAcrossAll.set(month, (monthlyAcrossAll.get(month) ?? 0) + amount_usd)
      }
    }
  }

  return {
    window_days: days,
    per_profile: perProfile,
    totals: {
      proposals_sent_window: totalsSent,
      hires_window: totalsHires,
      revenue_window_usd: round2(totalsRevenueWindow),
      revenue_all_time_usd: round2(totalsRevenueAll),
      connects_balance_total: totalsConnects,
    },
    monthly_paid_usd: Array.from(monthlyAcrossAll, ([month, amount_usd]) => ({
      month,
      amount_usd: round2(amount_usd),
    })),
  }
}

// ─── Bidder leaderboard ────────────────────────────────────────────

/**
 * Per-bidder roll-up across the profiles the caller can manage.
 *   - Owner: all profiles
 *   - Profile manager: profiles where they're upwork_profile_members.role='manager'
 *   - Anyone else (bidder, other roles without profile membership): 403
 */
export async function getBidderLeaderboard(
  userId: string,
  rawDays: unknown
): Promise<UpworkLeaderboard> {
  const { teamId, role: teamRole } = await requireTeamAccess(userId)
  const allProfiles = await dbProfiles.listForTeam(teamId)
  let scoped: typeof allProfiles
  if (teamRole === 'owner') {
    scoped = allProfiles
  } else {
    scoped = []
    for (const p of allProfiles) {
      const m = await dbProfiles.getMembership(p.id, userId)
      if (m && m.role === 'manager') scoped.push(p)
    }
  }
  if (scoped.length === 0) {
    throw new ForbiddenError(
      'No profiles to manage. Only profile managers (and the team owner) see the leaderboard.'
    )
  }

  const days = parseWindow(rawDays)
  const since = windowSinceIso(days)
  const profileIds = scoped.map((p) => p.id)

  // Pull all proposals + connects + time-logs in scope. Aggregate in JS.
  let propQ = supabaseAdmin
    .from('upwork_proposals')
    .select('bidder_user_id, status, connects_spent, sent_at, created_at')
    .in('profile_id', profileIds)
  if (since) propQ = propQ.gte('created_at', since)
  const { data: proposals, error: pErr } = await propQ
  if (pErr) throw new Error(`leaderboard proposals: ${pErr.message}`)

  let logQ = supabaseAdmin
    .from('upwork_time_logs')
    .select('bidder_user_id, hours, amount_usd, status, week_starting, upwork_contracts!inner(profile_id)')
    .in('upwork_contracts.profile_id', profileIds)
  if (since) logQ = logQ.gte('week_starting', since.slice(0, 10))
  const { data: timeLogs, error: tErr } = await logQ
  if (tErr) throw new Error(`leaderboard time_logs: ${tErr.message}`)

  // Build per-user accumulator.
  const acc = new Map<string, UpworkBidderRow>()
  function getRow(uid: string): UpworkBidderRow {
    let row = acc.get(uid)
    if (!row) {
      row = {
        user_id: uid,
        email: null,
        profile_count: 0,
        proposals_sent: 0,
        replies: 0,
        interviews: 0,
        hires: 0,
        reply_rate: 0,
        interview_rate: 0,
        hire_rate: 0,
        connects_spent: 0,
        hours_logged: 0,
        revenue_attributed_usd: 0,
      }
      acc.set(uid, row)
    }
    return row
  }

  type PropRow = {
    bidder_user_id: string
    status: string
    connects_spent: number
  }
  for (const p of (proposals as PropRow[]) ?? []) {
    const r = getRow(p.bidder_user_id)
    r.connects_spent += p.connects_spent ?? 0
    // Count all non-drafted proposals as "sent" since drafts haven't
    // gone out to clients yet.
    if (p.status === 'drafted') continue
    r.proposals_sent++
    // Reply = anything past 'sent' (means client engaged in some way).
    if (
      p.status === 'viewed' ||
      p.status === 'shortlisted' ||
      p.status === 'interview' ||
      p.status === 'hired' ||
      p.status === 'declined'
    ) {
      r.replies++
    }
    if (p.status === 'interview' || p.status === 'hired') r.interviews++
    if (p.status === 'hired') r.hires++
  }

  type LogRow = {
    bidder_user_id: string
    hours: number
    amount_usd: number
    status: string
  }
  for (const l of (timeLogs as LogRow[]) ?? []) {
    const r = getRow(l.bidder_user_id)
    r.hours_logged += Number(l.hours)
    if (l.status === 'paid') r.revenue_attributed_usd += Number(l.amount_usd)
  }

  // Add per-bidder profile counts (so the UI can show "active on N
  // profiles") + emails. listMembers per profile is fine at this scale.
  for (const p of scoped) {
    const members = await (await import('@/lib/db/upwork-profiles')).listMembers(p.id)
    for (const m of members) {
      const r = getRow(m.user_id)
      r.profile_count++
    }
  }
  for (const r of acc.values()) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id)
    r.email = u.user?.email ?? null
    if (r.proposals_sent > 0) {
      r.reply_rate = round2(r.replies / r.proposals_sent)
      r.interview_rate = round2(r.interviews / r.proposals_sent)
      r.hire_rate = round2(r.hires / r.proposals_sent)
    }
    r.hours_logged = round2(r.hours_logged)
    r.revenue_attributed_usd = round2(r.revenue_attributed_usd)
  }

  const rows = Array.from(acc.values()).sort(
    (a, b) => b.proposals_sent - a.proposals_sent
  )
  return { window_days: days, rows, scoped_profile_ids: profileIds }
}
