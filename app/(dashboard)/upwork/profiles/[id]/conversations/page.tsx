'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConversations, useCreateConversation } from '@/lib/queries/upwork-conversations'
import { useUpworkProfile } from '@/lib/queries/upwork-profiles'
import type { UpworkConversationStatus } from '@/lib/types'

const STATUS_OPTIONS: Array<{ value: UpworkConversationStatus; label: string }> = [
  { value: 'waiting_reply', label: 'Waiting reply' },
  { value: 'replying', label: 'Replying' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'closed_won', label: 'Closed won' },
  { value: 'closed_lost', label: 'Closed lost' },
  { value: 'stale', label: 'Stale' },
]

const STATUS_BADGE: Record<UpworkConversationStatus, string> = {
  waiting_reply: 'bg-secondary text-secondary-foreground',
  replying: 'bg-blue-100 text-blue-800',
  interviewing: 'bg-amber-100 text-amber-800',
  negotiating: 'bg-purple-100 text-purple-800',
  closed_won: 'bg-emerald-100 text-emerald-800',
  closed_lost: 'bg-red-100 text-red-800',
  stale: 'bg-neutral-200 text-neutral-800',
}

export default function ProfileConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const profileQ = useUpworkProfile(id)
  const [statusFilter, setStatusFilter] = useState<string>('any')
  const conversationsQ = useConversations(id, statusFilter)
  const createMut = useCreateConversation()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const profile = profileQ.data?.profile ?? null
  const conversations = conversationsQ.data ?? []
  const error = conversationsQ.error?.message ?? createMut.error?.message ?? ''

  if (profileQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!profile) return <div className="text-muted-foreground">Not found.</div>

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMut.mutateAsync({
        profile_id: id,
        title: title.trim() || null,
        notes: notes.trim() || null,
        status: 'replying',
      })
      setShowForm(false)
      setTitle('')
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
          <h1 className="text-2xl font-bold">Conversations</h1>
          <div className="flex gap-2 items-center">
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger size="sm" className="min-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!showForm && <Button onClick={() => setShowForm(true)}>+ Start a thread</Button>}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a manual conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="conv-title">Title (optional)</label>
                <input
                  id="conv-title"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Acme Corp — analytics dashboard"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use this when a client DMs you directly without a prior proposal.
                  Otherwise convert from the proposal page.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="conv-notes">Notes</label>
                <textarea
                  id="conv-notes"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Saving…' : 'Create'}
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
            {conversationsQ.isLoading
              ? 'Loading…'
              : `${conversations.length} ${conversations.length === 1 ? 'conversation' : 'conversations'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations on this profile yet.
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/upwork/conversations/${c.id}`}
                  className="block p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{c.title ?? '(no title)'}</h3>
                        <Badge className={STATUS_BADGE[c.status]}>{c.status}</Badge>
                        {c.needs_reply && (
                          <Badge className="bg-amber-100 text-amber-800">needs reply</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.last_message_at
                          ? `Last ${c.last_message_from === 'us' ? 'we sent' : 'they sent'} ${new Date(c.last_message_at).toLocaleString()}`
                          : `Started ${new Date(c.created_at).toLocaleDateString()}`}
                      </p>
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
