'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type { CreateInviteResponse, TeamProgressResponse, TeamView } from '@/lib/types'
import { queryKeys } from './keys'

export function useCurrentTeam() {
  return useQuery({
    queryKey: queryKeys.team.current(),
    queryFn: () => apiGet<TeamView>('/api/team'),
    staleTime: 60_000, // team membership rarely changes; cache aggressively
  })
}

/**
 * Per-member roll-up over the last N days. Server returns 403 for
 * non-owner / non-manager — caller passes `enabled: false` for those
 * roles so the request never fires.
 */
export function useTeamProgress(days: number, opts: { enabled?: boolean } = {}) {
  return useQuery<TeamProgressResponse>({
    queryKey: queryKeys.team.progress(days),
    queryFn: () => apiGet<TeamProgressResponse>(`/api/team/progress?days=${days}`),
    enabled: opts.enabled !== false,
    staleTime: 30_000,
  })
}

function invalidateTeam(qc: ReturnType<typeof useQueryClient>) {
  return () => qc.invalidateQueries({ queryKey: queryKeys.team.current() })
}

export function useRenameTeam() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { name: string }>({
    mutationFn: (input) => apiPatch('/api/team', input),
    onSuccess: invalidateTeam(qc),
  })
}

export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation<CreateInviteResponse, Error, { email: string; role: string }>({
    mutationFn: (input) => apiPost<CreateInviteResponse>('/api/team/invites', input),
    onSuccess: invalidateTeam(qc),
  })
}

export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (inviteId) => apiDelete(`/api/team/invites?id=${inviteId}`),
    onSuccess: invalidateTeam(qc),
  })
}

export function useChangeMemberRole() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { userId: string; role: string }>({
    mutationFn: ({ userId, role }) => apiPatch(`/api/team/members/${userId}`, { role }),
    onSuccess: invalidateTeam(qc),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (userId) => apiDelete(`/api/team/members/${userId}`),
    onSuccess: invalidateTeam(qc),
  })
}

export function useTransferOwnership() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (userId) => apiPost('/api/team/transfer-ownership', { user_id: userId }),
    onSuccess: invalidateTeam(qc),
  })
}
