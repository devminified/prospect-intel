'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface OutreachState {
  has_pitch: boolean
  has_sent: boolean
  has_real_open: boolean
  has_reply: boolean
  recommended_channel: 'phone' | 'email' | 'either' | null
}

interface Prospect {
  id: string
  name: string
  status: string
  website: string | null
  rating: number | null
  review_count: number | null
  outreach_status: string | null
  last_viewed_at: string | null
  analyses: { opportunity_score: number | null; best_angle: string | null } | null
  last_error?: string | null
  failed_stage?: string | null
  outreach: OutreachState
}

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

type FilterKey = 'all' | 'no_outreach' | 'in_contact' | 'opened' | 'replied' | 'call_phase'

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  no_outreach: 'No outreach',
  in_contact: 'In contact',
  opened: 'Opened',
  replied: 'Replied',
  call_phase: 'Call phase',
}

function matchesFilter(p: Prospect, key: FilterKey): boolean {
  const o = p.outreach
  switch (key) {
    case 'all': return true
    case 'no_outreach': return !o.has_sent
    case 'in_contact': return o.has_sent
    case 'opened': return o.has_real_open
    case 'replied': return o.has_reply
    case 'call_phase': return o.recommended_channel === 'phone'
  }
}

interface Batch {
  id: string
  city: string
  category: string
  count_requested: number
  count_completed: number
  count_filtered_below_icp: number
  count_duplicates_skipped: number
  status: string
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')

    const { data: b, error: bErr } = await supabase
      .from('batches')
      .select('id, city, category, count_requested, count_completed, count_filtered_below_icp, count_duplicates_skipped, status')
      .eq('id', id)
      .single()
    if (bErr) {
      setError(`Batch load failed: ${bErr.message}`)
      setLoading(false)
      return
    }
    setBatch(b as Batch)

    const { data: p, error: pErr } = await supabase
      .from('prospects')
      .select('id, name, status, website, rating, review_count, outreach_status, last_viewed_at, analyses(opportunity_score, best_angle)')
      .eq('batch_id', id)
    if (pErr) {
      setError(`Prospects load failed: ${pErr.message}`)
      setLoading(false)
      return
    }

    const prospectIds = ((p as unknown as { id: string }[]) ?? []).map((x) => x.id)

    // Fetch outreach signals + failed jobs in parallel.
    const [failedJobsRes, pitchesRes, recsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('prospect_id, job_type, last_error, status')
        .eq('batch_id', id)
        .eq('status', 'failed'),
      prospectIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from('pitches')
            .select('prospect_id, sent_emails(id, email_opens(is_probably_self, is_probably_mpp), email_replies(id))')
            .in('prospect_id', prospectIds),
      prospectIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from('channel_recommendations')
            .select('prospect_id, recommended_channel')
            .in('prospect_id', prospectIds),
    ])

    const errorByProspect = new Map<string, { stage: string; message: string }>()
    for (const j of (failedJobsRes.data as any[]) ?? []) {
      if (j.last_error) {
        errorByProspect.set(j.prospect_id, { stage: j.job_type, message: j.last_error })
      }
    }

    const stateByProspect = new Map<string, OutreachState>()
    for (const pitch of (pitchesRes.data as any[]) ?? []) {
      const sent = (pitch.sent_emails ?? []) as any[]
      const has_sent = sent.length > 0
      const has_real_open = sent.some((s) =>
        (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
      )
      const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)
      stateByProspect.set(pitch.prospect_id, {
        has_pitch: true,
        has_sent,
        has_real_open,
        has_reply,
        recommended_channel: null,
      })
    }
    for (const r of (recsRes.data as any[]) ?? []) {
      const existing = stateByProspect.get(r.prospect_id) ?? {
        has_pitch: false,
        has_sent: false,
        has_real_open: false,
        has_reply: false,
        recommended_channel: null as OutreachState['recommended_channel'],
      }
      existing.recommended_channel = r.recommended_channel ?? null
      stateByProspect.set(r.prospect_id, existing)
    }

    const decorated = ((p as unknown as Prospect[]) ?? []).map((x) => {
      const err = errorByProspect.get(x.id)
      const outreach = stateByProspect.get(x.id) ?? {
        has_pitch: false,
        has_sent: false,
        has_real_open: false,
        has_reply: false,
        recommended_channel: null as OutreachState['recommended_channel'],
      }
      return {
        ...x,
        outreach,
        ...(err ? { failed_stage: err.stage, last_error: err.message } : {}),
      }
    })
    const sorted = decorated.sort((a, b) => {
      const sa = a.analyses?.opportunity_score ?? -1
      const sb = b.analyses?.opportunity_score ?? -1
      return sb - sa
    })
    setProspects(sorted)
    setLoading(false)
  }

  async function exportCsv() {
    setError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError('Not signed in')
      return
    }
    const res = await fetch(`/api/pitches/export?batch_id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'export failed' }))
      setError(body.error ?? 'export failed')
      return
    }
    const blob = await res.blob()
    const disp = res.headers.get('content-disposition') ?? ''
    const match = /filename="([^"]+)"/.exec(disp)
    const filename = match?.[1] ?? `export-${id}.csv`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>
  if (error && !batch) return <div className="text-destructive">{error}</div>
  if (!batch) return <div className="text-muted-foreground">Batch not found.</div>

  return (
    <div className="space-y-6">
      <div>
        <Link href="/batches" className="text-sm text-primary hover:underline">← All batches</Link>
        <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{batch.category} in {batch.city}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {batch.count_completed} of {batch.count_requested} completed · {batch.status}
            </p>
            {(batch.count_filtered_below_icp > 0 || batch.count_duplicates_skipped > 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                Dropped at import:{' '}
                {batch.count_filtered_below_icp > 0 && (
                  <span><span className="font-medium text-foreground">{batch.count_filtered_below_icp}</span> below ICP floor</span>
                )}
                {batch.count_filtered_below_icp > 0 && batch.count_duplicates_skipped > 0 && ' · '}
                {batch.count_duplicates_skipped > 0 && (
                  <span><span className="font-medium text-foreground">{batch.count_duplicates_skipped}</span> already in your system</span>
                )}
              </p>
            )}
          </div>
          <Button onClick={exportCsv}>Export approved CSV</Button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Prospects</CardTitle>
          <span className="text-sm text-muted-foreground font-normal">Sorted by opportunity score</span>
        </CardHeader>
        {prospects.length > 0 && (
          <div className="px-6 pb-4 flex flex-wrap gap-2">
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
              const count = key === 'all' ? prospects.length : prospects.filter((p) => matchesFilter(p, key)).length
              const active = filter === key
              return (
                <Button
                  key={key}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(key)}
                  className="gap-2"
                >
                  {FILTER_LABELS[key]}
                  <span className={`text-xs ${active ? 'opacity-80' : 'text-muted-foreground'}`}>{count}</span>
                </Button>
              )
            })}
          </div>
        )}
        <CardContent className="p-0">
          {prospects.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No prospects in this batch.</div>
          ) : prospects.filter((p) => matchesFilter(p, filter)).length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No prospects match the {FILTER_LABELS[filter]!.toLowerCase()} filter.
            </div>
          ) : (
            <div className="divide-y">
              {prospects.filter((p) => matchesFilter(p, filter)).map((p) => {
                const score = p.analyses?.opportunity_score ?? null
                const angle = p.analyses?.best_angle ?? null
                const viewed = !!p.last_viewed_at
                return (
                  <Link
                    key={p.id}
                    href={`/prospects/${p.id}`}
                    className={`block p-6 hover:bg-muted/50 transition-colors ${viewed ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!viewed && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="Not viewed yet" />
                          )}
                          <h3 className={`truncate ${viewed ? 'font-normal' : 'font-semibold'}`}>{p.name}</h3>
                          <StatusChip status={p.status} />
                          {p.outreach_status && (
                            <span
                              className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800"
                              title="Manual outreach status — set on the prospect detail page"
                            >
                              {OUTREACH_LABEL[p.outreach_status] ?? p.outreach_status}
                            </span>
                          )}
                          <OutreachChips outreach={p.outreach} />
                        </div>
                        {angle && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{angle}</p>}
                        {p.last_error && (
                          <p className="mt-2 text-xs text-destructive line-clamp-2">
                            <span className="font-mono font-semibold uppercase">{p.failed_stage} failed:</span>{' '}
                            {p.last_error}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          {p.website ?? 'no website'}
                          {p.rating != null && ` · ${p.rating}★ (${p.review_count ?? 0})`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold">{score ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">score</div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OutreachChips({ outreach }: { outreach: OutreachState }) {
  const chips: Array<{ label: string; cls: string; title: string }> = []
  if (outreach.has_reply) {
    chips.push({ label: 'replied', cls: 'bg-emerald-100 text-emerald-800', title: 'Got a reply to your cold email' })
  } else if (outreach.has_real_open) {
    chips.push({ label: 'opened', cls: 'bg-blue-100 text-blue-800', title: 'Email was opened (not self/MPP)' })
  } else if (outreach.has_sent) {
    chips.push({ label: 'in contact', cls: 'bg-yellow-100 text-yellow-800', title: 'Cold email sent, no open yet' })
  }
  if (outreach.recommended_channel === 'phone') {
    chips.push({ label: 'call', cls: 'bg-purple-100 text-purple-800', title: 'Channel recommendation says phone' })
  }
  if (chips.length === 0) return null
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.label}
          title={c.title}
          className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${c.cls}`}
        >
          {c.label}
        </span>
      ))}
    </>
  )
}

function StatusChip({ status }: { status: string }) {
  // Prospect-status colors — keep distinct hues rather than shadcn variants
  // because "analyzed" / "enriched" / "ready" need visual differentiation.
  const cls: Record<string, string> = {
    new: 'bg-secondary text-secondary-foreground',
    enriched: 'bg-blue-100 text-blue-800',
    analyzed: 'bg-purple-100 text-purple-800',
    ready: 'bg-green-100 text-green-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    replied: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${cls[status] ?? 'bg-secondary text-secondary-foreground'}`}>
      {status}
    </span>
  )
}
