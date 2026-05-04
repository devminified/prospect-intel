'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useExecutePlan, usePlanDetail } from '@/lib/queries/plans'

export default function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const detailQ = usePlanDetail(id)
  const executeMut = useExecutePlan(id)
  const [executingItemId, setExecutingItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const plan = detailQ.data?.plan ?? null
  const items = detailQ.data?.items ?? []
  const loadError = detailQ.error?.message ?? ''
  const execError = executeMut.error?.message ?? ''
  const error = execError || loadError

  async function executeAll() {
    setMessage('')
    try {
      const body = await executeMut.mutateAsync({})
      setMessage(
        `Executed ${body.executed} of ${body.executed + body.skipped}` +
          (body.errors?.length ? ` (errors: ${body.errors.join('; ')})` : '')
      )
    } catch {
      // surfaced via executeMut.error
    }
  }

  async function executeOne(itemId: string) {
    setExecutingItemId(itemId)
    setMessage('')
    try {
      await executeMut.mutateAsync({ itemId })
    } catch {
      // surfaced via executeMut.error
    } finally {
      setExecutingItemId(null)
    }
  }

  if (detailQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (loadError && !plan) return <div className="text-destructive">{loadError}</div>
  if (!plan) return <div className="text-muted-foreground">Plan not found.</div>

  const totalCount = items.reduce((sum, it) => sum + it.count, 0)
  const totalCost = items.reduce((sum, it) => sum + Number(it.estimated_cost_usd ?? 0), 0)
  const anyUnexecuted = items.some((it) => !it.batch_id)
  const executingAll = executeMut.isPending && !executingItemId

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
            <Button onClick={executeAll} disabled={executingAll} className="bg-green-600 hover:bg-green-700 text-white">
              {executingAll ? 'Executing…' : 'Execute all'}
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
                    disabled={executingItemId === it.id || executingAll}
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
