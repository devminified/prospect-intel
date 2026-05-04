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
import { useBidderLeaderboard } from '@/lib/queries/upwork-analytics'

const WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '-1', label: 'All time' },
]

export default function UpworkLeaderboardPage() {
  const [windowDays, setWindowDays] = useState<number>(30)
  const leaderboardQ = useBidderLeaderboard(windowDays)

  const data = leaderboardQ.data
  const rows = data?.rows ?? []
  const error = leaderboardQ.error?.message ?? ''

  return (
    <div className="space-y-6">
      <div>
        <Link href="/upwork" className="text-sm text-primary hover:underline">
          ← Upwork overview
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bidder leaderboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Per-bidder activity across the profiles you can manage. Owner sees every profile;
              profile managers see only their own.
            </p>
          </div>
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
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">
            {leaderboardQ.isLoading ? 'Loading…' : `${rows.length} bidder${rows.length === 1 ? '' : 's'}`}
          </CardTitle>
          {data && (
            <span className="text-xs text-muted-foreground">
              Across {data.scoped_profile_ids.length} profile
              {data.scoped_profile_ids.length === 1 ? '' : 's'}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No bidder activity yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-6 py-3">Bidder</th>
                    <th className="px-6 py-3 text-right">Sent</th>
                    <th className="px-6 py-3 text-right">Replies</th>
                    <th className="px-6 py-3 text-right">Reply%</th>
                    <th className="px-6 py-3 text-right">Interviews</th>
                    <th className="px-6 py-3 text-right">Hires</th>
                    <th className="px-6 py-3 text-right">Hire%</th>
                    <th className="px-6 py-3 text-right">Connects</th>
                    <th className="px-6 py-3 text-right">Hours</th>
                    <th className="px-6 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span>
                            {r.email ?? <span className="text-muted-foreground italic">(unknown)</span>}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {r.profile_count} profile{r.profile_count === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{r.proposals_sent}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{r.replies}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {pct(r.reply_rate)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{r.interviews}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        <span className={r.hires > 0 ? 'text-emerald-700 font-semibold' : ''}>
                          {r.hires}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {pct(r.hire_rate)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{r.connects_spent}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{r.hours_logged}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {r.revenue_attributed_usd > 0 ? (
                          <span className="text-emerald-700 font-semibold">
                            ${r.revenue_attributed_usd.toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">$0</span>
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

function pct(rate: number): string {
  if (!Number.isFinite(rate)) return '—'
  return `${Math.round(rate * 100)}%`
}
