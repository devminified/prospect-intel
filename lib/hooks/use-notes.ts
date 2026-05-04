'use client'

import { useState } from 'react'
import { useAddNote, useEditNote, useDeleteNote } from '@/lib/queries/notes'
import type { Note } from '@/lib/types'

export type { Note }

/**
 * Owns local form state (newBody, editing) and exposes the same public
 * API the prospect detail page consumes today. Internally delegates to
 * TanStack mutations from lib/queries/notes so:
 *   - request/parse/error logic is centralized in lib/api-client.ts
 *   - cache invalidation runs (queryKeys.notes / queryKeys.prospectActivity / queryKeys.prospect)
 */
export function useNotes(prospectId: string) {
  const [newBody, setNewBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addMutation = useAddNote(prospectId)
  const editMutation = useEditNote(prospectId)
  const deleteMutation = useDeleteNote(prospectId)

  // Compose pending state from the underlying TanStack mutations so the
  // page's button-disable logic keeps working.
  const pending: 'add' | 'save' | null = addMutation.isPending
    ? 'add'
    : editMutation.isPending
    ? 'save'
    : null

  async function add() {
    const text = newBody.trim()
    if (!text) return
    setError(null)
    try {
      await addMutation.mutateAsync(text)
      setNewBody('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setEditingBody(n.body)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingBody('')
  }

  async function save() {
    if (!editingId) return
    const text = editingBody.trim()
    if (!text) return
    setError(null)
    try {
      await editMutation.mutateAsync({ noteId: editingId, body: text })
      setEditingId(null)
      setEditingBody('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function remove(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this note? This cannot be undone.')) return
    setError(null)
    try {
      await deleteMutation.mutateAsync(id)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return {
    newBody,
    setNewBody,
    editingId,
    editingBody,
    setEditingBody,
    pending,
    error,
    add,
    startEdit,
    cancelEdit,
    save,
    remove,
  }
}
