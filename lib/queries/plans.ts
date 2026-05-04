'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { apiGet, apiPost } from '@/lib/api-client'
import type {
  ExecutePlanResponse,
  GeneratePlanResponse,
  PerformanceRow,
  PlanDetail,
  PlanItem,
  PlanListRow,
  PlanWithItems,
} from '@/lib/types'
import { queryKeys } from './keys'

/**
 * Hooks for the daily lead-planner pages (`/plans`, `/plans/[id]`).
 * Plans are read straight from Supabase (RLS-filtered), generated and
 * executed via `/api/plans` and `/api/plans/[id]/execute`.
 */

export function usePlans() {
  return useQuery<PlanListRow[]>({
    queryKey: queryKeys.plans.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_plans')
        .select('id, plan_date, status, created_at, executed_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as PlanListRow[]) ?? []
    },
  })
}

export function usePerformance(days = 30) {
  return useQuery<PerformanceRow[]>({
    queryKey: queryKeys.plans.performance(days),
    queryFn: async () => {
      const body = await apiGet<{ rows?: PerformanceRow[] }>(`/api/performance?days=${days}`)
      return body.rows ?? []
    },
  })
}

export function useGeneratePlan() {
  const qc = useQueryClient()
  return useMutation<GeneratePlanResponse, Error, void>({
    mutationFn: () => apiPost<GeneratePlanResponse>('/api/plans', undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.plans.list() })
    },
  })
}

export function usePlanDetail(planId: string) {
  return useQuery<PlanWithItems>({
    queryKey: queryKeys.plans.detail(planId),
    enabled: !!planId,
    queryFn: async () => {
      const [p, it] = await Promise.all([
        supabase.from('lead_plans').select('*').eq('id', planId).single(),
        supabase
          .from('lead_plan_items')
          .select('*')
          .eq('plan_id', planId)
          .order('priority', { ascending: true }),
      ])
      if (p.error) throw new Error(p.error.message)
      return {
        plan: p.data as PlanDetail,
        items: (it.data as PlanItem[]) ?? [],
      }
    },
  })
}

/**
 * POST /api/plans/[id]/execute — kicks every plan-item that hasn't
 * been turned into a batch yet. Pass an `item_id` to execute one row.
 */
export function useExecutePlan(planId: string) {
  const qc = useQueryClient()
  return useMutation<ExecutePlanResponse, Error, { itemId?: string }>({
    mutationFn: async ({ itemId }) => {
      const qs = itemId ? `?item_id=${itemId}` : ''
      return apiPost<ExecutePlanResponse>(`/api/plans/${planId}/execute${qs}`, undefined)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.plans.detail(planId) })
      void qc.invalidateQueries({ queryKey: queryKeys.plans.list() })
      void qc.invalidateQueries({ queryKey: queryKeys.batches.list() })
    },
  })
}
