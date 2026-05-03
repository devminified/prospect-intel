'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ProspectLite {
  id: string
  name: string
  status: string
  outreach_status: string | null
  last_viewed_at: string | null
}

interface Followup {
  id: string
  prospect_id: string
  due_at: string
  note: string | null
  done: boolean
  done_at: string | null
  created_at: string
}

interface Note {
  id: string
  prospect_id: string
  body: string
  created_at: string
}

interface OutreachState {
  has_pitch: boolean
  has_sent: boolean
  has_real_open: boolean
  has_reply: boolean
  recommended_channel: 'phone' | 'email' | 'either' | null
}

interface ActivityEvent {
  ts: string
  icon: string
  text: string
  prospectId: string
  cls?: string
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prospects, setProspects] = useState<ProspectLite[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  const [stateByProspect, setStateByProspect] = useState<Map<string, OutreachState>>(new Map())
  const [events, setEvents] = useState<ActivityEvent[]>([])

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    // All RLS-filtered to current user's prospects via the batch chain.
    const [prospectsRes, pitchesRes, recsRes, followupsRes, notesRes] = await Promise.all([
      supabase
        .from('prospects')
        .select('id, name, status, outreach_status, last_viewed_at')
        .limit(2000),
      supabase
        .from('pitches')
        .select(
          'prospect_id, sent_emails(id, sent_at, to_email, email_opens(opened_at, is_probably_self, is_probably_mpp), email_replies(id, received_at, classification))'
        ),
      supabase.from('channel_recommendations').select('prospect_id, recommended_channel'),
      supabase
        .from('prospect_followups')
        .select('id, prospect_id, due_at, note, done, done_at, created_at')
        .eq('done', false)
        .order('due_at', { ascending: true })
        .limit(100),
      supabase
        .from('prospect_notes')
        .select('id, prospect_id, body, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (prospectsRes.error) {
      setError(`Load failed: ${prospectsRes.error.message}`)
      setLoading(false)
      return
    }

    const ps = ((prospectsRes.data as ProspectLite[]) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      outreach_status: p.outreach_status ?? null,
      last_viewed_at: p.last_viewed_at ?? null,
    }))
    setProspects(ps)

    const nameById = new Map(ps.map((p) => [p.id, p.name]))

    const state = new Map<string, OutreachState>()
    const acts: ActivityEvent[] = []

    for (const pitch of (pitchesRes.data as any[]) ?? []) {
      const sent = (pitch.sent_emails ?? []) as any[]
      const has_sent = sent.length > 0
      const has_real_open = sent.some((s) =>
        (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
      )
      const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)
      state.set(pitch.prospect_id, {
        has_pitch: true,
        has_sent,
        has_real_open,
        has_reply,
        recommended_channel: null,
      })
      const pname = nameById.get(pitch.prospect_id) ?? '(unknown)'
      for (const s of sent) {
        if (s.sent_at) {
          acts.push({
            ts: s.sent_at,
            icon: '→',
            text: `Email sent to ${pname}`,
            prospectId: pitch.prospect_id,
          })
        }
        for (const o of s.email_opens ?? []) {
          if (o.is_probably_self || o.is_probably_mpp) continue
          acts.push({
            ts: o.opened_at,
            icon: '◉',
            text: `${pname} opened your email`,
            prospectId: pitch.prospect_id,
            cls: 'text-blue-700',
          })
        }
        for (const r of s.email_replies ?? []) {
          if (!r.received_at) continue
          const tag = r.classification ? ` (${r.classification})` : ''
          acts.push({
            ts: r.received_at,
            icon: '↩',
            text: `Reply from ${pname}${tag}`,
            prospectId: pitch.prospect_id,
            cls: r.classification === 'interested' ? 'text-emerald-700 font-medium' : '',
          })
        }
      }
    }

    for (const r of (recsRes.data as any[]) ?? []) {
      const existing = state.get(r.prospect_id) ?? {
        has_pitch: false,
        has_sent: false,
        has_real_open: false,
        has_reply: false,
        recommended_channel: null as OutreachState['recommended_channel'],
      }
      existing.recommended_channel = r.recommended_channel ?? null
      state.set(r.prospect_id, existing)
    }

    for (const n of (notesRes.data as Note[]) ?? []) {
      const pname = nameById.get(n.prospect_id) ?? '(unknown)'
      const preview = n.body.length > 60 ? `${n.body.slice(0, 60).trim()}…` : n.body
      acts.push({
        ts: n.created_at,
        icon: '✎',
        text: `Note on ${pname}: "${preview.replace(/\s+/g, ' ')}"`,
        prospectId: n.prospect_id,
      })
    }

    for (const f of (followupsRes.data as Followup[]) ?? []) {
      const pname = nameById.get(f.prospect_id) ?? '(unknown)'
      acts.push({
        ts: f.created_at,
        icon: '⏰',
        text: `Follow-up scheduled for ${pname}`,
        prospectId: f.prospect_id,
        cls: 'text-muted-foreground',
      })
    }

    acts.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))

    setStateByProspect(state)
    setFollowups((followupsRes.data as Followup[]) ?? [])
    setEvents(acts.slice(0, 20))
    setLoading(false)
  }

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

  if (loading) return <div className="text-muted-foreground">Loading dashboard…</div>
  if (error) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
        {error}
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
