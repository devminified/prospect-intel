'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type {
  UpworkAccessInfo,
  UpworkProfile,
  UpworkProfileCreateInput,
  UpworkProfileDetail,
  UpworkProfileMemberAddInput,
  UpworkProfileMemberRoleChangeInput,
  UpworkProfileUpdateInput,
} from '@/lib/types'
import { queryKeys } from './keys'

interface AddableMembersResponse {
  addable: Array<{ user_id: string; email: string | null; team_role: string }>
}

/**
 * Caller's Upwork access — drives the nav gate. Cached aggressively
 * since it only changes when an owner adds/removes profile members.
 */
export function useUpworkAccess() {
  return useQuery<UpworkAccessInfo>({
    queryKey: queryKeys.upwork.access(),
    queryFn: () => apiGet<UpworkAccessInfo>('/api/upwork/access'),
    staleTime: 60_000,
  })
}

export function useUpworkProfiles() {
  return useQuery<UpworkProfile[]>({
    queryKey: queryKeys.upwork.profiles(),
    queryFn: () => apiGet<UpworkProfile[]>('/api/upwork/profiles'),
  })
}

export function useUpworkProfile(profileId: string) {
  return useQuery<UpworkProfileDetail>({
    queryKey: queryKeys.upwork.profile(profileId),
    enabled: !!profileId,
    queryFn: () => apiGet<UpworkProfileDetail>(`/api/upwork/profiles/${profileId}`),
  })
}

export function useAddableMembers(profileId: string) {
  return useQuery<AddableMembersResponse>({
    queryKey: queryKeys.upwork.addableMembers(profileId),
    enabled: !!profileId,
    queryFn: () =>
      apiGet<AddableMembersResponse>(`/api/upwork/profiles/${profileId}/members`),
  })
}

export function useCreateUpworkProfile() {
  const qc = useQueryClient()
  return useMutation<UpworkProfile, Error, UpworkProfileCreateInput>({
    mutationFn: (input) => apiPost<UpworkProfile>('/api/upwork/profiles', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profiles() })
    },
  })
}

export function useUpdateUpworkProfile(profileId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpworkProfileUpdateInput>({
    mutationFn: (input) => apiPatch(`/api/upwork/profiles/${profileId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profiles() })
    },
  })
}

export function useArchiveUpworkProfile() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (profileId) => apiDelete(`/api/upwork/profiles/${profileId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profiles() })
    },
  })
}

export function useAddProfileMember(profileId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpworkProfileMemberAddInput>({
    mutationFn: (input) => apiPost(`/api/upwork/profiles/${profileId}/members`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.addableMembers(profileId) })
    },
  })
}

export function useChangeProfileMemberRole(profileId: string) {
  const qc = useQueryClient()
  return useMutation<
    unknown,
    Error,
    { userId: string; input: UpworkProfileMemberRoleChangeInput }
  >({
    mutationFn: ({ userId, input }) =>
      apiPatch(`/api/upwork/profiles/${profileId}/members/${userId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(profileId) })
    },
  })
}

export function useRemoveProfileMember(profileId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (targetUserId) =>
      apiDelete(`/api/upwork/profiles/${profileId}/members/${targetUserId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.profile(profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.addableMembers(profileId) })
    },
  })
}
