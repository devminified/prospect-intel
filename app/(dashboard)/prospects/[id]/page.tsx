'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useNotes } from '@/lib/hooks/use-notes'
import { useFollowups } from '@/lib/hooks/use-followups'
import { useContactMutations } from '@/lib/hooks/use-contact-mutations'
import { authHeaders } from '@/lib/auth-headers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  Note,
  Followup,
  DetailPainPoint as PainPoint,
  ProspectContact as Contact,
  DetailVisibilityAudit as Audit,
  ChannelRecommendationView as Recommendation,
  SentEmailDetail as SentEmail,
  SentEmailLite,
  ProspectActivityEvent as ActivityEvent,
  ProspectDetail as Detail,
} from '@/lib/types'

const PROSPECT_STATUSES = ['new', 'enriched', 'analyzed', 'ready', 'contacted', 'replied', 'rejected', 'filtered_out']

const OUTREACH_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'calling', label: 'Calling now' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail left' },
  { value: 'call_ended', label: 'Call ended' },
  { value: 'follow_up', label: 'Follow up needed' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'do_not_contact', label: 'Do not contact' },
]
const OUTREACH_LABEL = new Map(OUTREACH_STATUS_OPTIONS.map((o) => [o.value, o.label]))

const PITCH_STATUS_CLS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 hover:bg-green-100',
  sent: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  draft: 'bg-secondary text-secondary-foreground hover:bg-secondary',
}

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [copiedAt, setCopiedAt] = useState<string | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  // Sub-domain state lives in custom hooks (use-notes / use-followups /
  // use-contact-mutations). They each own their own pending flags + error
  // and hand back small APIs of stable functions; the page just reads
  // them and wires JSX.
  const notes = useNotes(id, () => void load())
  const followups = useFollowups(
    {
      id,
      name: detail?.prospect.name ?? '',
      website: detail?.prospect.website ?? null,
    },
    () => void load(),
    (mutator) =>
      setDetail((d) => (d ? { ...d, followups: mutator(d.followups) } : d))
  )
  const contactMut = useContactMutations(id, () => void load())
  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; email: string | null; role: string }>>([])

  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/team', { headers })
        if (res.ok) {
          const json = await res.json()
          setTeamMembers(json.members ?? [])
        }
      } catch {}
    })()
  }, [])

  async function changeAssignee(targetUserId: string | null) {
    if (!detail) return
    const prior = { assigned_to: detail.prospect.assigned_to, assigned_at: detail.prospect.assigned_at }
    setDetail({
      ...detail,
      prospect: {
        ...detail.prospect,
        assigned_to: targetUserId,
        assigned_at: targetUserId ? new Date().toISOString() : null,
      },
    })
    setError('')
    try {
      await patch({ assigned_to: targetUserId })
    } catch (e: any) {
      setDetail((d) => (d ? { ...d, prospect: { ...d.prospect, ...prior } } : d))
      setError(e.message)
    }
  }

  // Bubble hook errors up to the existing page-level banner so the user
  // sees one consistent error surface.
  useEffect(() => {
    const msg = notes.error ?? followups.error ?? contactMut.error
    if (msg) setError(msg)
  }, [notes.error, followups.error, contactMut.error])
  const [regenerating, setRegenerating] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [scriptCopiedAt, setScriptCopiedAt] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    load()
    // Fire-and-forget viewed ping. Best-effort; ignore failures so a 401 or
    // network blip doesn't block the page from rendering.
    void (async () => {
      try {
        const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
        await fetch(`/api/prospects/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ mark_viewed: true }),
        })
      } catch {}
    })()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')

    const [pRes, eRes, aRes, pitchRes, cRes, vRes, rRes] = await Promise.all([
      supabase.from('prospects').select('*').eq('id', id).single(),
      supabase.from('enrichments').select('*').eq('prospect_id', id).maybeSingle(),
      supabase.from('analyses').select('*').eq('prospect_id', id).maybeSingle(),
      supabase.from('pitches').select('id, subject, body, edited_body, status').eq('prospect_id', id).maybeSingle(),
      supabase.from('contacts').select('id, full_name, title, seniority, department, email, email_confidence, phone, phone_source, linkedin_url, is_primary').eq('prospect_id', id),
      supabase.from('visibility_audits').select('*').eq('prospect_id', id).maybeSingle(),
      supabase.from('channel_recommendations').select('phone_fit_score, email_fit_score, recommended_channel, reasoning, phone_script, generated_at').eq('prospect_id', id).maybeSingle(),
    ])

    // Sent emails — fetch all for the activity timeline; the strip uses [0].
    let sentEmail: SentEmail | null = null
    let allSentEmails: SentEmailLite[] = []
    const pitchId = (pitchRes.data as any)?.id
    if (pitchId) {
      const { data: sent } = await supabase
        .from('sent_emails')
        .select('id, to_email, sent_at, bounced, bounce_reason, email_opens(opened_at, is_probably_mpp, is_probably_self), email_replies(received_at, classification)')
        .eq('pitch_id', pitchId)
        .order('sent_at', { ascending: false })
      const all = (sent as unknown as SentEmail[]) ?? []
      sentEmail = all[0] ?? null
      allSentEmails = all.map((s) => ({
        id: s.id,
        to_email: s.to_email,
        sent_at: s.sent_at,
        bounced: s.bounced,
        email_opens: s.email_opens ?? [],
        email_replies: s.email_replies ?? [],
      }))
    }

    const [notesRes, followupsRes] = await Promise.all([
      supabase
        .from('prospect_notes')
        .select('id, body, created_at, updated_at, user_id')
        .eq('prospect_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('prospect_followups')
        .select('id, due_at, note, done, done_at, created_at')
        .eq('prospect_id', id)
        .order('done', { ascending: true })
        .order('due_at', { ascending: true }),
    ])
    const notesData = notesRes.data
    const followupsData = followupsRes.data

    if (pRes.error) {
      setError(`Prospect load failed: ${pRes.error.message}`)
      setLoading(false)
      return
    }

    const d: Detail = {
      prospect: pRes.data as any,
      enrichment: (eRes.data as any) ?? null,
      analysis: (aRes.data as any) ?? null,
      pitch: (pitchRes.data as any) ?? null,
      contacts: (cRes.data as Contact[]) ?? [],
      audit: (vRes.data as Audit) ?? null,
      recommendation: (rRes.data as Recommendation) ?? null,
      sentEmail,
      notes: (notesData as Note[]) ?? [],
      followups: (followupsData as Followup[]) ?? [],
      allSentEmails,
      prospectCreatedAt: (pRes.data as any)?.created_at ?? null,
    }
    setDetail(d)
    setEditedBody(d.pitch?.edited_body ?? d.pitch?.body ?? '')
    setLoading(false)
  }

  async function patch(body: Record<string, unknown>) {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
    const res = await fetch(`/api/prospects/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'request failed' }))
      throw new Error(err.error ?? 'request failed')
    }
  }

  async function saveEdit() {
    setSaving(true)
    setError('')
    try {
      await patch({ pitch_edited_body: editedBody })
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    setSaving(true)
    setError('')
    try {
      await patch({ pitch_edited_body: editedBody, pitch_status: 'approved' })
      await load()
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(newStatus: string) {
    setSaving(true)
    setError('')
    try {
      await patch({ prospect_status: newStatus })
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeOutreachStatus(newValue: string | null) {
    if (!detail) return
    // Optimistic update — flip the badge immediately so the user sees the
    // click land. Snapshot the prior value so we can revert on failure.
    const prior = detail.prospect.outreach_status
    setDetail({
      ...detail,
      prospect: { ...detail.prospect, outreach_status: newValue },
    })
    setError('')
    try {
      await patch({ outreach_status: newValue })
    } catch (e: any) {
      // Revert on failure.
      setDetail((d) =>
        d ? { ...d, prospect: { ...d.prospect, outreach_status: prior } } : d
      )
      setError(e.message)
    }
  }

  async function discoverContacts() {
    setDiscovering(true)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/discover-contacts`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'discovery failed' }))
        throw new Error(err.error ?? 'discovery failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDiscovering(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/regenerate-pitch`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'regenerate failed' }))
        throw new Error(err.error ?? 'regenerate failed')
      }
      await load()
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRegenerating(false)
    }
  }

  async function reveal(contactId: string) {
    setRevealingId(contactId)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/contacts/${contactId}/reveal`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'reveal failed' }))
        throw new Error(err.error ?? 'reveal failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRevealingId(null)
    }
  }

  function copy() {
    const text = editedBody || detail?.pitch?.body || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAt(new Date().toLocaleTimeString())
    })
  }

  async function generateRecommendation() {
    setRecommending(true)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/recommend-channel`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'recommendation failed' }))
        throw new Error(err.error ?? 'recommendation failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRecommending(false)
    }
  }

  async function sendViaZoho() {
    setSending(true)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/pitches/${detail?.pitch ? (detail.pitch as any).id ?? '' : ''}/send`, {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'send failed' }))
        throw new Error(err.error ?? 'send failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  function copyScript() {
    const text = detail?.recommendation?.phone_script ?? ''
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setScriptCopiedAt(new Date().toLocaleTimeString())
    })
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>
  if (error && !detail) return <div className="text-destructive">{error}</div>
  if (!detail) return <div className="text-muted-foreground">Not found.</div>

  const { prospect, enrichment, analysis, pitch, contacts, audit, recommendation, sentEmail } = detail
  const primaryContactEmail = contacts.find((c) => c.is_primary && c.email)?.email ?? contacts.find((c) => c.email)?.email ?? null
  const realOpens = (sentEmail?.email_opens ?? []).filter((o) => !o.is_probably_mpp && !o.is_probably_self).length
  const mppOpens = (sentEmail?.email_opens ?? []).filter((o) => o.is_probably_mpp).length
  const selfOpens = (sentEmail?.email_opens ?? []).filter((o) => o.is_probably_self).length
  const replies = sentEmail?.email_replies ?? []
  const replyCount = replies.length
  const latestReply = replies[replies.length - 1] ?? null
  const replyClassification = latestReply?.classification ?? null
  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return seniorityRank(a.seniority) - seniorityRank(b.seniority)
  })
  const techStack = (enrichment?.tech_stack_json as any) ?? {}
  const painPoints = (analysis?.pain_points_json as PainPoint[] | null) ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/batches/${prospect.batch_id}`} className="text-sm text-primary hover:underline">
          ← Back to batch
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{prospect.name}</h1>
          <Select
            value={prospect.status}
            onValueChange={(v) => { if (v) changeStatus(v) }}
            disabled={saving}
          >
            <SelectTrigger size="sm" className="min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROSPECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={prospect.outreach_status ?? '__none__'}
            onValueChange={(v) => changeOutreachStatus(v === '__none__' ? null : v)}
          >
            <SelectTrigger size="sm" className="min-w-[150px]">
              <SelectValue placeholder="Outreach…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— no outreach status —</SelectItem>
              {OUTREACH_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={prospect.assigned_to ?? '__unassigned__'}
            onValueChange={(v) => changeAssignee(v === '__unassigned__' ? null : v)}
          >
            <SelectTrigger size="sm" className="min-w-[170px]">
              <SelectValue placeholder="Assign…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">— unassigned —</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.email ?? m.user_id.slice(0, 8)} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {prospect.address && <p className="mt-1 text-sm text-muted-foreground">{prospect.address}</p>}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
      )}

      {prospect.status === 'filtered_out' && prospect.filter_reason && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-sm">
          <span className="font-semibold">Filtered out:</span> {prospect.filter_reason}
          <span className="ml-2 text-amber-700">— no pitch was generated. Change your ICP filters to re-include.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Notes</CardTitle>
            <span className="text-xs text-muted-foreground">{detail.notes.length} {detail.notes.length === 1 ? 'note' : 'notes'}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2">
              <textarea
                value={notes.newBody}
                onChange={(e) => notes.setNewBody(e.target.value)}
                placeholder="Add a note — call notes, follow-up context, anything you want to remember…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={notes.add} disabled={notes.pending === 'add' || !notes.newBody.trim()}>
                  {notes.pending === 'add' ? 'Adding…' : 'Add note'}
                </Button>
              </div>
            </div>
            {detail.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.notes.map((n) => {
                  const isEditing = notes.editingId === n.id
                  return (
                    <div key={n.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={notes.editingBody}
                            onChange={(e) => notes.setEditingBody(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={notes.cancelEdit}>Cancel</Button>
                            <Button size="sm" onClick={notes.save} disabled={notes.pending === 'save' || !notes.editingBody.trim()}>
                              {notes.pending === 'save' ? 'Saving…' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {formatRel(n.created_at)}
                              {n.updated_at && ` · edited ${formatRel(n.updated_at)}`}
                            </span>
                            <span className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => notes.startEdit(n)}>Edit</Button>
                              <Button variant="ghost" size="sm" onClick={() => notes.remove(n.id)}>Delete</Button>
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Follow-ups</CardTitle>
            {(() => {
              const active = detail.followups.filter((f) => !f.done)
              const overdue = active.filter((f) => Date.parse(f.due_at) < Date.now()).length
              return (
                <span className="text-xs text-muted-foreground">
                  {active.length} active{overdue > 0 ? ` · ${overdue} overdue` : ''}
                </span>
              )
            })()}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <input
                type="datetime-local"
                value={followups.newAt}
                onChange={(e) => followups.setNewAt(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <input
                type="text"
                placeholder="What to do (optional) — e.g. 'Send proposal'"
                value={followups.newNote}
                onChange={(e) => followups.setNewNote(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={followups.add} disabled={followups.pending === 'add' || !followups.newAt}>
                  {followups.pending === 'add' ? 'Adding…' : 'Add follow-up'}
                </Button>
              </div>
            </div>
            {detail.followups.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No follow-ups scheduled.</p>
            ) : (
              <div className="space-y-2">
                {detail.followups.map((f) => {
                  const due = Date.parse(f.due_at)
                  const overdue = !f.done && due < Date.now()
                  const dueToday = !f.done && !overdue && due - Date.now() < 24 * 60 * 60 * 1000
                  const dueLabel = formatDue(f.due_at)
                  return (
                    <div
                      key={f.id}
                      className={`rounded-md border p-3 text-sm ${
                        f.done ? 'opacity-60' : overdue ? 'border-destructive/40 bg-destructive/5' : dueToday ? 'border-blue-300 bg-blue-50' : 'bg-background'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={f.done}
                          onChange={() => followups.toggleDone(f)}
                          disabled={followups.pendingId === f.id}
                          className="mt-1 shrink-0"
                          aria-label={f.done ? 'Mark as not done' : 'Mark as done'}
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${f.done ? 'line-through' : ''}`}>
                            {dueLabel}
                            {overdue && <span className="ml-2 text-xs text-destructive font-semibold">overdue</span>}
                            {dueToday && <span className="ml-2 text-xs text-blue-700 font-semibold">today</span>}
                          </div>
                          {f.note && <p className="text-muted-foreground whitespace-pre-wrap mt-0.5">{f.note}</p>}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {!f.done && (
                              <Button variant="ghost" size="sm" onClick={() => followups.downloadCalendar(f)}>
                                Add to calendar
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => followups.remove(f.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const events = buildActivityFeed(detail)
              if (events.length === 0) {
                return <p className="text-sm text-muted-foreground italic">No activity yet.</p>
              }
              return (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {events.map((e, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[22px] top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background border text-[10px]">
                        {e.icon}
                      </span>
                      <div className={`text-sm ${e.cls ?? ''}`}>{e.text}</div>
                      <div className="text-xs text-muted-foreground">{formatRel(e.ts)}</div>
                    </li>
                  ))}
                </ol>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <Row label="Website">
                {prospect.website ? (
                  <a href={prospect.website} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                    {prospect.website}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <Row label="Phone">
                {prospect.phone ? (
                  <a href={`tel:${prospect.phone}`} className="text-primary hover:underline font-medium">
                    {prospect.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <Row label="Rating">
                {prospect.rating != null ? `${prospect.rating} (${prospect.review_count ?? 0} reviews)` : <span className="text-muted-foreground">—</span>}
              </Row>
            </dl>

            <Separator />

            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tech stack</div>
              <div className="flex flex-wrap gap-1">
                {(['cms', 'booking', 'ecommerce', 'chat'] as const).map((k) => {
                  const v = techStack?.[k]
                  if (!v) return null
                  return (
                    <Badge key={k} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10">
                      {k}: {v}
                    </Badge>
                  )
                })}
                {!techStack?.cms && !techStack?.booking && !techStack?.ecommerce && !techStack?.chat && (
                  <span className="text-xs text-muted-foreground">none detected</span>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Signals</div>
              <div className="grid grid-cols-2 gap-y-1 text-xs">
                <BoolFlag label="online booking" v={enrichment?.has_online_booking} />
                <BoolFlag label="ecommerce" v={enrichment?.has_ecommerce} />
                <BoolFlag label="chat" v={enrichment?.has_chat} />
                <BoolFlag label="contact form" v={enrichment?.has_contact_form} />
                <BoolFlag label="mobile-friendly" v={enrichment?.is_mobile_friendly} />
                <BoolFlag label="ssl valid" v={enrichment?.ssl_valid} />
              </div>
            </div>

            {enrichment?.fetch_error && (
              <>
                <Separator />
                <div className="text-xs text-destructive">
                  fetch error: {enrichment.fetch_error}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* MIDDLE: Analysis */}
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Analysis</CardTitle>
            {analysis?.opportunity_score != null && (
              <div className="text-right">
                <div className="text-2xl font-bold">{analysis.opportunity_score}</div>
                <div className="text-xs text-muted-foreground">opportunity</div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!analysis ? (
              <p className="text-sm text-muted-foreground">Not analyzed yet.</p>
            ) : (
              <>
                {analysis.best_angle && (
                  <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-md text-sm text-foreground">
                    <div className="text-xs font-semibold uppercase mb-1 text-muted-foreground">Best angle</div>
                    {analysis.best_angle}
                  </div>
                )}

                <div className="space-y-3">
                  {painPoints.map((pp, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="font-medium text-sm">{pp.pain}</div>
                      <div className="mt-1 text-xs text-muted-foreground italic">{pp.evidence}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">{pp.solution_category}</Badge>
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">effort: {pp.effort}</Badge>
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">impact: {pp.impact}</Badge>
                      </div>
                    </div>
                  ))}
                  {painPoints.length === 0 && <p className="text-sm text-muted-foreground">No pain points.</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Pitch */}
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Pitch</CardTitle>
            {pitch && (
              <Badge className={PITCH_STATUS_CLS[pitch.status] ?? PITCH_STATUS_CLS.draft}>
                {pitch.status}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {!pitch ? (
              <p className="text-sm text-muted-foreground">No pitch generated yet.</p>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subject</div>
                  <div className="text-sm">{pitch.subject}</div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Body</div>
                  <Textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    className="flex-1 min-h-[180px] font-mono"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {editedBody.trim().split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={saveEdit} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={regenerate}
                    disabled={regenerating}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    title="Re-run Sonnet with the latest enrichment + analysis data"
                  >
                    {regenerating ? 'Regenerating…' : 'Regenerate'}
                  </Button>
                  <Button size="sm" onClick={copy}>Copy</Button>
                  <Button
                    size="sm"
                    onClick={approve}
                    disabled={saving || pitch.status === 'approved'}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {pitch.status === 'approved' ? 'Approved ✓' : 'Approve'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={sendViaZoho}
                    disabled={sending || !primaryContactEmail || !!sentEmail}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    title={
                      !primaryContactEmail
                        ? 'No revealed contact email — reveal one first'
                        : sentEmail
                        ? 'Already sent'
                        : 'Send this pitch via your connected Zoho account'
                    }
                  >
                    {sending ? 'Sending…' : sentEmail ? 'Sent ✓' : 'Send via Zoho'}
                  </Button>
                </div>

                {sentEmail && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md text-xs space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">
                        sent to {sentEmail.to_email}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(sentEmail.sent_at).toLocaleString()}
                      </span>
                      {sentEmail.bounced && (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                          bounced
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
                      <span>
                        <span className="font-semibold text-foreground">{realOpens}</span> opens
                        {(mppOpens > 0 || selfOpens > 0) && (
                          <span className="ml-1 text-muted-foreground/70">
                            (
                            {mppOpens > 0 ? `+${mppOpens} likely MPP` : ''}
                            {mppOpens > 0 && selfOpens > 0 ? ', ' : ''}
                            {selfOpens > 0 ? `+${selfOpens} self` : ''}
                            )
                          </span>
                        )}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{replyCount}</span> replies
                      </span>
                      {replyClassification && <ReplyClassificationBadge classification={replyClassification} />}
                    </div>
                    {latestReply?.received_at && (
                      <div className="text-muted-foreground/80">
                        last reply {new Date(latestReply.received_at).toLocaleString()}
                      </div>
                    )}
                    {sentEmail.bounce_reason && (
                      <p className="text-destructive">bounce: {sentEmail.bounce_reason}</p>
                    )}
                  </div>
                )}

                {(savedAt || copiedAt) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {savedAt && <span>saved at {savedAt}</span>}
                    {savedAt && copiedAt && ' · '}
                    {copiedAt && <span>copied at {copiedAt}</span>}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visibility audit — full width below the 3-panel grid */}
      {audit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Digital visibility</CardTitle>
          </CardHeader>
          <CardContent>
            {audit.visibility_summary && (
              <p className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-md text-sm leading-relaxed">
                {audit.visibility_summary}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Stat
                label="GMB rating"
                value={audit.gmb_rating != null ? `${audit.gmb_rating}★` : '—'}
                sub={audit.gmb_review_count != null ? `${audit.gmb_review_count} reviews` : undefined}
              />
              <Stat
                label="Rank — category"
                value={audit.serp_rank_main != null ? `#${audit.serp_rank_main}` : 'not top 20'}
                sub="in Google"
              />
              <Stat
                label="Rank — brand"
                value={audit.serp_rank_brand != null ? `#${audit.serp_rank_brand}` : 'not ranking'}
                sub="own name"
              />
            </div>

            {audit.social_links_json && Object.keys(audit.social_links_json).length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Social presence</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(audit.social_links_json)
                    .filter(([, url]) => url)
                    .map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url as string}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 bg-muted hover:bg-muted/70 rounded-md text-xs transition-colors"
                      >
                        <span className="capitalize font-medium">{platform}</span>
                        <span className="text-muted-foreground">↗</span>
                      </a>
                    ))}
                </div>
              </div>
            )}

            {audit.meta_ads_running != null && (
              <div className="text-sm">
                <span className="text-xs font-semibold uppercase text-muted-foreground mr-2">Meta ads:</span>
                {audit.meta_ads_running ? (
                  <span className="text-green-700 font-medium">
                    running ({audit.meta_ads_count} active)
                  </span>
                ) : (
                  <span className="text-muted-foreground">not running</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Channel recommendation — on-demand, Sonnet-generated */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Best outreach channel</CardTitle>
          {recommendation && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-normal">
                {recommendation.generated_at
                  ? `generated ${new Date(recommendation.generated_at).toLocaleString()}`
                  : 'generated'}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={generateRecommendation}
                disabled={recommending}
              >
                {recommending ? 'Regenerating…' : 'Regenerate'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!recommendation ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-1">
                No channel recommendation yet.
              </p>
              <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
                Sonnet will score phone vs email fit for this specific prospect and
                write a cold-call opening if phone is the better channel. Heuristic,
                not a statistical close-rate prediction.
              </p>
              <Button onClick={generateRecommendation} disabled={recommending}>
                {recommending ? 'Thinking…' : 'Suggest best channel'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  className={
                    recommendation.recommended_channel === 'phone'
                      ? 'bg-green-100 text-green-800 hover:bg-green-100'
                      : recommendation.recommended_channel === 'email'
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary'
                  }
                >
                  recommended: {recommendation.recommended_channel}
                </Badge>
                {recommendation.reasoning && (
                  <p className="text-sm text-muted-foreground flex-1 min-w-[280px]">{recommendation.reasoning}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FitBar label="Phone" score={recommendation.phone_fit_score} accent="green" />
                <FitBar label="Email" score={recommendation.email_fit_score} accent="blue" />
              </div>

              {recommendation.phone_script && (
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      Phone call script
                    </div>
                    <Button variant="outline" size="sm" onClick={copyScript}>
                      Copy script
                    </Button>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md text-sm leading-relaxed whitespace-pre-wrap font-mono">
                    {recommendation.phone_script}
                  </div>
                  {scriptCopiedAt && (
                    <div className="mt-1 text-xs text-muted-foreground">copied at {scriptCopiedAt}</div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Full call script — opening through close, plus objection handlers and a voicemail variant. Skim before dialing and adjust tone to match your voice.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Executives panel — full width below the 3-panel grid */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Executives & contacts</CardTitle>
          {sortedContacts.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">{sortedContacts.length} discovered via Apollo</span>
          )}
        </CardHeader>
        <CardContent>
          {sortedContacts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">
                No contacts discovered yet. Apollo runs on-demand to keep credits for leads you actually want to pitch.
              </p>
              <Button onClick={discoverContacts} disabled={discovering}>
                {discovering ? 'Searching Apollo…' : 'Find decision makers'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Level</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">LinkedIn</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedContacts.map((c) => (
                    <tr key={c.id} className={c.is_primary ? 'bg-primary/5' : ''}>
                      <td className="py-2 pr-4 font-medium">
                        <span className="flex items-center gap-2">
                          <span>{c.full_name ?? '—'}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => contactMut.setName(c.id, c.full_name)}
                            disabled={(contactMut.pendingId === c.id && contactMut.pendingKind === 'name')}
                            title={c.full_name ? 'Edit name (used by Lusha matcher)' : 'Set name — required for Lusha direct-line matching'}
                          >
                            {(contactMut.pendingId === c.id && contactMut.pendingKind === 'name') ? 'Saving…' : c.full_name ? 'Edit' : 'Set'}
                          </Button>
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.title ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <SeniorityChip seniority={c.seniority} />
                      </td>
                      <td className="py-2 pr-4">
                        {c.email ? (
                          <div className="flex items-center gap-2">
                            <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                              {c.email}
                            </a>
                            {c.email_confidence === 'verified' && (
                              <span className="text-xs text-green-700 font-semibold">verified</span>
                            )}
                          </div>
                        ) : c.full_name ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reveal(c.id)}
                            disabled={revealingId === c.id}
                            title="Spends 1 Apollo email credit"
                          >
                            {revealingId === c.id ? 'Revealing…' : 'Reveal email'}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {c.phone ? (
                          <span className="flex items-center gap-2">
                            <a href={`tel:${c.phone}`} className="text-primary hover:underline">
                              {c.phone}
                            </a>
                            {c.phone_source === 'gmb_business' && (
                              <span className="text-xs text-muted-foreground" title="Copied from Google business listing">business</span>
                            )}
                            {c.phone_source === 'lusha_direct' && (
                              <span className="text-xs text-green-700 font-semibold" title="Direct/mobile line revealed via Lusha">direct</span>
                            )}
                            {c.phone_source === 'manual' && (
                              <span className="text-xs text-muted-foreground" title="Entered manually">manual</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => contactMut.setPhoneManually(c.id, c.phone)}
                              disabled={contactMut.pendingId === c.id}
                              title="Edit / clear phone manually"
                            >
                              Edit
                            </Button>
                          </span>
                        ) : c.phone_source === 'lusha_direct' ? (
                          <span className="text-xs text-muted-foreground" title="Lusha had no direct line for this contact">
                            no direct line
                          </span>
                        ) : c.full_name && c.id ? (
                          <span className="flex flex-wrap items-center gap-2">
                            {prospect?.phone && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => contactMut.useBusinessPhone(c.id)}
                                disabled={contactMut.pendingId === c.id}
                                title="Free — uses the business phone from the Google listing"
                              >
                                {contactMut.pendingId === c.id ? 'Saving…' : 'Use business phone'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => contactMut.findDirectLine(c.id)}
                              disabled={contactMut.pendingId === c.id}
                              title="Spends 1 Lusha credit — only useful for B2B where the GMB phone routes through a switchboard"
                            >
                              Find direct line
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => contactMut.setPhoneManually(c.id, null)}
                              disabled={contactMut.pendingId === c.id}
                              title="Type a phone number directly — no credit charged"
                            >
                              Set manually
                            </Button>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2">
                          {c.linkedin_url ? (
                            <a
                              href={c.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              profile ↗
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => contactMut.setLinkedin(c.id, c.linkedin_url)}
                            disabled={(contactMut.pendingId === c.id && contactMut.pendingKind === 'linkedin')}
                            title={c.linkedin_url ? 'Edit LinkedIn URL' : 'Set LinkedIn URL — enables Lusha direct-line matching'}
                          >
                            {(contactMut.pendingId === c.id && contactMut.pendingKind === 'linkedin') ? 'Saving…' : c.linkedin_url ? 'Edit' : 'Set'}
                          </Button>
                        </span>
                      </td>
                      <td className="py-2">
                        {c.is_primary && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                            ★ primary
                          </Badge>
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
    </div>
  )
}

const SENIORITY_DISPLAY: Record<string, { label: string; cls: string }> = {
  founder:  { label: 'Founder',  cls: 'bg-purple-100 text-purple-800 hover:bg-purple-100' },
  owner:    { label: 'Owner',    cls: 'bg-purple-100 text-purple-800 hover:bg-purple-100' },
  c_suite:  { label: 'C-Suite',  cls: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100' },
  vp:       { label: 'VP',       cls: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
  director: { label: 'Director', cls: 'bg-sky-100 text-sky-800 hover:bg-sky-100' },
  manager:  { label: 'Manager',  cls: 'bg-secondary text-secondary-foreground hover:bg-secondary' },
  other:    { label: 'Staff',    cls: 'bg-secondary text-secondary-foreground hover:bg-secondary' },
}

function formatDue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today · ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  ) {
    return `Tomorrow · ${time}`
  }
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${time}`
}

function formatRel(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  if (ms < 0) return 'just now'
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

function buildActivityFeed(d: Detail): ActivityEvent[] {
  const events: ActivityEvent[] = []
  if (d.prospectCreatedAt) {
    events.push({
      ts: d.prospectCreatedAt,
      icon: '+',
      text: 'Prospect added to a batch',
      cls: 'text-muted-foreground',
    })
  }
  if (d.prospect.assigned_to && d.prospect.assigned_at) {
    events.push({
      ts: d.prospect.assigned_at,
      icon: '◎',
      text: `Assigned to a team member`,
      cls: 'text-purple-700',
    })
  }
  for (const n of d.notes) {
    const preview = n.body.length > 80 ? `${n.body.slice(0, 80).trim()}…` : n.body
    events.push({
      ts: n.created_at,
      icon: '✎',
      text: `Note: "${preview.replace(/\s+/g, ' ')}"`,
    })
  }
  for (const f of d.followups) {
    const noteSnippet = f.note ? ` — "${f.note.length > 60 ? `${f.note.slice(0, 60).trim()}…` : f.note}"` : ''
    events.push({
      ts: f.created_at,
      icon: '⏰',
      text: `Follow-up scheduled for ${formatDue(f.due_at)}${noteSnippet}`,
    })
    if (f.done && f.done_at) {
      events.push({
        ts: f.done_at,
        icon: '✓',
        text: `Follow-up completed${noteSnippet}`,
        cls: 'text-emerald-700',
      })
    }
  }
  for (const s of d.allSentEmails) {
    if (s.sent_at) {
      events.push({
        ts: s.sent_at,
        icon: '→',
        text: `Email sent${s.to_email ? ` to ${s.to_email}` : ''}${s.bounced ? ' (bounced)' : ''}`,
        cls: s.bounced ? 'text-destructive' : '',
      })
    }
    for (const o of s.email_opens ?? []) {
      const flag = o.is_probably_self
        ? 'self-open'
        : o.is_probably_mpp
        ? 'MPP-cached open'
        : 'opened'
      const cls = o.is_probably_self || o.is_probably_mpp ? 'text-muted-foreground' : 'text-blue-700'
      events.push({ ts: o.opened_at, icon: '◉', text: `Email ${flag}`, cls })
    }
    for (const r of s.email_replies ?? []) {
      if (!r.received_at) continue
      const tag = r.classification ? ` — ${r.classification}` : ''
      events.push({
        ts: r.received_at,
        icon: '↩',
        text: `Reply received${tag}`,
        cls: r.classification === 'interested' ? 'text-emerald-700' : '',
      })
    }
  }
  events.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  return events
}

function SeniorityChip({ seniority }: { seniority: string | null }) {
  const key = (seniority ?? 'other').toLowerCase()
  const disp = SENIORITY_DISPLAY[key] ?? SENIORITY_DISPLAY.other
  return <Badge className={disp.cls}>{disp.label}</Badge>
}

const SENIORITY_ORDER = ['founder', 'owner', 'c_suite', 'vp', 'director', 'manager', 'other']
function seniorityRank(s: string | null): number {
  const idx = SENIORITY_ORDER.indexOf((s ?? 'other').toLowerCase())
  return idx === -1 ? 999 : idx
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-xs font-semibold uppercase text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/50 rounded-md p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

const REPLY_CLASSIFICATION_STYLE: Record<string, { label: string; cls: string }> = {
  interested:      { label: '★ interested',       cls: 'bg-green-100 text-green-800 hover:bg-green-100' },
  not_interested:  { label: 'not interested',     cls: 'bg-red-100 text-red-800 hover:bg-red-100' },
  ooo:             { label: 'out of office',      cls: 'bg-sky-100 text-sky-800 hover:bg-sky-100' },
  unsubscribe:     { label: 'unsubscribe',        cls: 'bg-neutral-200 text-neutral-800 hover:bg-neutral-200' },
  question:        { label: 'question',           cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
}

function ReplyClassificationBadge({ classification }: { classification: string }) {
  const style = REPLY_CLASSIFICATION_STYLE[classification] ?? { label: classification, cls: 'bg-secondary text-secondary-foreground hover:bg-secondary' }
  return <Badge className={style.cls}>{style.label}</Badge>
}

function FitBar({ label, score, accent }: { label: string; score: number; accent: 'green' | 'blue' }) {
  const bar = accent === 'green' ? 'bg-green-500' : 'bg-blue-500'
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{label} fit</div>
        <div className="text-xl font-bold tabular-nums">{pct}</div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BoolFlag({ label, v }: { label: string; v: boolean | null | undefined }) {
  const color = v === true ? 'text-green-600' : v === false ? 'text-destructive' : 'text-muted-foreground'
  const mark = v === true ? '✓' : v === false ? '✗' : '—'
  return (
    <div className={`${color} flex items-center gap-1`}>
      <span className="font-mono">{mark}</span>
      <span className="text-foreground">{label}</span>
    </div>
  )
}
