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
import {
  useAddMilestone,
  useChangeTimeLogStatus,
  useContract,
  useDeleteMilestone,
  useDeleteTimeLog,
  useLogHours,
  useUpdateContract,
  useUpdateMilestone,
} from '@/lib/queries/upwork-contracts'
import type {
  UpworkContractStatus,
  UpworkMilestone,
  UpworkMilestoneStatus,
  UpworkTimeLog,
  UpworkTimeLogStatus,
} from '@/lib/types'

const MILESTONE_STATUSES: Array<{ value: UpworkMilestoneStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'funded', label: 'Funded' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'refunded', label: 'Refunded' },
]

const TIME_LOG_STATUSES: Array<{ value: UpworkTimeLogStatus; label: string }> = [
  { value: 'logged', label: 'Logged' },
  { value: 'billed', label: 'Billed' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
]

const CONTRACT_STATUS_BADGE: Record<UpworkContractStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  ended: 'bg-secondary text-secondary-foreground',
  disputed: 'bg-red-100 text-red-800',
}

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const detailQ = useContract(id)
  const contract = detailQ.data?.contract ?? null
  const milestones = detailQ.data?.milestones ?? []
  const timeLogs = detailQ.data?.time_logs ?? []
  const canManage = detailQ.data?.can_manage ?? false

  const updateContractMut = useUpdateContract(id, contract?.profile_id ?? '')
  const addMilestoneMut = useAddMilestone(id)
  const updateMilestoneMut = useUpdateMilestone(id)
  const deleteMilestoneMut = useDeleteMilestone(id)
  const logHoursMut = useLogHours(id)
  const changeTimeLogStatusMut = useChangeTimeLogStatus(id)
  const deleteTimeLogMut = useDeleteTimeLog(id)

  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [msName, setMsName] = useState('')
  const [msAmount, setMsAmount] = useState('')
  const [msDueAt, setMsDueAt] = useState('')

  const [showLogForm, setShowLogForm] = useState(false)
  const [logWeek, setLogWeek] = useState(mondayOfTodayIso())
  const [logHours, setLogHours] = useState('')
  const [logRate, setLogRate] = useState('')
  const [logNotes, setLogNotes] = useState('')

  const error =
    detailQ.error?.message ??
    updateContractMut.error?.message ??
    addMilestoneMut.error?.message ??
    updateMilestoneMut.error?.message ??
    deleteMilestoneMut.error?.message ??
    logHoursMut.error?.message ??
    changeTimeLogStatusMut.error?.message ??
    deleteTimeLogMut.error?.message ??
    ''

  if (detailQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!contract) return <div className="text-muted-foreground">Not found.</div>

  async function changeContractStatus(status: UpworkContractStatus) {
    try {
      await updateContractMut.mutateAsync({ status })
    } catch {
      // surfaced
    }
  }

  async function submitMilestone(e: React.FormEvent) {
    e.preventDefault()
    try {
      await addMilestoneMut.mutateAsync({
        name: msName.trim(),
        amount_usd: Number(msAmount),
        due_at: msDueAt || null,
      })
      setShowMilestoneForm(false)
      setMsName('')
      setMsAmount('')
      setMsDueAt('')
    } catch {
      // surfaced
    }
  }

  async function changeMilestoneStatus(m: UpworkMilestone, status: UpworkMilestoneStatus) {
    try {
      await updateMilestoneMut.mutateAsync({ id: m.id, patch: { status } })
    } catch {
      // surfaced
    }
  }

  async function removeMilestone(m: UpworkMilestone) {
    if (!confirm(`Delete milestone "${m.name}"? Only pending milestones can be deleted.`)) return
    try {
      await deleteMilestoneMut.mutateAsync(m.id)
    } catch {
      // surfaced
    }
  }

  async function submitLog(e: React.FormEvent) {
    e.preventDefault()
    try {
      await logHoursMut.mutateAsync({
        week_starting: logWeek,
        hours: Number(logHours),
        hourly_rate_usd: logRate === '' ? null : Number(logRate),
        notes: logNotes.trim() || null,
      })
      setShowLogForm(false)
      setLogHours('')
      setLogRate('')
      setLogNotes('')
    } catch {
      // surfaced
    }
  }

  async function changeLogStatus(t: UpworkTimeLog, status: UpworkTimeLogStatus) {
    try {
      await changeTimeLogStatusMut.mutateAsync({ id: t.id, input: { status } })
    } catch {
      // surfaced
    }
  }

  async function removeLog(t: UpworkTimeLog) {
    if (!confirm(`Delete time log for week of ${t.week_starting}?`)) return
    try {
      await deleteTimeLogMut.mutateAsync(t.id)
    } catch {
      // surfaced
    }
  }

  const milestoneTotal = milestones.reduce((sum, m) => sum + Number(m.amount_usd), 0)
  const milestonePaid = milestones.filter((m) => m.status === 'paid').reduce((sum, m) => sum + Number(m.amount_usd), 0)
  const timeLogTotalAmount = timeLogs.reduce((sum, t) => sum + Number(t.amount_usd), 0)
  const timeLogPaidAmount = timeLogs.filter((t) => t.status === 'paid').reduce((sum, t) => sum + Number(t.amount_usd), 0)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/upwork/profiles/${contract.profile_id}/contracts`}
          className="text-sm text-primary hover:underline"
        >
          ← Contracts
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{contract.title}</h1>
              <Badge className={CONTRACT_STATUS_BADGE[contract.status]}>{contract.status}</Badge>
              <Badge variant="outline">{contract.contract_type}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {contract.contract_type === 'hourly' && contract.agreed_rate_usd != null && `$${contract.agreed_rate_usd}/hr · `}
              {contract.contract_type === 'fixed' && contract.agreed_total_usd != null && `$${contract.agreed_total_usd} total · `}
              Started {new Date(contract.started_at).toLocaleDateString()}
              {contract.upwork_contract_id && ` · #${contract.upwork_contract_id}`}
            </p>
          </div>
          {canManage && (
            <Select value={contract.status} onValueChange={(v) => v && changeContractStatus(v as UpworkContractStatus)}>
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {contract.contract_type === 'fixed' ? (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Milestones</CardTitle>
            <span className="text-xs text-muted-foreground">
              ${milestonePaid.toFixed(2)} paid of ${milestoneTotal.toFixed(2)} planned
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {showMilestoneForm && canManage && (
              <form onSubmit={submitMilestone} className="border-b p-5 space-y-4 bg-muted/20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="ms-name">Name</Label>
                    <Input id="ms-name" required value={msName} onChange={(e) => setMsName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ms-amount">Amount (USD)</Label>
                    <Input id="ms-amount" type="number" min={0} required value={msAmount} onChange={(e) => setMsAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ms-due">Due (optional)</Label>
                    <Input id="ms-due" type="date" value={msDueAt} onChange={(e) => setMsDueAt(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={addMilestoneMut.isPending}>
                    {addMilestoneMut.isPending ? 'Adding…' : 'Add milestone'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowMilestoneForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {!showMilestoneForm && canManage && (
              <div className="border-b p-3">
                <Button size="sm" onClick={() => setShowMilestoneForm(true)}>+ Add milestone</Button>
              </div>
            )}
            {milestones.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No milestones yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-6 py-3 w-10">#</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Due</th>
                    {canManage && <th className="px-6 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {milestones.map((m) => (
                    <tr key={m.id}>
                      <td className="px-6 py-3 text-muted-foreground">{m.sequence}</td>
                      <td className="px-6 py-3">{m.name}</td>
                      <td className="px-6 py-3 text-right tabular-nums">${m.amount_usd}</td>
                      <td className="px-6 py-3">
                        {canManage ? (
                          <Select value={m.status} onValueChange={(v) => v && changeMilestoneStatus(m, v as UpworkMilestoneStatus)}>
                            <SelectTrigger size="sm" className="min-w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MILESTONE_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{m.status}</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {m.due_at ? new Date(m.due_at).toLocaleDateString() : '—'}
                      </td>
                      {canManage && (
                        <td className="px-6 py-3 text-right">
                          {m.status === 'pending' && (
                            <Button variant="ghost" size="sm" onClick={() => removeMilestone(m)}>Delete</Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="text-base">Time logs</CardTitle>
            <span className="text-xs text-muted-foreground">
              ${timeLogPaidAmount.toFixed(2)} paid · ${timeLogTotalAmount.toFixed(2)} logged
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {showLogForm && (
              <form onSubmit={submitLog} className="border-b p-5 space-y-4 bg-muted/20">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tl-week">Week starting</Label>
                    <Input id="tl-week" type="date" required value={logWeek} onChange={(e) => setLogWeek(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Auto-snaps to Monday on save.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-hours">Hours</Label>
                    <Input id="tl-hours" type="number" min={0} step="0.25" required value={logHours} onChange={(e) => setLogHours(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-rate">Rate (USD/hr)</Label>
                    <Input
                      id="tl-rate"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={contract.agreed_rate_usd != null ? String(contract.agreed_rate_usd) : ''}
                      value={logRate}
                      onChange={(e) => setLogRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Defaults to the contract rate.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-notes">Notes</Label>
                    <Input id="tl-notes" value={logNotes} onChange={(e) => setLogNotes(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={logHoursMut.isPending}>
                    {logHoursMut.isPending ? 'Saving…' : 'Log hours'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowLogForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {!showLogForm && (
              <div className="border-b p-3">
                <Button size="sm" onClick={() => setShowLogForm(true)}>+ Log hours</Button>
              </div>
            )}
            {timeLogs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hours logged yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-6 py-3">Week</th>
                    <th className="px-6 py-3 text-right">Hours</th>
                    <th className="px-6 py-3 text-right">Rate</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Notes</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {timeLogs.map((t) => (
                    <tr key={t.id}>
                      <td className="px-6 py-3">
                        {new Date(`${t.week_starting}T00:00:00`).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{t.hours}</td>
                      <td className="px-6 py-3 text-right tabular-nums">${t.hourly_rate_usd}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">${t.amount_usd}</td>
                      <td className="px-6 py-3">
                        {canManage ? (
                          <Select value={t.status} onValueChange={(v) => v && changeLogStatus(t, v as UpworkTimeLogStatus)}>
                            <SelectTrigger size="sm" className="min-w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TIME_LOG_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{t.status}</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{t.notes ?? '—'}</td>
                      <td className="px-6 py-3 text-right">
                        {t.status === 'logged' && (
                          <Button variant="ghost" size="sm" onClick={() => removeLog(t)}>
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {contract.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function mondayOfTodayIso(): string {
  const d = new Date()
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
