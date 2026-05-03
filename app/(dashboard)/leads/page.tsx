'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface OutreachState {
  has_pitch: boolean
  has_sent: boolean
  has_real_open: boolean
  has_reply: boolean
  recommended_channel: 'phone' | 'email' | 'either' | null
  last_activity_at: string | null
}

interface Lead {
  id: string
  name: string
  status: string
  outreach_status: string | null
  last_viewed_at: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  created_at: string
  batch_id: string
  batch_city: string | null
  batch_category: string | null
  best_angle: string | null
  opportunity_score: number | null
  outreach: OutreachState
}

type StageKey = 'all' | 'no_outreach' | 'in_contact' | 'opened' | 'replied' | 'call_phase'
type ViewedKey = 'any' | 'viewed' | 'unviewed'
type SortKey = 'score' | 'last_activity' | 'unviewed_first' | 'created'
type ViewMode = 'list' | 'kanban'

const STAGE_LABELS: Record<StageKey, string> = {
  all: 'All',
  no_outreach: 'No outreach',
  in_contact: 'In contact',
  opened: 'Opened',
  replied: 'Replied',
  call_phase: 'Call phase',
}

const OUTREACH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'any', label: 'Any outreach status' },
  { value: '__none__', label: 'No status set' },
  { value: 'calling', label: 'Calling now' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail left' },
  { value: 'call_ended', label: 'Call ended' },
  { value: 'follow_up', label: 'Follow up needed' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'do_not_contact', label: 'Do not contact' },
]

const OUTREACH_LABEL: Record<string, string> = {
  calling: 'Calling now',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  call_ended: 'Call ended',
  follow_up: 'Follow up',
  qualified: 'Qualified',
  not_interested: 'Not interested',
  do_not_contact: 'DNC',
}

const KANBAN_COLUMNS: Array<{ key: string; label: string }> = [
  { key: '__none__', label: 'No status' },
  { key: 'calling', label: 'Calling now' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'call_ended', label: 'Call ended' },
  { key: 'follow_up', label: 'Follow up' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'do_not_contact', label: 'DNC' },
]

interface SavedView {
  name: string
  stage: StageKey
  outreach: string
  viewed: ViewedKey
  sort: SortKey
  search: string
  view: ViewMode
}

const SAVED_VIEWS_KEY = 'prospect-intel:saved-views'

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [stage, setStage] = useState<StageKey>('all')
  const [outreach, setOutreach] = useState<string>('any')
  const [viewed, setViewed] = useState<ViewedKey>('any')
  const [sort, setSort] = useState<SortKey>('score')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('list')

  const [savedViews, setSavedViews] = useState<SavedView[]>([])

  useEffect(() => {
    void load()
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY)
      if (raw) setSavedViews(JSON.parse(raw))
    } catch {}
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    // Pull all prospects the user owns via RLS, joined with batch info + analysis.
    const { data: pData, error: pErr } = await supabase
      .from('prospects')
      .select(
        'id, name, status, outreach_status, last_viewed_at, website, rating, review_count, created_at, batch_id, batches!inner(city, category), analyses(opportunity_score, best_angle)'
      )
      .order('created_at', { ascending: false })
      .limit(1000)

    if (pErr) {
      setError(`Leads load failed: ${pErr.message}`)
      setLoading(false)
      return
    }

    const prospects = (pData as any[]) ?? []
    const ids = prospects.map((p) => p.id)

    if (ids.length === 0) {
      setLeads([])
      setLoading(false)
      return
    }

    const [pitchesRes, recsRes] = await Promise.all([
      supabase
        .from('pitches')
        .select(
          'prospect_id, sent_emails(id, sent_at, email_opens(opened_at, is_probably_self, is_probably_mpp), email_replies(id, received_at))'
        )
        .in('prospect_id', ids),
      supabase
        .from('channel_recommendations')
        .select('prospect_id, recommended_channel')
        .in('prospect_id', ids),
    ])

    const stateByProspect = new Map<string, OutreachState>()
    for (const pitch of (pitchesRes.data as any[]) ?? []) {
      const sent = (pitch.sent_emails ?? []) as any[]
      const has_sent = sent.length > 0
      const has_real_open = sent.some((s) =>
        (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
      )
      const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)

      // Latest activity timestamp across this prospect's pitched outreach.
      let latest = 0
      for (const s of sent) {
        if (s.sent_at) latest = Math.max(latest, Date.parse(s.sent_at))
        for (const o of s.email_opens ?? []) {
          if (o.opened_at) latest = Math.max(latest, Date.parse(o.opened_at))
        }
        for (const r of s.email_replies ?? []) {
          if (r.received_at) latest = Math.max(latest, Date.parse(r.received_at))
        }
      }

      stateByProspect.set(pitch.prospect_id, {
        has_pitch: true,
        has_sent,
        has_real_open,
        has_reply,
        recommended_channel: null,
        last_activity_at: latest > 0 ? new Date(latest).toISOString() : null,
      })
    }
    for (const r of (recsRes.data as any[]) ?? []) {
      const existing = stateByProspect.get(r.prospect_id) ?? {
        has_pitch: false,
        has_sent: false,
        has_real_open: false,
        has_reply: false,
        recommended_channel: null as OutreachState['recommended_channel'],
        last_activity_at: null as string | null,
      }
      existing.recommended_channel = r.recommended_channel ?? null
      stateByProspect.set(r.prospect_id, existing)
    }

    const merged: Lead[] = prospects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      outreach_status: p.outreach_status ?? null,
      last_viewed_at: p.last_viewed_at ?? null,
      website: p.website ?? null,
      rating: p.rating ?? null,
      review_count: p.review_count ?? null,
      created_at: p.created_at,
      batch_id: p.batch_id,
      batch_city: p.batches?.city ?? null,
      batch_category: p.batches?.category ?? null,
      best_angle: p.analyses?.best_angle ?? null,
      opportunity_score: p.analyses?.opportunity_score ?? null,
      outreach: stateByProspect.get(p.id) ?? {
        has_pitch: false,
        has_sent: false,
        has_real_open: false,
        has_reply: false,
        recommended_channel: null,
        last_activity_at: null,
      },
    }))

    setLeads(merged)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (!matchesStage(l, stage)) return false
      if (outreach !== 'any') {
        if (outreach === '__none__') {
          if (l.outreach_status) return false
        } else if (l.outreach_status !== outreach) return false
      }
      if (viewed === 'viewed' && !l.last_viewed_at) return false
      if (viewed === 'unviewed' && l.last_viewed_at) return false
      if (q) {
        const name = (l.name ?? '').toLowerCase()
        const site = (l.website ?? '').toLowerCase()
        const cat = (l.batch_category ?? '').toLowerCase()
        const city = (l.batch_city ?? '').toLowerCase()
        if (!name.includes(q) && !site.includes(q) && !cat.includes(q) && !city.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [leads, stage, outreach, viewed, search])

  const sorted = useMemo(() => {
    const s = [...filtered]
    switch (sort) {
      case 'score':
        return s.sort((a, b) => (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1))
      case 'last_activity':
        return s.sort(
          (a, b) =>
            (a.outreach.last_activity_at ? Date.parse(a.outreach.last_activity_at) : 0) <
            (b.outreach.last_activity_at ? Date.parse(b.outreach.last_activity_at) : 0)
              ? 1
              : -1
        )
      case 'unviewed_first':
        return s.sort((a, b) => {
          const av = a.last_viewed_at ? 1 : 0
          const bv = b.last_viewed_at ? 1 : 0
          if (av !== bv) return av - bv
          return (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1)
        })
      case 'created':
      default:
        return s.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    }
  }, [filtered, sort])

  function stageCount(key: StageKey): number {
    return key === 'all' ? leads.length : leads.filter((l) => matchesStage(l, key)).length
  }

  function applyView(v: SavedView) {
    setStage(v.stage)
    setOutreach(v.outreach)
    setViewed(v.viewed)
    setSort(v.sort)
    setSearch(v.search)
    setView(v.view)
  }

  function saveCurrentView() {
    const name = window.prompt('Name this view (e.g. "My follow-ups"):')
    if (!name || !name.trim()) return
    const v: SavedView = { name: name.trim(), stage, outreach, viewed, sort, search, view }
    const next = [...savedViews.filter((x) => x.name !== v.name), v]
    setSavedViews(next)
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next))
    } catch {}
  }

  function deleteView(name: string) {
    if (!confirm(`Delete saved view "${name}"?`)) return
    const next = savedViews.filter((x) => x.name !== name)
    setSavedViews(next)
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next))
    } catch {}
  }

  function resetFilters() {
    setStage('all')
    setOutreach('any')
    setViewed('any')
    setSort('score')
    setSearch('')
    setView('list')
  }

  if (loading) return <div className="text-muted-foreground">Loading leads…</div>
  if (error) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex items-center gap-2">
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
            List
          </Button>
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setView('kanban')}>
            Kanban
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search name, website, city, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[260px]"
            />
            <Select value={outreach} onValueChange={(v) => v && setOutreach(v)}>
              <SelectTrigger size="sm" className="min-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTREACH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={viewed} onValueChange={(v) => v && setViewed(v as ViewedKey)}>
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any viewed state</SelectItem>
                <SelectItem value="unviewed">Unviewed only</SelectItem>
                <SelectItem value="viewed">Viewed only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => v && setSort(v as SortKey)}>
              <SelectTrigger size="sm" className="min-w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Sort: Score (high → low)</SelectItem>
                <SelectItem value="last_activity">Sort: Last activity</SelectItem>
                <SelectItem value="unviewed_first">Sort: Unviewed first</SelectItem>
                <SelectItem value="created">Sort: Newest first</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(STAGE_LABELS) as StageKey[]).map((key) => {
              const active = stage === key
              return (
                <Button
                  key={key}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStage(key)}
                  className="gap-2"
                >
                  {STAGE_LABELS[key]}
                  <span className={`text-xs ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                    {stageCount(key)}
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground mr-1">Saved views:</span>
            {savedViews.length === 0 && (
              <span className="text-xs text-muted-foreground italic">none — save a view to pin filter combos</span>
            )}
            {savedViews.map((v) => (
              <span key={v.name} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                <button onClick={() => applyView(v)} className="font-medium hover:underline">
                  {v.name}
                </button>
                <button
                  onClick={() => deleteView(v.name)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete saved view"
                  title="Delete"
                >
                  ×
                </button>
              </span>
            ))}
            <Button variant="outline" size="sm" onClick={saveCurrentView}>
              + Save current view
            </Button>
          </div>
        </CardContent>
      </Card>

      {view === 'list' ? (
        <Card>
          <CardHeader>
            <CardTitle>{sorted.length} {sorted.length === 1 ? 'lead' : 'leads'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sorted.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No leads match these filters. Try Reset.
              </div>
            ) : (
              <div className="divide-y">
                {sorted.map((l) => (
                  <LeadRow key={l.id} lead={l} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <KanbanBoard leads={sorted} />
      )}
    </div>
  )
}

function LeadRow({ lead: l }: { lead: Lead }) {
  const viewed = !!l.last_viewed_at
  return (
    <Link
      href={`/prospects/${l.id}`}
      className={`block p-4 hover:bg-muted/50 transition-colors ${viewed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!viewed && <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="Not viewed yet" />}
            <h3 className={`truncate ${viewed ? 'font-normal' : 'font-semibold'}`}>{l.name}</h3>
            <StatusChip status={l.status} />
            {l.outreach_status && (
              <span
                className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800"
                title="Manual outreach status"
              >
                {OUTREACH_LABEL[l.outreach_status] ?? l.outreach_status}
              </span>
            )}
            <OutreachChips outreach={l.outreach} />
          </div>
          {l.best_angle && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{l.best_angle}</p>}
          <p className="mt-1 text-xs text-muted-foreground/70">
            {[l.batch_city, l.batch_category].filter(Boolean).join(' · ') || 'no batch info'}
            {l.rating != null && ` · ${l.rating}★ (${l.review_count ?? 0})`}
            {l.outreach.last_activity_at && ` · last activity ${formatRelative(l.outreach.last_activity_at)}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold">{l.opportunity_score ?? '—'}</div>
          <div className="text-xs text-muted-foreground">score</div>
        </div>
      </div>
    </Link>
  )
}

function KanbanBoard({ leads }: { leads: Lead[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, Lead[]>()
    for (const c of KANBAN_COLUMNS) m.set(c.key, [])
    for (const l of leads) {
      const key = l.outreach_status ?? '__none__'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(l)
    }
    return m
  }, [leads])

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {KANBAN_COLUMNS.map((col) => {
          const items = grouped.get(col.key) ?? []
          return (
            <div key={col.key} className="w-[280px] shrink-0 bg-muted/30 rounded-md p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{col.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-2">empty</div>
              ) : (
                items.map((l) => (
                  <Link
                    key={l.id}
                    href={`/prospects/${l.id}`}
                    className={`block p-3 bg-background rounded-md border hover:bg-muted transition-colors ${
                      l.last_viewed_at ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm truncate ${l.last_viewed_at ? 'font-normal' : 'font-semibold'}`}>
                        {l.name}
                      </span>
                      <span className="text-sm font-bold shrink-0">{l.opportunity_score ?? '—'}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {[l.batch_city, l.batch_category].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <OutreachChips outreach={l.outreach} small />
                    </div>
                  </Link>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function matchesStage(l: Lead, key: StageKey): boolean {
  const o = l.outreach
  switch (key) {
    case 'all':
      return true
    case 'no_outreach':
      return !o.has_sent
    case 'in_contact':
      return o.has_sent
    case 'opened':
      return o.has_real_open
    case 'replied':
      return o.has_reply
    case 'call_phase':
      return o.recommended_channel === 'phone'
  }
}

function OutreachChips({ outreach, small = false }: { outreach: OutreachState; small?: boolean }) {
  const chips: Array<{ label: string; cls: string }> = []
  if (outreach.has_reply) chips.push({ label: 'replied', cls: 'bg-emerald-100 text-emerald-800' })
  else if (outreach.has_real_open) chips.push({ label: 'opened', cls: 'bg-blue-100 text-blue-800' })
  else if (outreach.has_sent) chips.push({ label: 'in contact', cls: 'bg-yellow-100 text-yellow-800' })
  if (outreach.recommended_channel === 'phone') chips.push({ label: 'call', cls: 'bg-purple-100 text-purple-800' })
  if (chips.length === 0) return null
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex ${small ? 'px-1.5 py-0' : 'px-2 py-0.5'} text-xs font-semibold rounded-full ${c.cls}`}
        >
          {c.label}
        </span>
      ))}
    </>
  )
}

function StatusChip({ status }: { status: string }) {
  const cls: Record<string, string> = {
    new: 'bg-secondary text-secondary-foreground',
    enriched: 'bg-blue-100 text-blue-800',
    analyzed: 'bg-purple-100 text-purple-800',
    ready: 'bg-green-100 text-green-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    replied: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
    filtered_out: 'bg-secondary text-muted-foreground',
  }
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
        cls[status] ?? 'bg-secondary text-secondary-foreground'
      }`}
    >
      {status}
    </span>
  )
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
