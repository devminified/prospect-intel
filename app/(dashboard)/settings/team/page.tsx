'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useChangeMemberRole,
  useCreateInvite,
  useCurrentTeam,
  useRemoveMember,
  useRenameTeam,
  useRevokeInvite,
} from '@/lib/queries/team'
import type {
  TeamMemberWithEmail as Member,
} from '@/lib/types'

const INVITE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'manager', label: 'Manager' },
  { value: 'lead_gen', label: 'Lead generator' },
  { value: 'cold_caller', label: 'Cold caller' },
  { value: 'closer', label: 'Closer' },
]

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  lead_gen: 'Lead generator',
  cold_caller: 'Cold caller',
  closer: 'Closer',
}

export default function TeamSettingsPage() {
  const teamQ = useCurrentTeam()
  const renameMut = useRenameTeam()
  const inviteMut = useCreateInvite()
  const revokeMut = useRevokeInvite()
  const roleMut = useChangeMemberRole()
  const removeMut = useRemoveMember()

  const data = teamQ.data ?? null

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('lead_gen')
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [lastRedeemUrl, setLastRedeemUrl] = useState<string | null>(null)
  const [copiedAt, setCopiedAt] = useState<string | null>(null)

  useEffect(() => {
    if (data) setNewName(data.team.name)
  }, [data])

  const error =
    renameMut.error?.message ??
    inviteMut.error?.message ??
    revokeMut.error?.message ??
    roleMut.error?.message ??
    removeMut.error?.message ??
    teamQ.error?.message ??
    ''

  async function rename() {
    try {
      await renameMut.mutateAsync({ name: newName.trim() })
      setEditingName(false)
    } catch {
      // surfaced via renameMut.error
    }
  }

  async function sendInvite() {
    setLastRedeemUrl(null)
    try {
      const json = await inviteMut.mutateAsync({ email: inviteEmail.trim(), role: inviteRole })
      setLastRedeemUrl(json.redeem_url ?? null)
      setInviteEmail('')
    } catch {
      // surfaced via inviteMut.error
    }
  }

  async function removeMember(member: Member) {
    if (
      !confirm(
        `Remove ${member.email ?? 'this member'} from the team?\n\nTheir email account (if connected) will be disconnected. Any leads they were assigned to will become Unassigned.`
      )
    )
      return
    try {
      await removeMut.mutateAsync(member.user_id)
    } catch {
      // surfaced via removeMut.error
    }
  }

  async function changeRole(member: Member, newRole: string) {
    try {
      await roleMut.mutateAsync({ userId: member.user_id, role: newRole })
    } catch {
      // surfaced via roleMut.error
    }
  }

  async function promoteToOwner(member: Member) {
    if (
      !confirm(
        `Promote ${member.email ?? 'this member'} to Owner?\n\nThey'll have full access — manage members, rename the team, disconnect Zoho, etc. Up to 2 owners are allowed.`
      )
    )
      return
    await changeRole(member, 'owner')
  }

  async function demoteOwner(member: Member) {
    const isSelf = member.is_self
    const msg = isSelf
      ? 'Step down to Manager? You will lose owner privileges. The other owner can promote you back.'
      : `Demote ${member.email ?? 'this owner'} to Manager? They will lose owner privileges.`
    if (!confirm(msg)) return
    await changeRole(member, 'manager')
  }

  async function revoke(inviteId: string) {
    if (!confirm('Revoke this invite? The recipient will no longer be able to redeem it.')) return
    try {
      await revokeMut.mutateAsync(inviteId)
    } catch {
      // surfaced via revokeMut.error
    }
  }

  function copy(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedAt(new Date().toLocaleTimeString())
    })
  }

  if (teamQ.isLoading) return <div className="text-muted-foreground">Loading team…</div>
  if (!data) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
        {error || 'No team found'}
      </div>
    )
  }

  const canInvite = data.my_role === 'owner' || data.my_role === 'manager'
  const isOwner = data.my_role === 'owner'
  const ownerCount = data.members.filter((m) => m.role === 'owner').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage members, invites, and roles for your team.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team name</CardTitle>
        </CardHeader>
        <CardContent>
          {editingName ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[260px]"
              />
              <Button size="sm" onClick={rename} disabled={renameMut.isPending || !newName.trim()}>
                {renameMut.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditingName(false); setNewName(data.team.name) }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-medium">{data.team.name}</span>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={() => setEditingName(true)}>
                  Rename
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-base">Members</CardTitle>
          <span className="text-xs text-muted-foreground">
            {data.members.length} {data.members.length === 1 ? 'member' : 'members'} · {ownerCount} of 2 owners
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
              {data.members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-6 py-3">
                    {m.email ?? <span className="text-muted-foreground italic">(unknown)</span>}
                    {m.is_self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-6 py-3">
                    <RoleChip role={m.role} />
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <MemberRowActions
                      member={m}
                      isOwner={isOwner}
                      ownerCount={ownerCount}
                      onChangeRole={changeRole}
                      onPromote={promoteToOwner}
                      onDemoteOwner={demoteOwner}
                      onRemove={removeMember}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[260px]"
              />
              <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                <SelectTrigger size="sm" className="min-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={sendInvite} disabled={inviteMut.isPending || !inviteEmail.trim()}>
                {inviteMut.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We email a magic link via Supabase. If your project email isn't configured, copy the redeem URL shown after creating the invite and share it manually.
            </p>
            {lastRedeemUrl && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                <div className="font-semibold">Invite created — share this URL:</div>
                <code className="block break-all text-xs bg-background rounded p-2">{lastRedeemUrl}</code>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copy(lastRedeemUrl)}>
                    Copy URL
                  </Button>
                  {copiedAt && <span className="text-xs text-muted-foreground self-center">copied at {copiedAt}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Expires</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.invites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-3">{inv.email}</td>
                    <td className="px-6 py-3"><RoleChip role={inv.role} /></td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {canInvite && (
                        <Button variant="ghost" size="sm" onClick={() => revoke(inv.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MemberRowActions({
  member: m,
  isOwner,
  ownerCount,
  onChangeRole,
  onPromote,
  onDemoteOwner,
  onRemove,
}: {
  member: Member
  isOwner: boolean
  ownerCount: number
  onChangeRole: (member: Member, role: string) => void
  onPromote: (member: Member) => void
  onDemoteOwner: (member: Member) => void
  onRemove: (member: Member) => void
}) {
  // Self-row when you're the only owner — nothing actionable.
  if (m.is_self && m.role === 'owner' && ownerCount <= 1) return null
  // Self-row, second owner exists → offer Step down.
  if (m.is_self && m.role === 'owner' && ownerCount >= 2) {
    return (
      <Button variant="ghost" size="sm" onClick={() => onDemoteOwner(m)}>
        Step down to manager
      </Button>
    )
  }
  // Anyone non-self / non-owner row only has actions if you're an owner.
  if (!isOwner) return null
  if (m.is_self) return null

  // Other-owner row: Demote (only if there are 2 owners) + Remove.
  if (m.role === 'owner') {
    return (
      <div className="inline-flex flex-wrap items-center justify-end gap-1">
        {ownerCount >= 2 && (
          <Button variant="ghost" size="sm" onClick={() => onDemoteOwner(m)}>
            Demote to manager
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onRemove(m)}>
          Remove
        </Button>
      </div>
    )
  }

  // Non-owner row: role select + promote (if room) + remove.
  const canPromote = ownerCount < 2
  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-1">
      <Select value={m.role} onValueChange={(v) => v && onChangeRole(m, v)}>
        <SelectTrigger size="sm" className="min-w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVITE_ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canPromote && (
        <Button variant="ghost" size="sm" onClick={() => onPromote(m)}>
          Promote to owner
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onRemove(m)}>
        Remove
      </Button>
    </div>
  )
}

function RoleChip({ role }: { role: string }) {
  const cls: Record<string, string> = {
    owner: 'bg-primary/10 text-primary',
    manager: 'bg-blue-100 text-blue-800',
    lead_gen: 'bg-purple-100 text-purple-800',
    cold_caller: 'bg-orange-100 text-orange-800',
    closer: 'bg-emerald-100 text-emerald-800',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${cls[role] ?? 'bg-secondary text-secondary-foreground'}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}
