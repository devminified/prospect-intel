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
import { authHeaders } from '@/lib/auth-headers'

interface Member {
  user_id: string
  role: string
  joined_at: string
  email: string | null
  is_self: boolean
}

interface Invite {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
}

interface TeamData {
  team: { id: string; name: string; created_at: string }
  members: Member[]
  invites: Invite[]
  my_role: string | null
}

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
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('lead_gen')
  const [inviting, setInviting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [lastRedeemUrl, setLastRedeemUrl] = useState<string | null>(null)
  const [copiedAt, setCopiedAt] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/team', { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'team load failed' }))
        throw new Error(err.error ?? 'team load failed')
      }
      const json = (await res.json()) as TeamData
      setData(json)
      setNewName(json.team.name)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function rename() {
    setRenaming(true)
    setError('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'rename failed' }))
        throw new Error(err.error ?? 'rename failed')
      }
      setEditingName(false)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRenaming(false)
    }
  }

  async function sendInvite() {
    setInviting(true)
    setError('')
    setLastRedeemUrl(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch('/api/team/invites', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'invite failed' }))
        throw new Error(err.error ?? 'invite failed')
      }
      const json = await res.json()
      setLastRedeemUrl(json.redeem_url ?? null)
      setInviteEmail('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setInviting(false)
    }
  }

  async function revoke(inviteId: string) {
    if (!confirm('Revoke this invite? The recipient will no longer be able to redeem it.')) return
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/team/invites?id=${inviteId}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'revoke failed' }))
        throw new Error(err.error ?? 'revoke failed')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedAt(new Date().toLocaleTimeString())
    })
  }

  if (loading) return <div className="text-muted-foreground">Loading team…</div>
  if (!data) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
        {error || 'No team found'}
      </div>
    )
  }

  const canInvite = data.my_role === 'owner' || data.my_role === 'manager'
  const isOwner = data.my_role === 'owner'

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
              <Button size="sm" onClick={rename} disabled={renaming || !newName.trim()}>
                {renaming ? 'Saving…' : 'Save'}
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
            {data.members.length} {data.members.length === 1 ? 'member' : 'members'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Joined</th>
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
              <Button size="sm" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? 'Sending…' : 'Send invite'}
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
