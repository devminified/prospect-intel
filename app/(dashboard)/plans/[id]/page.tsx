'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
      const res = await fetch(`/api/plans/${id}/execute`, { method: 'POST', headers: await authHeaders() })
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
      const res = await fetch(`/api/plans/${id}/execute?item_id=${itemId}`, { method: 'POST', headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'execute failed')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExecutingItemId(null)
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>
  if (error && !plan) return <div className="text-destructive">{error}</div>
  if (!plan) return <div className="text-muted-foreground">Plan not found.</div>

  const totalCount = items.reduce((sum, it) => sum + it.count, 0)
  const totalCost = items.reduce((sum, it) => sum + Number(it.estimated_cost_usd ?? 0), 0)
  const anyUnexecuted = items.some((it) => !it.batch_id)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/plans" className="text-sm text-primary hover:underline">← All plans</Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{plan.plan_date}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length} recommended batches · {totalCount} prospects · est. ${totalCost.toFixed(2)}
            </p>
          </div>
          {anyUnexecuted && (
            <Button onClick={executeAll} disabled={executing} className="bg-green-600 hover:bg-green-700 text-white">
              {executing ? 'Executing…' : 'Execute all'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
      )}
      {message && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">{message}</div>
      )}

      {plan.rationale_json?.rationale && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-sm leading-relaxed">
            <div className="text-xs font-semibold uppercase mb-2 text-muted-foreground">Planner rationale</div>
            <p className="text-foreground">{plan.rationale_json.rationale}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <Card key={it.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      {it.priority}
                    </span>
                    <h3 className="text-lg font-medium">
                      {it.category} <span className="text-muted-foreground">in</span> {it.city}
                    </h3>
                    <Badge variant="secondary">{it.count} prospects</Badge>
                    {it.estimated_cost_usd != null && (
                      <span className="text-xs text-muted-foreground">~${Number(it.estimated_cost_usd).toFixed(2)}</span>
                    )}
                    {it.batch_id && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">executed</Badge>}
                  </div>
                  {it.reasoning && <p className="mt-2 text-sm text-muted-foreground">{it.reasoning}</p>}
                  {it.batch_id && (
                    <Link href={`/batches/${it.batch_id}`} className="mt-2 inline-block text-sm text-primary hover:underline">
                      View batch →
                    </Link>
                  )}
                </div>
                {!it.batch_id && (
                  <Button
                    onClick={() => executeOne(it.id)}
                    disabled={executingItemId === it.id || executing}
                    size="sm"
                  >
                    {executingItemId === it.id ? 'Running…' : 'Run this one'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
