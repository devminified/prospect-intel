'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBatchDetail, type BatchProspect as Prospect } from '@/lib/queries/batch-detail'

interface OutreachState {
  has_pitch: boolean
  has_sent: boolean
  has_real_open: boolean
  has_reply: boolean
  recommended_channel: 'phone' | 'email' | 'either' | null
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

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useBatchDetail(id)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [exportError, setExportError] = useState('')

  const batch = data?.batch ?? null
  const prospects = data?.prospects ?? []

  async function exportCsv() {
    setExportError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setExportError('Not signed in')
      return
    }
    const res = await fetch(`/api/pitches/export?batch_id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'export failed' }))
      setExportError(body.error ?? 'export failed')
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

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (error) return <div className="text-destructive">{error.message}</div>
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
        {exportError && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{exportError}</div>
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
