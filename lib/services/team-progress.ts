import { supabaseAdmin } from '@/lib/supabase/server'
import * as dbTeams from '@/lib/db/teams'
import type { Role, TeamMemberProgress, TeamProgressResponse } from '@/lib/types'
import { ForbiddenError, ValidationError } from './errors'
import { requireTeamAccess } from './access'

/**
 * Aggregates per-member outreach metrics for the last N days. Visible to
 * owners and managers — the rest of the team can see their own leads
 * already, but a roll-up of "what's everyone doing" is reserved for
 * leadership roles.
 *
 * Implementation note: we run several aggregate queries in parallel
 * rather than one massive JOIN. Cleaner Supabase usage and easier to
 * extend with new metrics later.
 */
export async function getTeamProgress(
  userId: string,
  rawDays: unknown
): Promise<TeamProgressResponse> {
  const { teamId, role: myRole } = await requireTeamAccess(userId)
  if (myRole !== 'owner' && myRole !== 'manager') {
    throw new ForbiddenError('Only owners and managers can see team progress')
  }

  const days = Math.max(1, Math.min(365, parseDays(rawDays)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // ── Members of this team (the "rows" of the table) ───────────────
  const members = await dbTeams.listMembers(teamId)
  const memberRows: Array<{ user_id: string | null; role: Role | null; email: string | null }> = []
  for (const m of members) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
    memberRows.push({ user_id: m.user_id, role: m.role, email: u.user?.email ?? null })
  }
  // Unassigned bucket — leads with no owner. Always shown so the team
  // can see their share of unowned work.
  memberRows.push({ user_id: null, role: null, email: null })

  // ── Per-member aggregates ────────────────────────────────────────
  // Pull all team prospects once; aggregate in JS. With M68 having
  // wiped data, batch sizes are small; if this becomes hot we'll move
  // it to a SQL view or a stored proc.
  const { data: prospects, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, assigned_to, deal_stage, batches!inner(team_id)')
    .eq('batches.team_id', teamId)
  if (pErr) throw new Error(`team-progress prospects: ${pErr.message}`)

  const prospectsByOwner = new Map<string | null, string[]>()
  const dealStageByProspect = new Map<string, string>()
  for (const p of (prospects as Array<{ id: string; assigned_to: string | null; deal_stage: string }>) ?? []) {
    const owner = p.assigned_to ?? null
    if (!prospectsByOwner.has(owner)) prospectsByOwner.set(owner, [])
    prospectsByOwner.get(owner)!.push(p.id)
    dealStageByProspect.set(p.id, p.deal_stage)
  }

  // Sent emails in window — joined to pitches → prospects to attribute
  // each send to the lead's owner at send time. (We attribute by the
  // CURRENT assigned_to since that's what dashboard cards everywhere
  // do — close enough for the MVP rollup.)
  const { data: sentRows, error: sErr } = await supabaseAdmin
    .from('sent_emails')
    .select(
      'sent_at, pitches!inner(prospect_id, prospects!inner(id, assigned_to, batches!inner(team_id)))'
    )
    .eq('pitches.prospects.batches.team_id', teamId)
    .gte('sent_at', since)
  if (sErr) throw new Error(`team-progress sent_emails: ${sErr.message}`)

  type SentRow = {
    sent_at: string
    pitches: { prospect_id: string; prospects: { id: string; assigned_to: string | null } }
  }
  const sentByOwner = new Map<string | null, number>()
  for (const r of (sentRows as unknown as SentRow[]) ?? []) {
    const owner = r.pitches?.prospects?.assigned_to ?? null
    sentByOwner.set(owner, (sentByOwner.get(owner) ?? 0) + 1)
  }

  // Opens (real only) in window
  const { data: openRows, error: oErr } = await supabaseAdmin
    .from('email_opens')
    .select(
      'opened_at, is_probably_self, is_probably_mpp, sent_emails!inner(pitches!inner(prospects!inner(assigned_to, batches!inner(team_id))))'
    )
    .eq('sent_emails.pitches.prospects.batches.team_id', teamId)
    .eq('is_probably_self', false)
    .eq('is_probably_mpp', false)
    .gte('opened_at', since)
  if (oErr) throw new Error(`team-progress email_opens: ${oErr.message}`)

  type OpenRow = {
    sent_emails: { pitches: { prospects: { assigned_to: string | null } } }
  }
  const openedByOwner = new Map<string | null, number>()
  for (const r of (openRows as unknown as OpenRow[]) ?? []) {
    const owner = r.sent_emails?.pitches?.prospects?.assigned_to ?? null
    openedByOwner.set(owner, (openedByOwner.get(owner) ?? 0) + 1)
  }

  // Replies in window
  const { data: replyRows, error: rErr } = await supabaseAdmin
    .from('email_replies')
    .select(
      'received_at, sent_emails!inner(pitches!inner(prospects!inner(assigned_to, batches!inner(team_id))))'
    )
    .eq('sent_emails.pitches.prospects.batches.team_id', teamId)
    .gte('received_at', since)
  if (rErr) throw new Error(`team-progress email_replies: ${rErr.message}`)

  type ReplyRow = {
    sent_emails: { pitches: { prospects: { assigned_to: string | null } } }
  }
  const repliedByOwner = new Map<string | null, number>()
  for (const r of (replyRows as unknown as ReplyRow[]) ?? []) {
    const owner = r.sent_emails?.pitches?.prospects?.assigned_to ?? null
    repliedByOwner.set(owner, (repliedByOwner.get(owner) ?? 0) + 1)
  }

  // ── Compose rows ─────────────────────────────────────────────────
  const rows: TeamMemberProgress[] = memberRows.map((m) => {
    const ownedIds = prospectsByOwner.get(m.user_id) ?? []
    const won = ownedIds.filter((id) => dealStageByProspect.get(id) === 'won').length
    return {
      user_id: m.user_id,
      email: m.email,
      role: m.role,
      leads_owned: ownedIds.length,
      sent: sentByOwner.get(m.user_id) ?? 0,
      opened: openedByOwner.get(m.user_id) ?? 0,
      replied: repliedByOwner.get(m.user_id) ?? 0,
      won,
    }
  })

  return { rows, days }
}

function parseDays(raw: unknown): number {
  if (typeof raw === 'number') return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return Math.floor(n)
    throw new ValidationError('days must be a positive integer')
  }
  return 30
}
