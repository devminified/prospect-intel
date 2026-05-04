'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type { Followup } from '@/lib/types'
import { queryKeys } from './keys'

export function useFollowups(prospectId: string) {
  return useQuery({
    queryKey: queryKeys.followups.byProspect(prospectId),
    enabled: !!prospectId,
    queryFn: async () => {
      const json = await apiGet<{ followups: Followup[] }>(`/api/prospects/${prospectId}/followups`)
      return json.followups ?? []
    },
  })
}

function invalidateAfterFollowupChange(
  qc: ReturnType<typeof useQueryClient>,
  prospectId: string
) {
  qc.invalidateQueries({ queryKey: queryKeys.followups.byProspect(prospectId) })
  qc.invalidateQueries({ queryKey: queryKeys.prospectActivity(prospectId) })
  // Aggregate detail query embeds followups for the prospect detail page.
  qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
}

export function useAddFollowup(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { due_at: string; note: string | null }) =>
      apiPost<void>(`/api/prospects/${prospectId}/followups`, input),
    onSuccess: () => invalidateAfterFollowupChange(qc, prospectId),
  })
}

/**
 * Optimistic done-toggle. Cache flips immediately; PATCH fires in the
 * background; on failure cache reverts. Replaces the applyOptimistic
 * callback the old custom hook required.
 */
export function useToggleFollowupDone(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      apiPatch<void>(`/api/prospects/${prospectId}/followups/${id}`, { done }),
    onMutate: async ({ id, done }) => {
      const key = queryKeys.followups.byProspect(prospectId)
      await qc.cancelQueries({ queryKey: key })
      const prior = qc.getQueryData<Followup[]>(key)
      if (prior) {
        qc.setQueryData<Followup[]>(
          key,
          prior.map((f) =>
            f.id === id ? { ...f, done, done_at: done ? new Date().toISOString() : null } : f
          )
        )
      }
      return { prior }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prior) qc.setQueryData(queryKeys.followups.byProspect(prospectId), ctx.prior)
    },
    onSettled: () => invalidateAfterFollowupChange(qc, prospectId),
  })
}

export function useDeleteFollowup(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/api/prospects/${prospectId}/followups/${id}`),
    onSuccess: () => invalidateAfterFollowupChange(qc, prospectId),
  })
}
