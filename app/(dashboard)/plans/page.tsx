'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGeneratePlan, usePerformance, usePlans } from '@/lib/queries/plans'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  executed: 'default',
  skipped: 'outline',
  draft: 'secondary',
}

export default function PlansPage() {
  const router = useRouter()
  const plansQ = usePlans()
  const perfQ = usePerformance(30)
  const generateMut = useGeneratePlan()

  const plans = plansQ.data ?? []
  const performance = perfQ.data ?? []
  const loading = plansQ.isLoading
  const error = generateMut.error?.message ?? plansQ.error?.message ?? ''

  async function generate() {
    try {
      const body = await generateMut.mutateAsync()
      router.push(`/plans/${body.plan_id}`)
    } catch {
      // surfaced via generateMut.error
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily lead plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opus-generated recommendations of which categories + cities to target today.
            <Link href="/settings/icp" className="ml-2 text-primary hover:underline">Edit ICP →</Link>
          </p>
        </div>
        <Button onClick={generate} disabled={generateMut.isPending}>
          {generateMut.isPending ? 'Generating…' : "Generate today's plan"}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
      )}

      {performance.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Recent outreach performance</CardTitle>
            <span className="text-xs text-muted-foreground font-normal">last 30 days · planner uses this</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b">
                    <th className="p-3">Category</th>
                    <th className="p-3">City</th>
                    <th className="p-3 text-right">Sent</th>
                    <th className="p-3 text-right">Replies</th>
                    <th className="p-3 text-right">Interested</th>
                    <th className="p-3 text-right">Unsub</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {performance.map((p) => {
                    const pct = (n: number) => `${Math.round(n * 100)}%`
                    const strong = p.sent >= 5 && p.interested_rate >= 0.1
                    const bad = p.sent >= 5 && p.unsub_rate >= 0.2
                    const rowCls = strong
                      ? 'bg-green-50/50'
                      : bad
                      ? 'bg-red-50/50'
                      : ''
                    return (
                      <tr key={`${p.category}|${p.city}`} className={rowCls}>
                        <td className="p-3 font-medium capitalize">{p.category}</td>
                        <td className="p-3 text-muted-foreground">{p.city}</td>
                        <td className="p-3 text-right tabular-nums">{p.sent}</td>
                        <td className="p-3 text-right tabular-nums">
                          {p.replies}
                          <span className="ml-1 text-xs text-muted-foreground">({pct(p.reply_rate)})</span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={strong ? 'text-green-700 font-semibold' : ''}>
                            {p.interested}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">({pct(p.interested_rate)})</span>
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={bad ? 'text-destructive font-semibold' : ''}>
                            {p.unsub}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">({pct(p.unsub_rate)})</span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-xs text-muted-foreground">
              Rows highlighted green = ≥10% interested on ≥5 sent (planner ranks up). Red = ≥20% unsub (planner drops).
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Past plans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No plans yet. Fill out your ICP, then click &quot;Generate today&apos;s plan&quot;.
            </div>
          ) : (
            <div className="divide-y">
              {plans.map((p) => (
                <Link key={p.id} href={`/plans/${p.id}`} className="block p-6 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{p.plan_date}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generated {new Date(p.created_at).toLocaleString()}
                        {p.executed_at && ` · Executed ${new Date(p.executed_at).toLocaleString()}`}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>{p.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
