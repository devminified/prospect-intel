'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Plan {
  id: string
  plan_date: string
  status: string
  created_at: string
  executed_at: string | null
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('lead_plans')
      .select('id, plan_date, status, created_at, executed_at')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setPlans((data as Plan[]) ?? [])
    }
    setLoading(false)
  }

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not signed in')
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'generate failed')
      window.location.href = `/plans/${body.plan_id}`
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="text-gray-500">Loading…</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily lead plans</h1>
          <p className="mt-1 text-sm text-gray-600">
            Opus-generated recommendations of which categories + cities to target today.
            <Link href="/settings/icp" className="ml-2 text-indigo-600 hover:underline">Edit ICP →</Link>
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-md font-medium"
        >
          {generating ? 'Generating…' : "Generate today's plan"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Past plans</h2>
        </div>
        {plans.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No plans yet. Fill out your ICP, then click "Generate today's plan".
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {plans.map((p) => (
              <Link
                key={p.id}
                href={`/plans/${p.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{p.plan_date}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Generated {new Date(p.created_at).toLocaleString()}
                      {p.executed_at && ` · Executed ${new Date(p.executed_at).toLocaleString()}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      p.status === 'executed'
                        ? 'bg-green-100 text-green-800'
                        : p.status === 'skipped'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
