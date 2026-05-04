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
  useAppendMessage,
  useConversation,
  useUpdateConversation,
} from '@/lib/queries/upwork-conversations'
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

export default function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const detailQ = useConversation(id)
  const conversation = detailQ.data?.conversation ?? null
  const messages = detailQ.data?.messages ?? []
  const updateMut = useUpdateConversation(id, conversation?.profile_id ?? '')
  const appendMut = useAppendMessage(id, conversation?.profile_id ?? '')

  const [direction, setDirection] = useState<'sent' | 'received'>('received')
  const [body, setBody] = useState('')

  const error =
    detailQ.error?.message ??
    updateMut.error?.message ??
    appendMut.error?.message ??
    ''

  if (detailQ.isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!conversation) return <div className="text-muted-foreground">Not found.</div>

  async function changeStatus(status: UpworkConversationStatus) {
    try {
      await updateMut.mutateAsync({ status })
    } catch {
      // surfaced
    }
  }

  async function appendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    try {
      await appendMut.mutateAsync({ direction, body, occurred_at: null })
      setBody('')
    } catch {
      // surfaced
    }
  }

  async function toggleNeedsReply() {
    if (!conversation) return
    try {
      await updateMut.mutateAsync({ needs_reply: !conversation.needs_reply })
    } catch {
      // surfaced
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/upwork/profiles/${conversation.profile_id}/conversations`}
          className="text-sm text-primary hover:underline"
        >
          ← Conversations
        </Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{conversation.title ?? '(no title)'}</h1>
          <div className="flex items-center gap-2">
            {conversation.needs_reply && (
              <Badge className="bg-amber-100 text-amber-800">needs reply</Badge>
            )}
            <Select value={conversation.status} onValueChange={(v) => v && changeStatus(v as UpworkConversationStatus)}>
              <SelectTrigger size="sm" className="min-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={toggleNeedsReply}>
              {conversation.needs_reply ? 'Mark replied' : 'Flag needs reply'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thread</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`p-3 rounded-md ${
                    m.direction === 'sent' ? 'bg-primary/5 border-l-4 border-primary' : 'bg-muted/40 border-l-4 border-muted-foreground/30'
                  }`}
                >
                  <div className="text-xs uppercase font-semibold text-muted-foreground mb-1">
                    {m.direction === 'sent' ? 'Sent' : 'Received'} · {new Date(m.occurred_at).toLocaleString()}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={appendMessage} className="border-t pt-4 space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Append:</label>
              <Select value={direction} onValueChange={(v) => v && setDirection(v as 'sent' | 'received')}>
                <SelectTrigger size="sm" className="min-w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Client message</SelectItem>
                  <SelectItem value="sent">Our reply</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={direction === 'received' ? "Paste the client's message…" : 'Paste your reply…'}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button type="submit" disabled={appendMut.isPending || !body.trim()}>
              {appendMut.isPending ? 'Saving…' : 'Append message'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {conversation.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{conversation.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
