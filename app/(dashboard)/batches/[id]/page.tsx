'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Prospect {
  id: string
  name: string
  status: string
  website: string | null
  rating: number | null
  review_count: number | null
  analyses: { opportunity_score: number | null; best_angle: string | null } | null
}

interface Batch {
  id: string
  city: string
  category: string
  count_requested: number
  count_completed: number
  status: string
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [prospects, setProspects] = useState<Prospect[]>([])
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
      .select('id, city, category, count_requested, count_completed, status')
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
      .select('id, name, status, website, rating, review_count, analyses(opportunity_score, best_angle)')
      .eq('batch_id', id)
    if (pErr) {
      setError(`Prospects load failed: ${pErr.message}`)
      setLoading(false)
      return
    }

    const sorted = ((p as unknown as Prospect[]) ?? []).sort((a, b) => {
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

  if (loading) return <div className="text-gray-500">Loading…</div>
  if (error && !batch) return <div className="text-red-600">{error}</div>
  if (!batch) return <div className="text-gray-500">Batch not found.</div>

  return (
    <div>
      <div className="mb-6">
        <Link href="/batches" className="text-sm text-indigo-600 hover:underline">
          ← All batches
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {batch.category} in {batch.city}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {batch.count_completed} of {batch.count_requested} completed · {batch.status}
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md font-medium"
          >
            Export approved CSV
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Prospects</h2>
          <span className="text-sm text-gray-500">Sorted by opportunity score</span>
        </div>

        {prospects.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No prospects in this batch.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {prospects.map((p) => {
              const score = p.analyses?.opportunity_score ?? null
              const angle = p.analyses?.best_angle ?? null
              return (
                <Link
                  key={p.id}
                  href={`/prospects/${p.id}`}
                  className="block p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900 truncate">{p.name}</h3>
                        <StatusChip status={p.status} />
                      </div>
                      {angle && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{angle}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {p.website ?? 'no website'}
                        {p.rating != null && ` · ${p.rating}★ (${p.review_count ?? 0})`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-gray-900">{score ?? '—'}</div>
                      <div className="text-xs text-gray-500">score</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const color: Record<string, string> = {
    new: 'bg-gray-100 text-gray-700',
    enriched: 'bg-blue-100 text-blue-800',
    analyzed: 'bg-purple-100 text-purple-800',
    ready: 'bg-green-100 text-green-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    replied: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
  }
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${color[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  )
}
