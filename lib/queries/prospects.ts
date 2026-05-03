'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPatch } from '@/lib/api-client'
import { queryKeys } from './keys'

export function usePatchProspect(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiPatch<void>(`/api/prospects/${prospectId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

/**
 * Optimistic outreach-status flip. The detail-aggregate cache is patched
 * in place so the badge updates instantly; on PATCH failure the prior
 * value is restored and TanStack lets the global error toast surface
 * the message.
 */
export function useSetOutreachStatus(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (newValue: string | null) =>
      apiPatch<void>(`/api/prospects/${prospectId}`, { outreach_status: newValue }),
    onMutate: async (newValue) => {
      const key = queryKeys.prospect(prospectId)
      await qc.cancelQueries({ queryKey: key })
      const prior = qc.getQueryData<{ prospect?: { outreach_status: string | null } } | undefined>(
        key
      )
      if (prior?.prospect) {
        qc.setQueryData(key, {
          ...prior,
          prospect: { ...prior.prospect, outreach_status: newValue },
        })
      }
      return { prior }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prior) qc.setQueryData(queryKeys.prospect(prospectId), ctx.prior)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

/** Same optimistic pattern for assignee. */
export function useAssignProspect(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: string | null) =>
      apiPatch<void>(`/api/prospects/${prospectId}`, { assigned_to: targetUserId }),
    onMutate: async (targetUserId) => {
      const key = queryKeys.prospect(prospectId)
      await qc.cancelQueries({ queryKey: key })
      const prior = qc.getQueryData<
        { prospect?: { assigned_to: string | null; assigned_at: string | null } } | undefined
      >(key)
      if (prior?.prospect) {
        qc.setQueryData(key, {
          ...prior,
          prospect: {
            ...prior.prospect,
            assigned_to: targetUserId,
            assigned_at: targetUserId ? new Date().toISOString() : null,
          },
        })
      }
      return { prior }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prior) qc.setQueryData(queryKeys.prospect(prospectId), ctx.prior)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}
