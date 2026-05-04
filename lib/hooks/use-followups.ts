'use client'

import { useState } from 'react'
import {
  useAddFollowup,
  useToggleFollowupDone,
  useDeleteFollowup,
} from '@/lib/queries/followups'
import { buildIcsEvent, downloadIcs } from '@/lib/ics'
import type { Followup } from '@/lib/types'

export type { Followup }

interface ProspectContext {
  id: string
  name: string
  website: string | null
}

/**
 * Owns local form state for the Follow-ups card. Internally delegates to
 * TanStack mutations from lib/queries/followups so:
 *   - request/parse/error logic is centralized in lib/api-client.ts
 *   - cache invalidation runs (queryKeys.followups / queryKeys.prospectActivity)
 *   - toggle-done's optimistic flip + rollback come from useToggleFollowupDone
 *
 * The legacy `applyOptimistic` callback is no longer needed (TanStack
 * handles cache rollback) but remains accepted for backward-compat with
 * the prospect detail page until M64. ICS download stays here since it's
 * a pure client-side transform, not a network call.
 */
export function useFollowups(
  prospect: ProspectContext,
  onChange: () => void,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _applyOptimistic?: (mutator: (list: Followup[]) => Followup[]) => void
) {
  const [newAt, setNewAt] = useState('')
  const [newNote, setNewNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addMutation = useAddFollowup(prospect.id)
  const toggleMutation = useToggleFollowupDone(prospect.id)
  const deleteMutation = useDeleteFollowup(prospect.id)

  const pending: 'add' | null = addMutation.isPending ? 'add' : null
  const pendingId: string | null = toggleMutation.isPending
    ? (toggleMutation.variables?.id ?? null)
    : null

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
    setError(null)
    try {
      await addMutation.mutateAsync({
        due_at: dueAt.toISOString(),
        note: newNote.trim() || null,
      })
      setNewAt('')
      setNewNote('')
      onChange()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function toggleDone(f: Followup) {
    setError(null)
    try {
      await toggleMutation.mutateAsync({ id: f.id, done: !f.done })
      onChange()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function remove(fid: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this follow-up? This cannot be undone.')) return
    setError(null)
    try {
      await deleteMutation.mutateAsync(fid)
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
