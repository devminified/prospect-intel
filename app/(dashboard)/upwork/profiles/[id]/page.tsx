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
import type { UpworkProfileMemberWithEmail, UpworkProfileRole } from '@/lib/types'

export default function UpworkProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const detailQ = useUpworkProfile(id)
  const addableQ = useAddableMembers(id)
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

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/upwork/profiles/${profile.id}/proposals`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors flex-1 min-w-[200px]"
        >
          <div className="font-medium">Proposals →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Bids sent from this profile + status</p>
        </Link>
        <Link
          href={`/upwork/profiles/${profile.id}/connects`}
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors flex-1 min-w-[200px]"
        >
          <div className="font-medium">Connects ledger →</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {profile.connects_balance} Connects · purchases, spends, refunds
          </p>
        </Link>
        <Link
          href="/upwork/jobs"
          className="rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50 transition-colors flex-1 min-w-[200px]"
        >
          <div className="font-medium">Find a job →</div>
          <p className="text-xs text-muted-foreground mt-0.5">Browse team-saved jobs and bid</p>
        </Link>
      </div>

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
