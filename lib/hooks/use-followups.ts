'use client'

import { useState } from 'react'
import { authHeaders } from '@/lib/auth-headers'
import { buildIcsEvent, downloadIcs } from '@/lib/ics'

export interface Followup {
  id: string
  due_at: string
  note: string | null
  done: boolean
  done_at: string | null
  created_at: string
}

interface ProspectContext {
  id: string
  name: string
  website: string | null
}

/**
 * Owns local state for the Follow-ups card on a prospect detail page:
 * the new-followup form (datetime + note), per-row pending toggle, and
 * the ICS download trigger.
 *
 * Toggle done is OPTIMISTIC — it flips the local list immediately so
 * the checkbox feels snappy, then reverts on PATCH failure. The optimistic
 * state lives on the parent's followup list, so the hook accepts an
 * `applyOptimistic` callback for the parent to mutate its own state.
 */
export function useFollowups(
  prospect: ProspectContext,
  onChange: () => void,
  applyOptimistic?: (mutator: (list: Followup[]) => Followup[]) => void
) {
  const [newAt, setNewAt] = useState('')
  const [newNote, setNewNote] = useState('')
  const [pending, setPending] = useState<'add' | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!newAt) {
      setError('Pick a date and time first')
      return
    }
    const dueAt = new Date(newAt)
    if (Number.isNaN(dueAt.getTime())) {
      setError('Invalid date')
      return
    }
    setPending('add')
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospect.id}/followups`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ due_at: dueAt.toISOString(), note: newNote.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'add follow-up failed' }))
        throw new Error(err.error ?? 'add follow-up failed')
      }
      setNewAt('')
      setNewNote('')
      onChange()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(null)
    }
  }

  async function toggleDone(f: Followup) {
    if (applyOptimistic) {
      applyOptimistic((list) =>
        list.map((x) =>
          x.id === f.id ? { ...x, done: !f.done, done_at: !f.done ? new Date().toISOString() : null } : x
        )
      )
    }
    setPendingId(f.id)
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospect.id}/followups/${f.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ done: !f.done }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'toggle failed' }))
        throw new Error(err.error ?? 'toggle failed')
      }
      onChange()
    } catch (e: any) {
      // Revert optimistic update.
      if (applyOptimistic) {
        applyOptimistic((list) => list.map((x) => (x.id === f.id ? f : x)))
      }
      setError(e.message)
    } finally {
      setPendingId(null)
    }
  }

  async function remove(fid: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this follow-up? This cannot be undone.')) return
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospect.id}/followups/${fid}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'delete failed' }))
        throw new Error(err.error ?? 'delete failed')
      }
      onChange()
    } catch (e: any) {
      setError(e.message)
    }
  }

  function downloadCalendar(f: Followup) {
    const due = new Date(f.due_at)
    if (Number.isNaN(due.getTime())) return
    const summary = `Follow up: ${prospect.name}`
    const description = [
      f.note ?? '',
      '',
      `Prospect: ${prospect.name}`,
      prospect.website ? `Website: ${prospect.website}` : '',
      typeof window !== 'undefined' ? `Open in app: ${window.location.origin}/prospects/${prospect.id}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const url =
      typeof window !== 'undefined' ? `${window.location.origin}/prospects/${prospect.id}` : undefined
    const ics = buildIcsEvent({
      uid: f.id,
      startUtc: due,
      durationMinutes: 30,
      summary,
      description,
      url,
    })
    const slug =
      prospect.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'prospect'
    downloadIcs(ics, `followup-${slug}-${f.id.slice(0, 8)}.ics`)
  }

  return {
    newAt,
    setNewAt,
    newNote,
    setNewNote,
    pending,
    pendingId,
    error,
    add,
    toggleDone,
    remove,
    downloadCalendar,
  }
}
