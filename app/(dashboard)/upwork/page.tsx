'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpworkAccess } from '@/lib/queries/upwork-profiles'
import { useUpworkOverview } from '@/lib/queries/upwork-analytics'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  archived: 'outline',
}

const WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '-1', label: 'All time' },
]

export default function UpworkLandingPage() {
  const [windowDays, setWindowDays] = useState<number>(30)
  const accessQ = useUpworkAccess()
  const overviewQ = useUpworkOverview(windowDays)

  const isOwner = accessQ.data?.team_role === 'owner'
  const data = overviewQ.data
  const error = overviewQ.error?.message ?? ''

  if (overviewQ.isLoading) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Upwork overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activity across the profiles you can see.
            {isOwner && ' As owner, you see every profile on the team.'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={String(windowDays)} onValueChange={(v) => v && setWindowDays(Number(v))}>
            <SelectTrigger size="sm" className="min-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/upwork/profiles" className="text-sm text-primary hover:underline">
            Manage profiles →
          </Link>
          <Link href="/upwork/leaderboard" className="text-sm text-primary hover:underline">
            Leaderboard →
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Proposals sent" value={data.totals.proposals_sent_window} />
            <Stat label="Hires" value={data.totals.hires_window} accent="emerald" />
            <Stat label="Revenue (window)" value={fmtUsd(data.totals.revenue_window_usd)} />
            <Stat
              label="Revenue (all time)"
              value={fmtUsd(data.totals.revenue_all_time_usd)}
              accent="emerald"
            />
            <Stat label="Connects total" value={data.totals.connects_balance_total} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue — last 12 months</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueBars rows={data.monthly_paid_usd} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-profile breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.per_profile.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No profiles to show.
                  {isOwner && (
                    <Link href="/upwork/profiles" className="ml-1 text-primary hover:underline">
                      Add one →
                    </Link>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                      <th className="px-6 py-3">Profile</th>
                      <th className="px-6 py-3 text-right">Proposals</th>
                      <th className="px-6 py-3 text-right">Hires</th>
                      <th className="px-6 py-3 text-right">Active contracts</th>
                      <th className="px-6 py-3 text-right">Revenue (window)</th>
                      <th className="px-6 py-3 text-right">All time</th>
                      <th className="px-6 py-3 text-right">Connects</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.per_profile.map((p) => (
                      <tr key={p.profile_id}>
                        <td className="px-6 py-3">
                          <Link
                            href={`/upwork/profiles/${p.profile_id}`}
                            className="font-medium hover:underline"
                          >
                            {p.profile_name}
                          </Link>{' '}
                          <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>{p.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">{p.proposals_sent_window}</td>
                        <td className="px-6 py-3 text-right tabular-nums">
                          <span className={p.hires_window > 0 ? 'text-emerald-700 font-semibold' : ''}>
                            {p.hires_window}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">{p.active_contracts}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{fmtUsd(p.revenue_window_usd)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{fmtUsd(p.revenue_all_time_usd)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{p.connects_balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'emerald' | 'blue'
}) {
  const accentCls =
    accent === 'emerald' ? 'text-emerald-700' : accent === 'blue' ? 'text-blue-700' : 'text-foreground'
  return (
    <div className="rounded-md border bg-background p-4">
      <div className={`text-2xl font-bold ${accentCls}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
    </div>
  )
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 10000) return `$${Math.round(n).toLocaleString()}`
  return `$${n.toFixed(2)}`
}

function RevenueBars({ rows }: { rows: Array<{ month: string; amount_usd: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.amount_usd))
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = (r.amount_usd / max) * 100
        return (
          <div key={r.month} className="flex items-center gap-3">
            <div className="text-xs font-mono text-muted-foreground min-w-[70px]">
              {monthLabel(r.month)}
            </div>
            <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden">
              <div className="h-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs tabular-nums min-w-[80px] text-right">
              {fmtUsd(r.amount_usd)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  if (!y || !m) return yyyymm
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}
