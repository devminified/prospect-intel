'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'
import type { IcpFormState, IcpResponse } from '@/lib/types'
import { queryKeys } from './keys'

/**
 * GET /api/icp — returns the team's ICP profile (or null if unset).
 */
export function useIcp() {
  return useQuery<IcpResponse>({
    queryKey: queryKeys.icp.current(),
    queryFn: () => apiGet<IcpResponse>('/api/icp'),
  })
}

/**
 * PATCH /api/icp — saves the form state. Server validates with
 * IcpPatchInputSchema before writing.
 */
export function useSaveIcp() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, IcpFormState>({
    mutationFn: (input) => apiPatch('/api/icp', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.icp.current() })
    },
  })
}
