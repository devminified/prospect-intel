'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type {
  UpworkContract,
  UpworkContractCreateInput,
  UpworkContractDetail,
  UpworkContractUpdateInput,
  UpworkMilestone,
  UpworkMilestoneCreateInput,
  UpworkMilestoneUpdateInput,
  UpworkTimeLog,
  UpworkTimeLogStatusChangeInput,
  UpworkTimeLogUpsertInput,
} from '@/lib/types'
import { queryKeys } from './keys'

export function useContracts(profileId: string, status: string | null = null) {
  return useQuery<UpworkContract[]>({
    queryKey: queryKeys.upwork.contracts(profileId, status),
    enabled: !!profileId,
    queryFn: () => {
      const qs = status && status !== 'any' ? `?status=${encodeURIComponent(status)}` : ''
      return apiGet<UpworkContract[]>(`/api/upwork/profiles/${profileId}/contracts${qs}`)
    },
  })
}

export function useContract(contractId: string) {
  return useQuery<UpworkContractDetail>({
    queryKey: queryKeys.upwork.contract(contractId),
    enabled: !!contractId,
    queryFn: () => apiGet<UpworkContractDetail>(`/api/upwork/contracts/${contractId}`),
  })
}

export function useCreateContract() {
  const qc = useQueryClient()
  return useMutation<UpworkContract, Error, UpworkContractCreateInput>({
    mutationFn: (input) => apiPost<UpworkContract>('/api/upwork/contracts', input),
    onSuccess: (contract) => {
      void qc.invalidateQueries({
        queryKey: ['upwork', 'profile', contract.profile_id, 'contracts'],
      })
    },
  })
}

export function useUpdateContract(contractId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpworkContractUpdateInput>({
    mutationFn: (input) => apiPatch(`/api/upwork/contracts/${contractId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
      void qc.invalidateQueries({ queryKey: ['upwork', 'profile', profileId, 'contracts'] })
    },
  })
}

// ─── Milestones ─────────────────────────────────────────────────────

export function useAddMilestone(contractId: string) {
  const qc = useQueryClient()
  return useMutation<UpworkMilestone, Error, UpworkMilestoneCreateInput>({
    mutationFn: (input) =>
      apiPost<UpworkMilestone>(`/api/upwork/contracts/${contractId}/milestones`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}

export function useUpdateMilestone(contractId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string; patch: UpworkMilestoneUpdateInput }>({
    mutationFn: ({ id, patch }) => apiPatch(`/api/upwork/milestones/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}

export function useDeleteMilestone(contractId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiDelete(`/api/upwork/milestones/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}

// ─── Time logs ─────────────────────────────────────────────────────

export function useLogHours(contractId: string) {
  const qc = useQueryClient()
  return useMutation<UpworkTimeLog, Error, UpworkTimeLogUpsertInput>({
    mutationFn: (input) =>
      apiPost<UpworkTimeLog>(`/api/upwork/contracts/${contractId}/time-logs`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}

export function useChangeTimeLogStatus(contractId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string; input: UpworkTimeLogStatusChangeInput }>({
    mutationFn: ({ id, input }) => apiPatch(`/api/upwork/time-logs/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}

export function useDeleteTimeLog(contractId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiDelete(`/api/upwork/time-logs/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.contract(contractId) })
    },
  })
}
