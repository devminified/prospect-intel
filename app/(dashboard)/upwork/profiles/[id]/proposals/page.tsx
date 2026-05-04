'use client'

import { use, useState } from 'react'
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
import { useProposalsForProfile, useUpdateProposal } from '@/lib/queries/upwork-jobs'
import { useUpworkProfile } from '@/lib/queries/upwork-profiles'
import type { UpworkProposalStatus } from '@/lib/types'

const STATUS_OPTIONS: Array<{ value: UpworkProposalStatus; label: string }> = [
  { value: 'drafted', label: 'Drafted' },
  { value: 'sent', label: 'Sent' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'Interview' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'hired', label: 'Hired' },
  { value: 'no_response', label: 'No response' },
]

const STATUS_BADGE: Record<UpworkProposalStatus, string> = {
  drafted: 'bg-secondary text-secondary-foreground',
  sent: 'bg-blue-100 text-blue-800',
  viewed: 'bg-sky-100 text-sky-800',
  shortlisted: 'bg-purple-100 text-purple-800',
  interview: 'bg-amber-100 text-amber-800',
  hired: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-800',
  withdrawn: 'bg-neutral-200 text-neutral-800',
  no_response: 'bg-secondary text-secondary-foreground',
}

export default function ProfileProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [statusFilter, setStatusFilter] = useState<string>('any')
  const profileQ = useUpworkProfile(id)
  const proposalsQ = useProposalsForProfile(id, statusFilter)
  const updateMut = useUpdateProposal()

  const profile = profileQ.data?.profile ?? null
  const proposals = proposalsQ.data ?? []
  const error = proposalsQ.error?.message ?? updateMut.error?.message ?? ''

  async function changeStatus(proposalId: string, status: UpworkProposalStatus) {
    try {
      await updateMut.mutateAsync({ id: proposalId, profileId: id, patch: { status } })
    } catch {
      // surfaced
    }
  }

  if (profileQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!profile) return <div className="text-muted-foreground">Not found.</div>

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/upwork/profiles/${profile.id}`} className="text-sm text-primary hover:underline">
          ← {profile.name}
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Proposals from {profile.name}</h1>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger size="sm" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
        <CardHeader>
          <CardTitle className="text-base">
            {proposalsQ.isLoading
              ? 'Loading…'
              : `${proposals.length} ${proposals.length === 1 ? 'proposal' : 'proposals'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {proposals.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No proposals yet from this profile.
              <Link href="/upwork/jobs" className="ml-1 text-primary hover:underline">
                Find a job to bid on →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="px-6 py-3">Job</th>
                  <th className="px-6 py-3">Bid</th>
                  <th className="px-6 py-3">Connects</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last update</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {proposals.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-3">
                      <Link href={`/upwork/jobs/${p.job_id}`} className="text-primary hover:underline">
                        View job
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      {p.bid_amount_usd != null
                        ? `$${p.bid_amount_usd}${p.bid_type === 'hourly' ? '/hr' : ''}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3">{p.connects_spent}</td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2">
                        <Badge className={STATUS_BADGE[p.status]}>{p.status}</Badge>
                        <Select value={p.status} onValueChange={(v) => v && changeStatus(p.id, v as UpworkProposalStatus)}>
                          <SelectTrigger size="sm" className="min-w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(p.status_changed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
