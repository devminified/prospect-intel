'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Plan {
  id: string
  plan_date: string
  status: string
  rationale_json: { rationale?: string; today_iso?: string } | null
  created_at: string
  executed_at: string | null
}

interface PlanItem {
  id: string
  city: string
  category: string
  count: number
  reasoning: string | null
  priority: number
  estimated_cost_usd: number | null
  batch_id: string | null
  executed_at: string | null
}

export default function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executingItemId, setExecutingItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    const [p, it] = await Promise.all([
      supabase.from('lead_plans').select('*').eq('id', id).single(),
      supabase.from('lead_plan_items').select('*').eq('plan_id', id).order('priority', { ascending: true }),
    ])
    if (p.error) {
      setError(p.error.message)
      setLoading(false)
      return
    }
    setPlan(p.data as Plan)
    setItems((it.data as PlanItem[]) ?? [])
    setLoading(false)
  }

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
  }

  async function executeAll() {
    setExecuting(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/plans/${id}/execute`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'execute failed')
      setMessage(`Executed ${body.executed} of ${body.executed + body.skipped}${body.errors?.length ? ` (errors: ${body.errors.join('; ')})` : ''}`)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExecuting(false)
    }
  }

  async function executeOne(itemId: string) {
    setExecutingItemId(itemId)
    setError('')
    try {
      const res = await fetch(`/api/plans/${id}/execute?item_id=${itemId}`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'execute failed')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExecutingItemId(null)
    }
  }

  if (loading) return <div className="text-gray-500">Loading…</div>
  if (error && !plan) return <div className="text-red-600">{error}</div>
  if (!plan) return <div className="text-gray-500">Plan not found.</div>

  const totalCount = items.reduce((sum, it) => sum + it.count, 0)
  const totalCost = items.reduce((sum, it) => sum + Number(it.estimated_cost_usd ?? 0), 0)
  const anyUnexecuted = items.some((it) => !it.batch_id)

  return (
    <div>
      <div className="mb-6">
        <Link href="/plans" className="text-sm text-indigo-600 hover:underline">← All plans</Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plan.plan_date}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {items.length} recommended batches · {totalCount} prospects · est. ${totalCost.toFixed(2)}
            </p>
          </div>
          {anyUnexecuted && (
            <button
              onClick={executeAll}
              disabled={executing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-md font-medium"
            >
              {executing ? 'Executing…' : 'Execute all'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}
      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">{message}</div>
      )}

      {plan.rationale_json?.rationale && (
        <div className="mb-6 bg-indigo-50 rounded-lg p-4 text-sm text-indigo-900 leading-relaxed">
          <div className="text-xs font-semibold uppercase mb-2">Planner rationale</div>
          {plan.rationale_json.rationale}
        </div>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold">
                    {it.priority}
                  </span>
                  <h3 className="text-lg font-medium text-gray-900">
                    {it.category} <span className="text-gray-500">in</span> {it.city}
                  </h3>
                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                    {it.count} prospects
                  </span>
                  {it.estimated_cost_usd != null && (
                    <span className="text-xs text-gray-500">~${Number(it.estimated_cost_usd).toFixed(2)}</span>
                  )}
                  {it.batch_id && (
                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      executed
                    </span>
                  )}
                </div>
                {it.reasoning && (
                  <p className="mt-2 text-sm text-gray-600">{it.reasoning}</p>
                )}
                {it.batch_id && (
                  <Link
                    href={`/batches/${it.batch_id}`}
                    className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                  >
                    View batch →
                  </Link>
                )}
              </div>
              {!it.batch_id && (
                <button
                  onClick={() => executeOne(it.id)}
                  disabled={executingItemId === it.id || executing}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-md"
                >
                  {executingItemId === it.id ? 'Running…' : 'Run this one'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
