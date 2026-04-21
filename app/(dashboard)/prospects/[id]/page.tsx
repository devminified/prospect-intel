'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface PainPoint {
  pain: string
  evidence: string
  solution_category: string
  effort: string
  impact: string
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
}

const PROSPECT_STATUSES = ['new', 'enriched', 'analyzed', 'ready', 'contacted', 'replied', 'rejected']

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [copiedAt, setCopiedAt] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')

    const [pRes, eRes, aRes, pitchRes] = await Promise.all([
      supabase.from('prospects').select('*').eq('id', id).single(),
      supabase.from('enrichments').select('*').eq('prospect_id', id).maybeSingle(),
      supabase.from('analyses').select('*').eq('prospect_id', id).maybeSingle(),
      supabase.from('pitches').select('subject, body, edited_body, status').eq('prospect_id', id).maybeSingle(),
    ])

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

  function copy() {
    const text = editedBody || detail?.pitch?.body || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAt(new Date().toLocaleTimeString())
    })
  }

  if (loading) return <div className="text-gray-500">Loading…</div>
  if (error && !detail) return <div className="text-red-600">{error}</div>
  if (!detail) return <div className="text-gray-500">Not found.</div>

  const { prospect, enrichment, analysis, pitch } = detail
  const techStack = (enrichment?.tech_stack_json as any) ?? {}
  const painPoints = (analysis?.pain_points_json as PainPoint[] | null) ?? []

  return (
    <div>
      <div className="mb-6">
        <Link href={`/batches/${prospect.batch_id}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to batch
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{prospect.name}</h1>
          <select
            value={prospect.status}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={saving}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm bg-white"
          >
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {prospect.address && <p className="mt-1 text-sm text-gray-600">{prospect.address}</p>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Signals */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Signals</h2>

          <dl className="space-y-2 text-sm">
            <Row label="Website">
              {prospect.website ? (
                <a href={prospect.website} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">
                  {prospect.website}
                </a>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </Row>
            <Row label="Phone">{prospect.phone ?? <span className="text-gray-400">—</span>}</Row>
            <Row label="Rating">
              {prospect.rating != null ? `${prospect.rating} (${prospect.review_count ?? 0} reviews)` : <span className="text-gray-400">—</span>}
            </Row>
          </dl>

          <div className="mt-4 border-t pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Tech stack</div>
            <div className="flex flex-wrap gap-1">
              {(['cms', 'booking', 'ecommerce', 'chat'] as const).map((k) => {
                const v = techStack?.[k]
                if (!v) return null
                return (
                  <span key={k} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">
                    {k}: {v}
                  </span>
                )
              })}
              {!techStack?.cms && !techStack?.booking && !techStack?.ecommerce && !techStack?.chat && (
                <span className="text-xs text-gray-400">none detected</span>
              )}
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Signals</div>
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
            <div className="mt-4 border-t pt-4 text-xs text-red-600">
              fetch error: {enrichment.fetch_error}
            </div>
          )}
        </div>

        {/* MIDDLE: Analysis */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Analysis</h2>
            {analysis?.opportunity_score != null && (
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{analysis.opportunity_score}</div>
                <div className="text-xs text-gray-500">opportunity</div>
              </div>
            )}
          </div>

          {!analysis ? (
            <p className="text-sm text-gray-400">Not analyzed yet.</p>
          ) : (
            <>
              {analysis.best_angle && (
                <div className="mb-4 p-3 bg-indigo-50 rounded text-sm text-indigo-900">
                  <div className="text-xs font-semibold uppercase mb-1">Best angle</div>
                  {analysis.best_angle}
                </div>
              )}

              <div className="space-y-3">
                {painPoints.map((pp, i) => (
                  <div key={i} className="border border-gray-200 rounded p-3">
                    <div className="font-medium text-gray-900 text-sm">{pp.pain}</div>
                    <div className="mt-1 text-xs text-gray-600 italic">{pp.evidence}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">{pp.solution_category}</span>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded">effort: {pp.effort}</span>
                      <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">impact: {pp.impact}</span>
                    </div>
                  </div>
                ))}
                {painPoints.length === 0 && <p className="text-sm text-gray-400">No pain points.</p>}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Pitch */}
        <div className="bg-white rounded-lg shadow p-5 flex flex-col">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Pitch</h2>
            {pitch && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                pitch.status === 'approved' ? 'bg-green-100 text-green-800' :
                pitch.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-700'
              }`}>
                {pitch.status}
              </span>
            )}
          </div>

          {!pitch ? (
            <p className="text-sm text-gray-400">No pitch generated yet.</p>
          ) : (
            <>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Subject</div>
                <div className="text-sm text-gray-900">{pitch.subject}</div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Body</div>
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  className="flex-1 min-h-[180px] w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y font-mono"
                />
                <div className="mt-1 text-xs text-gray-400">
                  {editedBody.trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={copy}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md"
                >
                  Copy
                </button>
                <button
                  onClick={approve}
                  disabled={saving || pitch.status === 'approved'}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md disabled:opacity-50"
                >
                  {pitch.status === 'approved' ? 'Approved ✓' : 'Approve'}
                </button>
              </div>

              {(savedAt || copiedAt) && (
                <div className="mt-2 text-xs text-gray-500">
                  {savedAt && <span>saved at {savedAt}</span>}
                  {savedAt && copiedAt && ' · '}
                  {copiedAt && <span>copied at {copiedAt}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-xs font-semibold text-gray-500 uppercase shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function BoolFlag({ label, v }: { label: string; v: boolean | null | undefined }) {
  const color = v === true ? 'text-green-600' : v === false ? 'text-red-600' : 'text-gray-400'
  const mark = v === true ? '✓' : v === false ? '✗' : '—'
  return (
    <div className={`${color} flex items-center gap-1`}>
      <span className="font-mono">{mark}</span>
      <span className="text-gray-700">{label}</span>
    </div>
  )
}
