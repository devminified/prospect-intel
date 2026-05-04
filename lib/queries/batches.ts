'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { apiPost } from '@/lib/api-client'
import type { BatchListRow, CreateBatchClientInput, CreateBatchResponse } from '@/lib/types'
import { queryKeys } from './keys'

/** RLS-filtered to the current team. */
export function useBatches() {
  return useQuery<BatchListRow[]>({
    queryKey: queryKeys.batches.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batches')
        .select('id, city, category, count_requested, count_completed, status, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(`Failed to load batches: ${error.message}`)
      return (data as BatchListRow[]) ?? []
    },
  })
}

/**
 * Server-side this kicks off the Places search + enqueues the first
 * pipeline stage; from the page's perspective just invalidate the list
 * so the new row appears.
 */
export function useCreateBatch() {
  const qc = useQueryClient()
  return useMutation<CreateBatchResponse, Error, CreateBatchClientInput>({
    mutationFn: (input) => apiPost<CreateBatchResponse>('/api/batches', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.batches.list() })
    },
  })
}
