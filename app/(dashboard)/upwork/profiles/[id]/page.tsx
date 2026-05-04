'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
  useAddProfileMember,
  useAddableMembers,
  useArchiveUpworkProfile,
  useChangeProfileMemberRole,
  useRemoveProfileMember,
  useUpdateUpworkProfile,
  useUpworkProfile,
} from '@/lib/queries/upwork-profiles'
import { useProfileDashboard } from '@/lib/queries/upwork-analytics'
import type { UpworkProfileMemberWithEmail, UpworkProfileRole } from '@/lib/types'

export default function UpworkProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const detailQ = useUpworkProfile(id)
  const addableQ = useAddableMembers(id)
  const [windowDays, setWindowDays] = useState<number>(30)
  const dashboardQ = useProfileDashboard(id, windowDays)
  const updateMut = useUpdateUpworkProfile(id)
  const archiveMut = useArchiveUpworkProfile()
  const addMut = useAddProfileMember(id)
  const roleMut = useChangeProfileMemberRole(id)
  const removeMut = useRemoveProfileMember(id)

  const detail = detailQ.data ?? null
  const profile = detail?.profile ?? null
  const members = detail?.members ?? []
  const addable = addableQ.data?.addable ?? []
  const canManage = !!detail?.can_manage

  const [addingUserId, setAddingUserId] = useState('')
  const [addingRole, setAddingRole] = useState<UpworkProfileRole>('bidder')

  const error =
    detailQ.error?.message ??
    updateMut.error?.message ??
    addMut.error?.message ??
    roleMut.error?.message ??
    removeMut.error?.message ??
    archiveMut.error?.message ??
    ''

  if (detailQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!profile) return <div className="text-muted-foreground">Not found.</div>

  async function add() {
    if (!addingUserId) return
    try {
      await addMut.mutateAsync({ user_id: addingUserId, role: addingRole })
      setAddingUserId('')
      setAddingRole('bidder')
    } catch {
      // surfaced via addMut.error
    }
  }

  async function changeRole(member: UpworkProfileMemberWithEmail, role: UpworkProfileRole) {
    try {
      await roleMut.mutateAsync({ userId: member.user_id, input: { role } })
    } catch {
      // surfaced via roleMut.error
    }
  }

  async function remove(member: UpworkProfileMemberWithEmail) {
    if (!confirm(`Remove ${member.email ?? 'this member'} from this profile?`)) return
    try {
      await removeMut.mutateAsync(member.user_id)
    } catch {
      // surfaced
    }
  }

  async function pause() {
    if (!profile) return
    try {
      await updateMut.mutateAsync({
        status: profile.status === 'paused' ? 'active' : 'paused',
      })
    } catch {
      // surfaced
    }
  }

  async function archive() {
    if (!profile) return
    if (!confirm(`Archive this profile? It will be hidden from the active list. This is reversible — re-activate by editing status.`)) return
    try {
      await archiveMut.mutateAsync(profile.id)
    } catch {
      // surfaced
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/upwork/profiles" className="text-sm text-primary hover:underline">
          ← All profiles
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                {profile.status}
              </Badge>
              <Badge variant="outline">{profile.account_type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              /{profile.slug}
              {profile.hourly_rate_usd != null && ` · $${profile.hourly_rate_usd}/hr`}
              {' · '}{profile.connects_balance} Connects
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={pause}>
                {profile.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              {profile.status !== 'archived' && (
                <Button variant="ghost" size="sm" onClick={archive}>
                  Archive
                </Button>
              )}
            </div>
          )}
        </div>
        {profile.description && (
          <p className="mt-3 text-sm text-muted-foreground max-w-3xl">{profile.description}</p>
        )}
        {profile.profile_url && (
          <a
            href={profile.profile_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Open on Upwork ↗
          </a>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Link
          href={`/upwork/profiles/${profile.id}/proposals`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium">Proposals →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Bids + status</p>
        </Link>
        <Link
          href={`/upwork/profiles/${profile.id}/conversations`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium">Conversations →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Threads with clients</p>
        </Link>
        <Link
          href={`/upwork/profiles/${profile.id}/contracts`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium">Contracts →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Active engagements</p>
        </Link>
        <Link
          href={`/upwork/profiles/${profile.id}/connects`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium">Connects ledger →</div>
          <p className="text-xs text-muted-foreground mt-0.5">{profile.connects_balance} Connects</p>
        </Link>
        <Link
          href="/upwork/jobs"
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium">Find a job →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Team-saved jobs</p>
        </Link>
      </div>

      <ProfileDashboardCard
        profileId={profile.id}
        windowDays={windowDays}
        setWindowDays={setWindowDays}
        loading={dashboardQ.isLoading}
        error={dashboardQ.error?.message}
        data={dashboardQ.data}
      />

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Members</CardTitle>
          <span className="text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-muted-foreground italic">
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.user_id}>
                    <td className="px-6 py-3">
                      {m.email ?? <span className="text-muted-foreground italic">(unknown)</span>}
                      {m.is_self && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={m.role === 'manager' ? 'default' : 'secondary'}>
                        {m.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(m.joined_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {canManage && (
                        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                          {m.role === 'bidder' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeRole(m, 'manager')}
                            >
                              Promote to manager
                            </Button>
                          )}
                          {m.role === 'manager' && !m.is_self && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeRole(m, 'bidder')}
                            >
                              Demote to bidder
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => remove(m)}>
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {addable.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Every team member is already on this profile. Invite a new
                team member via /settings/team first.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[260px] flex-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Team member
                  </span>
                  <Select value={addingUserId} onValueChange={(v) => v && setAddingUserId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick someone…" />
                    </SelectTrigger>
                    <SelectContent>
                      {addable.map((a) => (
                        <SelectItem key={a.user_id} value={a.user_id}>
                          {a.email ?? a.user_id.slice(0, 8)} ({a.team_role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Role</span>
                  <Select value={addingRole} onValueChange={(v) => v && setAddingRole(v as UpworkProfileRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bidder">Bidder</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={add} disabled={!addingUserId || addMut.isPending}>
                  {addMut.isPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '-1', label: 'All time' },
]

function ProfileDashboardCard({
  profileId,
  windowDays,
  setWindowDays,
  loading,
  error,
  data,
}: {
  profileId: string
  windowDays: number
  setWindowDays: (n: number) => void
  loading: boolean
  error?: string
  data: import('@/lib/types').UpworkProfileDashboard | undefined
}) {
  const f = data?.funnel
  const c = data?.connects
  const r = data?.revenue
  const k = data?.contracts

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Dashboard</CardTitle>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground italic">No data.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Sent" value={f?.proposals_sent ?? 0} />
              <Stat label="Replies" value={f ? (f.proposals_viewed + f.proposals_shortlisted + f.proposals_interview + f.proposals_hired + f.proposals_declined) : 0} />
              <Stat label="Hires" value={f?.proposals_hired ?? 0} accent="emerald" />
              <Stat label="Spend / hire" value={c?.spend_per_hire != null ? `${c.spend_per_hire} Connects` : '—'} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Funnel</div>
              <div className="space-y-1">
                <FunnelBar label="Sent" count={f?.proposals_sent ?? 0} max={f?.proposals_sent ?? 1} />
                <FunnelBar label="Viewed" count={f?.proposals_viewed ?? 0} max={f?.proposals_sent ?? 1} />
                <FunnelBar label="Shortlisted" count={f?.proposals_shortlisted ?? 0} max={f?.proposals_sent ?? 1} />
                <FunnelBar label="Interview" count={f?.proposals_interview ?? 0} max={f?.proposals_sent ?? 1} accent="amber" />
                <FunnelBar label="Hired" count={f?.proposals_hired ?? 0} max={f?.proposals_sent ?? 1} accent="emerald" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Connects</div>
                <p className="mt-1 text-2xl font-bold">{c?.current_balance ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  Purchased {c?.total_purchased ?? 0} · Spent {c?.total_spent ?? 0} · Refunded {c?.total_refunded ?? 0}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Contracts</div>
                <p className="mt-1 text-2xl font-bold">
                  {k?.active ?? 0}{' '}
                  <span className="text-xs font-normal text-muted-foreground">active</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {k?.paused ?? 0} paused · {k?.ended ?? 0} ended · {k?.disputed ?? 0} disputed
                </p>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Revenue</div>
                <p className="mt-1 text-2xl font-bold">${(r?.paid_total_usd ?? 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  + ${(r?.pending_total_usd ?? 0).toFixed(2)} pending (logged / billed / scoped)
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Per profile, all-time. Visit{' '}
                  <Link href="/upwork" className="text-primary hover:underline">/upwork</Link> for the
                  cross-profile time-series.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'emerald'
}) {
  const accentCls = accent === 'emerald' ? 'text-emerald-700' : 'text-foreground'
  return (
    <div className="rounded-md border bg-background p-3">
      <div className={`text-xl font-bold ${accentCls}`}>{value}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
    </div>
  )
}

function FunnelBar({
  label,
  count,
  max,
  accent,
}: {
  label: string
  count: number
  max: number
  accent?: 'amber' | 'emerald'
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const fill =
    accent === 'amber' ? 'bg-amber-500/70' : accent === 'emerald' ? 'bg-emerald-500/70' : 'bg-blue-500/60'
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-mono text-muted-foreground min-w-[90px]">{label}</div>
      <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs tabular-nums min-w-[40px] text-right">{count}</div>
    </div>
  )
}
