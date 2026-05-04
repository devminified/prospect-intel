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
import { useConnectsLedger, useRecordConnectsEntry } from '@/lib/queries/upwork-jobs'
import { useUpworkProfile } from '@/lib/queries/upwork-profiles'
import type { UpworkConnectsEntryInput } from '@/lib/types'

const TYPE_BADGE: Record<string, string> = {
  purchase: 'bg-emerald-100 text-emerald-800',
  grant: 'bg-emerald-100 text-emerald-800',
  refund: 'bg-blue-100 text-blue-800',
  spend: 'bg-red-100 text-red-800',
  adjustment: 'bg-amber-100 text-amber-800',
}

export default function ProfileConnectsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const profileQ = useUpworkProfile(id)
  const ledgerQ = useConnectsLedger(id)
  const recordMut = useRecordConnectsEntry(id)

  const profile = profileQ.data?.profile ?? null
  const canManage = profileQ.data?.can_manage ?? false
  const entries = ledgerQ.data?.entries ?? []
  const error = ledgerQ.error?.message ?? recordMut.error?.message ?? ''

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<UpworkConnectsEntryInput['type']>('purchase')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'add' | 'subtract'>('add')
  const [notes, setNotes] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return
    try {
      await recordMut.mutateAsync({
        type,
        amount: n,
        direction: type === 'adjustment' ? direction : undefined,
        notes: notes.trim() || null,
      })
      setShowForm(false)
      setType('purchase')
      setAmount('')
      setDirection('add')
      setNotes('')
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
          <div>
            <h1 className="text-2xl font-bold">Connects ledger</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Current balance:{' '}
              <span className="font-semibold text-foreground">
                {profile.connects_balance} Connects
              </span>
            </p>
          </div>
          {canManage && !showForm && (
            <Button onClick={() => setShowForm(true)}>+ Log entry</Button>
          )}
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
            <CardTitle className="text-base">Log a Connects movement</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ce-type">Type</Label>
                  <Select value={type} onValueChange={(v) => v && setType(v as UpworkConnectsEntryInput['type'])}>
                    <SelectTrigger id="ce-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase (bought from Upwork)</SelectItem>
                      <SelectItem value="grant">Grant (free Connects from Upwork)</SelectItem>
                      <SelectItem value="refund">Refund (Upwork returned spent Connects)</SelectItem>
                      <SelectItem value="adjustment">Adjustment (manual reconcile)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Spends are logged automatically when you save a sent proposal — don't add them here.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ce-amount">Amount (positive integer)</Label>
                  <Input
                    id="ce-amount"
                    type="number"
                    min={1}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                {type === 'adjustment' && (
                  <div className="space-y-2">
                    <Label htmlFor="ce-direction">Direction</Label>
                    <Select value={direction} onValueChange={(v) => v && setDirection(v as 'add' | 'subtract')}>
                      <SelectTrigger id="ce-direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Add to balance</SelectItem>
                        <SelectItem value="subtract">Subtract from balance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ce-notes">Notes</Label>
                  <Input id="ce-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bought 80-Connect bundle" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={recordMut.isPending}>
                  {recordMut.isPending ? 'Saving…' : 'Log entry'}
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
            {ledgerQ.isLoading
              ? 'Loading…'
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No ledger entries yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="px-6 py-3">When</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3 text-right">Change</th>
                  <th className="px-6 py-3 text-right">Balance</th>
                  <th className="px-6 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <Badge className={TYPE_BADGE[e.type] ?? ''}>{e.type}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      <span
                        className={
                          e.signed_amount >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'
                        }
                      >
                        {e.signed_amount >= 0 ? '+' : ''}
                        {e.signed_amount}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{e.balance_after}</td>
                    <td className="px-6 py-3 text-muted-foreground">{e.notes ?? '—'}</td>
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
