'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPatch, apiPost } from '@/lib/api-client'
import { queryKeys } from './keys'

/**
 * Contacts are loaded as part of the prospect-detail aggregate (see
 * lib/queries/prospect-detail.ts). The mutations below invalidate that
 * aggregate so a re-fetch picks up the new contact data.
 */

export function usePatchContact(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      contactId,
      patch,
    }: {
      contactId: string
      patch: Record<string, unknown>
    }) => apiPatch<void>(`/api/prospects/${prospectId}/contacts/${contactId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useUseBusinessPhone(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contactId: string) =>
      apiPost<{ ok: true; phone: string | null }>(
        `/api/prospects/${prospectId}/contacts/${contactId}/use-business-phone`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useFindDirectLine(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contactId: string) =>
      apiPost<{ ok: true; phone: string | null }>(
        `/api/prospects/${prospectId}/contacts/${contactId}/find-direct-line`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}
