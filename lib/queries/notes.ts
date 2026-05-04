'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type { Note } from '@/lib/types'
import { queryKeys } from './keys'

export function useNotes(prospectId: string) {
  return useQuery({
    queryKey: queryKeys.notes.byProspect(prospectId),
    enabled: !!prospectId,
    queryFn: async () => {
      const json = await apiGet<{ notes: Note[] }>(`/api/prospects/${prospectId}/notes`)
      return json.notes ?? []
    },
  })
}

function invalidateAfterNoteChange(qc: ReturnType<typeof useQueryClient>, prospectId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.notes.byProspect(prospectId) })
  qc.invalidateQueries({ queryKey: queryKeys.prospectActivity(prospectId) })
  // Aggregate detail query embeds notes for the prospect detail page.
  qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
}

export function useAddNote(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => apiPost<void>(`/api/prospects/${prospectId}/notes`, { body }),
    onSuccess: () => invalidateAfterNoteChange(qc, prospectId),
  })
}

export function useEditNote(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      apiPatch<void>(`/api/prospects/${prospectId}/notes/${noteId}`, { body }),
    onSuccess: () => invalidateAfterNoteChange(qc, prospectId),
  })
}

export function useDeleteNote(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => apiDelete<void>(`/api/prospects/${prospectId}/notes/${noteId}`),
    onSuccess: () => invalidateAfterNoteChange(qc, prospectId),
  })
}
