'use client'

import { useState } from 'react'
import { authHeaders } from '@/lib/auth-headers'

export interface Note {
  id: string
  body: string
  created_at: string
  updated_at: string | null
  user_id: string
}

/**
 * Owns local state for the Notes card on a prospect detail page:
 * the new-note input, inline-edit state, and per-action pending flags.
 *
 * Network calls go to /api/prospects/:id/notes; on success we call
 * onChange() so the parent page can re-fetch the notes list and any
 * derived activity feed.
 */
export function useNotes(prospectId: string, onChange: () => void) {
  const [newBody, setNewBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [pending, setPending] = useState<'add' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    const text = newBody.trim()
    if (!text) return
    setPending('add')
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospectId}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'add note failed' }))
        throw new Error(err.error ?? 'add note failed')
      }
      setNewBody('')
      onChange()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(null)
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
    setPending('save')
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospectId}/notes/${editingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'save note failed' }))
        throw new Error(err.error ?? 'save note failed')
      }
      setEditingId(null)
      setEditingBody('')
      onChange()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(null)
    }
  }

  async function remove(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this note? This cannot be undone.')) return
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospectId}/notes/${id}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'delete note failed' }))
        throw new Error(err.error ?? 'delete note failed')
      }
      onChange()
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
