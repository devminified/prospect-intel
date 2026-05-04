'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboard } from '@/lib/queries/dashboard'
import { useCurrentTeam, useTeamProgress } from '@/lib/queries/team'
import type { DashFollowup as Followup, TeamMemberProgress } from '@/lib/types'

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard()
  const teamQ = useCurrentTeam()
  const myRole = teamQ.data?.my_role ?? null
  const canSeeTeamProgress = myRole === 'owner' || myRole === 'manager'
  const progressQ = useTeamProgress(30, { enabled: canSeeTeamProgress })

  const prospects = data?.prospects ?? []
  const followups = data?.followups ?? []
  const stateByProspect = data?.stateByProspect ?? new Map()
  const events = data?.events ?? []

  const counts = useMemo(() => {
    let total = 0
    let noOutreach = 0
    let inContact = 0
    let opened = 0
    let replied = 0
    let callPhase = 0
    for (const p of prospects) {
      total++
      const o = stateByProspect.get(p.id)
      const hasSent = !!o?.has_sent
      const hasOpen = !!o?.has_real_open
      const hasReply = !!o?.has_reply
      const isCall = o?.recommended_channel === 'phone'
      if (!hasSent) noOutreach++
      if (hasSent) inContact++
      if (hasOpen) opened++
      if (hasReply) replied++
      if (isCall) callPhase++
    }
    return { total, noOutreach, inContact, opened, replied, callPhase }
  }, [prospects, stateByProspect])

  const followupBuckets = useMemo(() => {
    const now = Date.now()
    const endOfToday = endOfDayMs(new Date())
    const overdue: Followup[] = []
    const today: Followup[] = []
    const upcoming: Followup[] = []
    for (const f of followups) {
      const due = Date.parse(f.due_at)
      if (Number.isNaN(due)) continue
      if (due < now) overdue.push(f)
      else if (due <= endOfToday) today.push(f)
      else upcoming.push(f)
    }
    return { overdue, today, upcoming }
  }, [followups])

  if (isLoading) return <div className="text-muted-foreground">Loading dashboard…</div>
  if (error) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
        {error.message}
      </div>
    )
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-muted-foreground">{dateStr}</span>
      </div>

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Today's follow-ups</CardTitle>
          <span className="text-sm text-muted-foreground">
            {followupBuckets.overdue.length} overdue · {followupBuckets.today.length} today · {followupBuckets.upcoming.length} upcoming
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {followupBuckets.overdue.length === 0 &&
          followupBuckets.today.length === 0 &&
          followupBuckets.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No follow-ups scheduled. Open a prospect to add one.
            </p>
          ) : (
            <>
              <FollowupGroup
                label="Overdue"
                items={followupBuckets.overdue}
                nameById={new Map(prospects.map((p) => [p.id, p.name]))}
                tone="overdue"
              />
              <FollowupGroup
                label="Due today"
                items={followupBuckets.today}
                nameById={new Map(prospects.map((p) => [p.id, p.name]))}
                tone="today"
              />
              <FollowupGroup
                label="Upcoming"
                items={followupBuckets.upcoming.slice(0, 5)}
                nameById={new Map(prospects.map((p) => [p.id, p.name]))}
                tone="upcoming"
              />
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="Total leads" count={counts.total} href="/leads" />
          <Tile
            label="No outreach"
            count={counts.noOutreach}
            href="/leads?stage=no_outreach"
            sub="ready to pitch"
          />
          <Tile
            label="In contact"
            count={counts.inContact}
            href="/leads?stage=in_contact"
            sub="email sent"
          />
          <Tile
            label="Opened"
            count={counts.opened}
            href="/leads?stage=opened"
            sub="engaged"
            accent="blue"
          />
          <Tile
            label="Replied"
            count={counts.replied}
            href="/leads?stage=replied"
            sub="needs reply"
            accent="emerald"
          />
          <Tile
            label="Call phase"
            count={counts.callPhase}
            href="/leads?stage=call_phase"
            sub="phone-fit"
            accent="purple"
          />
        </div>
      </div>

      {canSeeTeamProgress && (
        <TeamProgressCard
          rows={progressQ.data?.rows ?? []}
          loading={progressQ.isLoading}
          error={progressQ.error?.message}
          days={progressQ.data?.days ?? 30}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Link href="/leads?sort=last_activity" className="text-xs text-primary hover:underline">
            See all →
          </Link>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No activity yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {events.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[22px] top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background border text-[10px]">
                    {e.icon}
                  </span>
                  <Link
                    href={`/prospects/${e.prospectId}`}
                    className={`block text-sm hover:underline ${e.cls ?? ''}`}
                  >
                    {e.text}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatRelative(e.ts)}</div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TeamProgressCard({
  rows,
  loading,
  error,
  days,
}: {
  rows: TeamMemberProgress[]
  loading: boolean
  error: string | undefined
  days: number
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle className="text-base">Team progress</CardTitle>
        <span className="text-xs text-muted-foreground">last {days} days</span>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-6 py-4 text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground italic">No team members yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b">
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3 text-right">Leads</th>
                  <th className="px-6 py-3 text-right">Sent</th>
                  <th className="px-6 py-3 text-right">Opened</th>
                  <th className="px-6 py-3 text-right">Replied</th>
                  <th className="px-6 py-3 text-right">Won</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.user_id ?? '__unassigned__'}>
                    <td className="px-6 py-3">
                      {r.email ?? <span className="text-muted-foreground italic">Unassigned</span>}
                    </td>
                    <td className="px-6 py-3">
                      {r.role ? (
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground">
                          {r.role}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.leads_owned}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.sent}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.opened}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.replied}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {r.won > 0 ? (
                        <span className="text-emerald-700 font-semibold">{r.won}</span>
                      ) : (
                        r.won
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Tile({
  label,
  count,
  href,
  sub,
  accent,
}: {
  label: string
  count: number
  href: string
  sub?: string
  accent?: 'blue' | 'emerald' | 'purple'
}) {
  const accentCls =
    accent === 'blue'
      ? 'text-blue-700'
      : accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'purple'
      ? 'text-purple-700'
      : 'text-foreground'
  return (
    <Link
      href={href}
      className="block rounded-md border bg-background p-4 hover:bg-muted/50 transition-colors"
    >
      <div className={`text-3xl font-bold ${accentCls}`}>{count}</div>
      <div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Link>
  )
}

function FollowupGroup({
  label,
  items,
  nameById,
  tone,
}: {
  label: string
  items: Followup[]
  nameById: Map<string, string>
  tone: 'overdue' | 'today' | 'upcoming'
}) {
  if (items.length === 0) return null
  const headerCls =
    tone === 'overdue' ? 'text-destructive' : tone === 'today' ? 'text-blue-700' : 'text-muted-foreground'
  return (
    <div>
      <div className={`text-xs font-semibold uppercase mb-2 ${headerCls}`}>
        {label} ({items.length})
      </div>
      <div className="space-y-1">
        {items.map((f) => {
          const pname = nameById.get(f.prospect_id) ?? '(unknown prospect)'
          const due = new Date(f.due_at)
          const dueStr = formatDueLine(due, tone)
          return (
            <Link
              key={f.id}
              href={`/prospects/${f.prospect_id}`}
              className={`flex items-baseline gap-2 rounded-md p-2 text-sm hover:bg-muted/50 transition-colors ${
                tone === 'overdue' ? 'bg-destructive/5' : tone === 'today' ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-xs font-mono text-muted-foreground shrink-0 min-w-[120px]">{dueStr}</span>
              <span className="font-medium truncate">{pname}</span>
              {f.note && <span className="text-muted-foreground truncate">— {f.note}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function endOfDayMs(d: Date): number {
  const end = new Date(d)
  end.setHours(23, 59, 59, 999)
  return end.getTime()
}

function formatDueLine(d: Date, tone: 'overdue' | 'today' | 'upcoming'): string {
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (tone === 'today') return `Today · ${time}`
  if (tone === 'overdue') {
    const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
    if (days === 0) {
      const hrs = Math.floor((Date.now() - d.getTime()) / (60 * 60 * 1000))
      return `${hrs}h overdue`
    }
    return `${days}d overdue`
  }
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${time}`
}

function formatRelative(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (Number.isNaN(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}
