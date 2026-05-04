'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateProposal,
  useUpdateProposal,
  useUpworkJob,
} from '@/lib/queries/upwork-jobs'
import { useUpworkProfiles } from '@/lib/queries/upwork-profiles'
import type { UpworkBidType, UpworkProposalStatus } from '@/lib/types'

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

export default function UpworkJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const detailQ = useUpworkJob(id)
  const profilesQ = useUpworkProfiles()
  const createMut = useCreateProposal()
  const updateMut = useUpdateProposal()

  const job = detailQ.data?.job ?? null
  const proposals = detailQ.data?.proposals ?? []
  const profiles = profilesQ.data ?? []

  // Profiles that haven't bid yet — those are "biddable".
  const profileIdsWithBids = useMemo(
    () => new Set(proposals.map((p) => p.profile_id)),
    [proposals]
  )
  const biddableProfiles = profiles.filter((p) => !profileIdsWithBids.has(p.id) && p.status === 'active')

  const [bidProfileId, setBidProfileId] = useState('')
  const [bidType, setBidType] = useState<UpworkBidType>('fixed')
  const [bidAmount, setBidAmount] = useState('')
  const [connectsSpent, setConnectsSpent] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [statusOnSubmit, setStatusOnSubmit] = useState<UpworkProposalStatus>('sent')
  const [showBidForm, setShowBidForm] = useState(false)

  const error =
    detailQ.error?.message ??
    createMut.error?.message ??
    updateMut.error?.message ??
    ''

  if (detailQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!job) return <div className="text-muted-foreground">Not found.</div>

  async function submitBid(e: React.FormEvent) {
    e.preventDefault()
    if (!bidProfileId) return
    try {
      await createMut.mutateAsync({
        profile_id: bidProfileId,
        job_id: id,
        bid_type: bidType,
        bid_amount_usd: bidAmount === '' ? null : Number(bidAmount),
        connects_spent: connectsSpent === '' ? 0 : Number(connectsSpent),
        cover_letter: coverLetter.trim() || null,
        status: statusOnSubmit,
      })
      setShowBidForm(false)
      setBidProfileId('')
      setBidType('fixed')
      setBidAmount('')
      setConnectsSpent('')
      setCoverLetter('')
      setStatusOnSubmit('sent')
    } catch {
      // surfaced via createMut.error
    }
  }

  async function changeStatus(p: { id: string; profile_id: string }, status: UpworkProposalStatus) {
    try {
      await updateMut.mutateAsync({ id: p.id, profileId: p.profile_id, patch: { status } })
    } catch {
      // surfaced
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/upwork/jobs" className="text-sm text-primary hover:underline">
          ← All jobs
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Badge variant="outline" className="mr-2">{job.status}</Badge>
              <Badge variant="outline" className="mr-2">{job.budget_type}</Badge>
              {job.skills.length > 0 && job.skills.slice(0, 6).join(', ')}
            </p>
          </div>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline shrink-0"
          >
            Open on Upwork ↗
          </a>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {job.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{job.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Proposals from your team</CardTitle>
          {biddableProfiles.length > 0 && !showBidForm && (
            <Button size="sm" onClick={() => setShowBidForm(true)}>
              + Send a bid
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {showBidForm && (
            <form onSubmit={submitBid} className="border-b p-5 space-y-4 bg-muted/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bid-profile">Bidding from profile</Label>
                  <Select value={bidProfileId} onValueChange={(v) => v && setBidProfileId(v)}>
                    <SelectTrigger id="bid-profile">
                      <SelectValue placeholder="Pick a profile…" />
                    </SelectTrigger>
                    <SelectContent>
                      {biddableProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.connects_balance} Connects)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only profiles you're a member of (and haven't bid yet) appear here.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bid-status">Status on save</Label>
                  <Select value={statusOnSubmit} onValueChange={(v) => v && setStatusOnSubmit(v as UpworkProposalStatus)}>
                    <SelectTrigger id="bid-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drafted">Drafted (no Connects spent yet)</SelectItem>
                      <SelectItem value="sent">Sent (logs Connects spend)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bid-type">Bid type</Label>
                  <Select value={bidType} onValueChange={(v) => v && setBidType(v as UpworkBidType)}>
                    <SelectTrigger id="bid-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed price</SelectItem>
                      <SelectItem value="hourly">Hourly rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bid-amount">{bidType === 'fixed' ? 'Bid total (USD)' : 'Hourly rate ($/hr)'}</Label>
                  <Input
                    id="bid-amount"
                    type="number"
                    min={0}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    required={statusOnSubmit === 'sent'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bid-connects">Connects spent</Label>
                  <Input
                    id="bid-connects"
                    type="number"
                    min={0}
                    placeholder="e.g. 6"
                    value={connectsSpent}
                    onChange={(e) => setConnectsSpent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Logged automatically against the profile's Connects ledger when status is "Sent".
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bid-cover">Cover letter</Label>
                  <textarea
                    id="bid-cover"
                    rows={6}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Paste the cover letter you sent on Upwork (or your draft)."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!bidProfileId || createMut.isPending}>
                  {createMut.isPending ? 'Saving…' : 'Save proposal'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowBidForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {proposals.length === 0 && !showBidForm ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No proposals on this job yet.
              {biddableProfiles.length === 0 && ' You need access to at least one Upwork profile to bid.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="px-6 py-3">Profile</th>
                  <th className="px-6 py-3">Bid</th>
                  <th className="px-6 py-3">Connects</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {proposals.map((p) => {
                  const profile = profiles.find((pr) => pr.id === p.profile_id)
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3">{profile?.name ?? '—'}</td>
                      <td className="px-6 py-3">
                        {p.bid_amount_usd != null
                          ? `$${p.bid_amount_usd}${p.bid_type === 'hourly' ? '/hr' : ''}`
                          : '—'}
                      </td>
                      <td className="px-6 py-3">{p.connects_spent}</td>
                      <td className="px-6 py-3">
                        <Select value={p.status} onValueChange={(v) => v && changeStatus(p, v as UpworkProposalStatus)}>
                          <SelectTrigger size="sm" className="min-w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {p.sent_at ? new Date(p.sent_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
