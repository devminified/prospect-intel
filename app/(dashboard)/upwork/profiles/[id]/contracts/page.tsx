'use client'

import { use, useState } from 'react'
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
import { useContracts, useCreateContract } from '@/lib/queries/upwork-contracts'
import { useUpworkProfile } from '@/lib/queries/upwork-profiles'
import type { UpworkContractStatus, UpworkContractType } from '@/lib/types'

const STATUS_BADGE: Record<UpworkContractStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  ended: 'bg-secondary text-secondary-foreground',
  disputed: 'bg-red-100 text-red-800',
}

export default function ProfileContractsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const profileQ = useUpworkProfile(id)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const contractsQ = useContracts(id, statusFilter)
  const createMut = useCreateContract()

  const profile = profileQ.data?.profile ?? null
  const canManage = profileQ.data?.can_manage ?? false
  const contracts = contractsQ.data ?? []
  const error = contractsQ.error?.message ?? createMut.error?.message ?? ''

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [contractType, setContractType] = useState<UpworkContractType>('hourly')
  const [agreedTotal, setAgreedTotal] = useState('')
  const [agreedRate, setAgreedRate] = useState('')
  const [upworkContractId, setUpworkContractId] = useState('')
  const [notes, setNotes] = useState('')

  if (profileQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!profile) return <div className="text-muted-foreground">Not found.</div>

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMut.mutateAsync({
        profile_id: id,
        title: title.trim(),
        contract_type: contractType,
        agreed_total_usd: agreedTotal === '' ? null : Number(agreedTotal),
        agreed_rate_usd: agreedRate === '' ? null : Number(agreedRate),
        upwork_contract_id: upworkContractId.trim() || null,
        notes: notes.trim() || null,
      })
      setShowForm(false)
      setTitle('')
      setContractType('hourly')
      setAgreedTotal('')
      setAgreedRate('')
      setUpworkContractId('')
      setNotes('')
    } catch {
      // surfaced
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/upwork/profiles/${profile.id}`} className="text-sm text-primary hover:underline">
          ← {profile.name}
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Contracts</h1>
          <div className="flex gap-2 items-center">
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
            {canManage && !showForm && (
              <Button onClick={() => setShowForm(true)}>+ New contract</Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record a new contract</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ct-title">Title</Label>
                  <Input id="ct-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme dashboard build" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ct-type">Contract type</Label>
                  <Select value={contractType} onValueChange={(v) => v && setContractType(v as UpworkContractType)}>
                    <SelectTrigger id="ct-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="fixed">Fixed price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {contractType === 'hourly' ? (
                  <div className="space-y-2">
                    <Label htmlFor="ct-rate">Hourly rate (USD)</Label>
                    <Input id="ct-rate" type="number" min={0} required value={agreedRate} onChange={(e) => setAgreedRate(e.target.value)} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="ct-total">Agreed total (USD)</Label>
                    <Input id="ct-total" type="number" min={0} value={agreedTotal} onChange={(e) => setAgreedTotal(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="ct-uw-id">Upwork contract id (optional)</Label>
                  <Input id="ct-uw-id" value={upworkContractId} onChange={(e) => setUpworkContractId(e.target.value)} placeholder="e.g. 12345678" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ct-notes">Notes</Label>
                  <textarea
                    id="ct-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Creating…' : 'Create contract'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {contractsQ.isLoading
              ? 'Loading…'
              : `${contracts.length} ${contracts.length === 1 ? 'contract' : 'contracts'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {contracts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No contracts in the {statusFilter === 'any' ? 'system' : statusFilter} state.
            </div>
          ) : (
            <div className="divide-y">
              {contracts.map((c) => (
                <Link
                  key={c.id}
                  href={`/upwork/contracts/${c.id}`}
                  className="block p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{c.title}</h3>
                        <Badge className={STATUS_BADGE[c.status]}>{c.status}</Badge>
                        <Badge variant="outline">{c.contract_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Started {new Date(c.started_at).toLocaleDateString()}
                        {c.ended_at && ` · ended ${new Date(c.ended_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {c.contract_type === 'hourly' && c.agreed_rate_usd != null && (
                        <div className="text-sm font-medium">${c.agreed_rate_usd}/hr</div>
                      )}
                      {c.contract_type === 'fixed' && c.agreed_total_usd != null && (
                        <div className="text-sm font-medium">${c.agreed_total_usd}</div>
                      )}
                    </div>
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
