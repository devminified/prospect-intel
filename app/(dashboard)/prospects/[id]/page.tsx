'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PainPoint {
  pain: string
  evidence: string
  solution_category: string
  effort: string
  impact: string
}

interface Contact {
  id: string
  full_name: string | null
  title: string | null
  seniority: string | null
  department: string | null
  email: string | null
  email_confidence: string | null
  phone: string | null
  phone_source: string | null
  linkedin_url: string | null
  is_primary: boolean
}

interface Audit {
  gmb_rating: number | null
  gmb_review_count: number | null
  gmb_photo_count: number | null
  gmb_review_highlights_json: string[] | null
  social_links_json: Record<string, string | null> | null
  instagram_followers: number | null
  facebook_followers: number | null
  serp_rank_main: number | null
  serp_rank_brand: number | null
  meta_ads_running: boolean | null
  meta_ads_count: number | null
  press_mentions_count: number | null
  press_mentions_sample_json: Array<{ title: string; source?: string; link?: string; date?: string }> | null
  visibility_summary: string | null
}

interface Recommendation {
  phone_fit_score: number
  email_fit_score: number
  recommended_channel: 'phone' | 'email' | 'either'
  reasoning: string | null
  phone_script: string | null
  generated_at: string | null
}

interface SentEmail {
  id: string
  to_email: string
  sent_at: string
  bounced: boolean
  bounce_reason: string | null
  email_opens: Array<{ opened_at: string; is_probably_mpp: boolean; is_probably_self: boolean }>
  email_replies: Array<{ received_at: string | null; classification: string | null }>
}

interface Detail {
  prospect: {
    id: string
    name: string
    batch_id: string
    status: string
    website: string | null
    address: string | null
    phone: string | null
    email: string | null
    rating: number | null
    review_count: number | null
    categories_text: string | null
    filter_reason: string | null
  }
  enrichment: {
    tech_stack_json: any
    has_online_booking: boolean | null
    has_ecommerce: boolean | null
    has_chat: boolean | null
    has_contact_form: boolean | null
    is_mobile_friendly: boolean | null
    ssl_valid: boolean | null
    fetch_error: string | null
  } | null
  analysis: {
    pain_points_json: PainPoint[] | null
    opportunity_score: number | null
    best_angle: string | null
  } | null
  pitch: {
    subject: string | null
    body: string | null
    edited_body: string | null
    status: string
  } | null
  contacts: Contact[]
  audit: Audit | null
  recommendation: Recommendation | null
  sentEmail: SentEmail | null
}

const PROSPECT_STATUSES = ['new', 'enriched', 'analyzed', 'ready', 'contacted', 'replied', 'rejected', 'filtered_out']

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
  const [phoneActionId, setPhoneActionId] = useState<string | null>(null)
  const [savingLinkedinId, setSavingLinkedinId] = useState<string | null>(null)
  const [savingNameId, setSavingNameId] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [scriptCopiedAt, setScriptCopiedAt] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    load()
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

    // Sent emails are loaded separately — keyed by pitch_id since pitch.id is required
    let sentEmail: SentEmail | null = null
    const pitchId = (pitchRes.data as any)?.id
    if (pitchId) {
      const { data: sent } = await supabase
        .from('sent_emails')
        .select('id, to_email, sent_at, bounced, bounce_reason, email_opens(opened_at, is_probably_mpp, is_probably_self), email_replies(received_at, classification)')
        .eq('pitch_id', pitchId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      sentEmail = (sent as unknown as SentEmail) ?? null
    }

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
    }
    setDetail(d)
    setEditedBody(d.pitch?.edited_body ?? d.pitch?.body ?? '')
    setLoading(false)
  }

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
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

  async function useBusinessPhoneAction(contactId: string) {
    setPhoneActionId(contactId)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/contacts/${contactId}/use-business-phone`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'use business phone failed' }))
        throw new Error(err.error ?? 'use business phone failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPhoneActionId(null)
    }
  }

  async function editNameAction(contactId: string, currentFullName: string | null) {
    const input = window.prompt(
      'Enter contact name as "First Last" — used by Lusha to match a direct line:',
      currentFullName ?? ''
    )
    if (input === null) return
    const trimmed = input.trim()
    if (trimmed === '') {
      setError('Name cannot be empty')
      return
    }
    const parts = trimmed.split(/\s+/).filter(Boolean)
    const firstName = parts[0] ?? null
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null
    if (!lastName) {
      const proceed = window.confirm(
        'Only one word — Lusha needs a last name to match. Proceed anyway?'
      )
      if (!proceed) return
    }
    setSavingNameId(contactId)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/contacts/${contactId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          full_name: trimmed,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'save name failed' }))
        throw new Error(err.error ?? 'save name failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSavingNameId(null)
    }
  }

  async function setLinkedinAction(contactId: string, currentUrl: string | null) {
    const input = window.prompt(
      currentUrl
        ? 'Update LinkedIn profile URL (or clear to remove):'
        : 'Paste the LinkedIn profile URL for this contact (Lusha matches against this most reliably):',
      currentUrl ?? ''
    )
    if (input === null) return // cancel
    const trimmed = input.trim()
    setSavingLinkedinId(contactId)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/contacts/${contactId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ linkedin_url: trimmed === '' ? null : trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'save linkedin failed' }))
        throw new Error(err.error ?? 'save linkedin failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSavingLinkedinId(null)
    }
  }

  async function findDirectLineAction(contactId: string) {
    if (!confirm('Spend 1 Lusha credit to find a direct/mobile line for this contact? For SMB prospects the business phone above is usually the right number — only do this if you genuinely need the decision-maker direct.')) return
    setPhoneActionId(contactId)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${id}/contacts/${contactId}/find-direct-line`, { method: 'POST', headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'find direct line failed' }))
        throw new Error(err.error ?? 'find direct line failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPhoneActionId(null)
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
                            onClick={() => editNameAction(c.id, c.full_name)}
                            disabled={savingNameId === c.id}
                            title={c.full_name ? 'Edit name (used by Lusha matcher)' : 'Set name — required for Lusha direct-line matching'}
                          >
                            {savingNameId === c.id ? 'Saving…' : c.full_name ? 'Edit' : 'Set'}
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
                                onClick={() => useBusinessPhoneAction(c.id)}
                                disabled={phoneActionId === c.id}
                                title="Free — uses the business phone from the Google listing"
                              >
                                {phoneActionId === c.id ? 'Saving…' : 'Use business phone'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => findDirectLineAction(c.id)}
                              disabled={phoneActionId === c.id}
                              title="Spends 1 Lusha credit — only useful for B2B where the GMB phone routes through a switchboard"
                            >
                              Find direct line
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
                            onClick={() => setLinkedinAction(c.id, c.linkedin_url)}
                            disabled={savingLinkedinId === c.id}
                            title={c.linkedin_url ? 'Edit LinkedIn URL' : 'Set LinkedIn URL — enables Lusha direct-line matching'}
                          >
                            {savingLinkedinId === c.id ? 'Saving…' : c.linkedin_url ? 'Edit' : 'Set'}
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
