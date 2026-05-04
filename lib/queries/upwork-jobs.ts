'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type {
  UpworkConnectsEntryInput,
  UpworkConnectsLogEntry,
  UpworkJob,
  UpworkJobCreateInput,
  UpworkJobUpdateInput,
  UpworkProposal,
  UpworkProposalCreateInput,
} from '@/lib/types'
import { queryKeys } from './keys'

interface JobDetailResponse {
  job: UpworkJob
  proposals: UpworkProposal[]
}

export function useUpworkJobs(status: string | null = null) {
  return useQuery<UpworkJob[]>({
    queryKey: queryKeys.upwork.jobs(status),
    queryFn: () => {
      const qs = status && status !== 'any' ? `?status=${encodeURIComponent(status)}` : ''
      return apiGet<UpworkJob[]>(`/api/upwork/jobs${qs}`)
    },
  })
}

export function useUpworkJob(jobId: string) {
  return useQuery<JobDetailResponse>({
    queryKey: queryKeys.upwork.job(jobId),
    enabled: !!jobId,
    queryFn: () => apiGet<JobDetailResponse>(`/api/upwork/jobs/${jobId}`),
  })
}

export function useCreateUpworkJob() {
  const qc = useQueryClient()
  return useMutation<UpworkJob, Error, UpworkJobCreateInput>({
    mutationFn: (input) => apiPost<UpworkJob>('/api/upwork/jobs', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['upwork', 'jobs'] })
    },
  })
}

export function useUpdateUpworkJob(jobId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpworkJobUpdateInput>({
    mutationFn: (input) => apiPatch(`/api/upwork/jobs/${jobId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.job(jobId) })
      void qc.invalidateQueries({ queryKey: ['upwork', 'jobs'] })
    },
  })
}

export function useDeleteUpworkJob() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (jobId) => apiDelete(`/api/upwork/jobs/${jobId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['upwork', 'jobs'] })
    },
  })
}

// ─── Proposals ────────────────────────────────────────────────────

export function useProposalsForProfile(profileId: string, status: string | null = null) {
  return useQuery<UpworkProposal[]>({
    queryKey: queryKeys.upwork.proposalsForProfile(profileId, status),
    enabled: !!profileId,
    queryFn: () => {
      const qs = status && status !== 'any' ? `?status=${encodeURIComponent(status)}` : ''
      return apiGet<UpworkProposal[]>(`/api/upwork/profiles/${profileId}/proposals${qs}`)
    },
  })
}

export function useProposal(proposalId: string) {
  return useQuery<UpworkProposal>({
    queryKey: queryKeys.upwork.proposal(proposalId),
    enabled: !!proposalId,
    queryFn: () => apiGet<UpworkProposal>(`/api/upwork/proposals/${proposalId}`),
  })
}

function invalidateProposalKeys(qc: ReturnType<typeof useQueryClient>, p?: UpworkProposal) {
  void qc.invalidateQueries({ queryKey: ['upwork', 'proposal'] })
  void qc.invalidateQueries({ queryKey: ['upwork', 'job'] })
  if (p?.profile_id) {
    void qc.invalidateQueries({
      queryKey: ['upwork', 'profile', p.profile_id, 'proposals'],
    })
    void qc.invalidateQueries({
      queryKey: queryKeys.upwork.connectsForProfile(p.profile_id),
    })
    void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(p.profile_id) })
  }
}

export function useCreateProposal() {
  const qc = useQueryClient()
  return useMutation<UpworkProposal, Error, UpworkProposalCreateInput>({
    mutationFn: (input) => apiPost<UpworkProposal>('/api/upwork/proposals', input),
    onSuccess: (proposal) => invalidateProposalKeys(qc, proposal),
  })
}

export function useUpdateProposal() {
  const qc = useQueryClient()
  return useMutation<
    unknown,
    Error,
    { id: string; profileId: string; patch: Record<string, unknown> }
  >({
    mutationFn: ({ id, patch }) => apiPatch(`/api/upwork/proposals/${id}`, patch),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.proposal(vars.id) })
      void qc.invalidateQueries({ queryKey: ['upwork', 'job'] })
      void qc.invalidateQueries({
        queryKey: ['upwork', 'profile', vars.profileId, 'proposals'],
      })
      void qc.invalidateQueries({
        queryKey: queryKeys.upwork.connectsForProfile(vars.profileId),
      })
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(vars.profileId) })
    },
  })
}

// ─── Connects ledger ──────────────────────────────────────────────

interface ConnectsListResponse {
  entries: UpworkConnectsLogEntry[]
}

export function useConnectsLedger(profileId: string) {
  return useQuery<ConnectsListResponse>({
    queryKey: queryKeys.upwork.connectsForProfile(profileId),
    enabled: !!profileId,
    queryFn: () => apiGet<ConnectsListResponse>(`/api/upwork/profiles/${profileId}/connects`),
  })
}

export function useRecordConnectsEntry(profileId: string) {
  const qc = useQueryClient()
  return useMutation<UpworkConnectsLogEntry, Error, UpworkConnectsEntryInput>({
    mutationFn: (input) =>
      apiPost<UpworkConnectsLogEntry>(`/api/upwork/profiles/${profileId}/connects`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.connectsForProfile(profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(profileId) })
    },
  })
}
