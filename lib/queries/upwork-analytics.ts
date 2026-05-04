'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import type {
  UpworkLeaderboard,
  UpworkOverview,
  UpworkProfileDashboard,
} from '@/lib/types'
import { queryKeys } from './keys'

export function useProfileDashboard(profileId: string, days = 30) {
  return useQuery<UpworkProfileDashboard>({
    queryKey: queryKeys.upwork.profileDashboard(profileId, days),
    enabled: !!profileId,
    queryFn: () =>
      apiGet<UpworkProfileDashboard>(
        `/api/upwork/profiles/${profileId}/dashboard?days=${days}`
      ),
    staleTime: 30_000,
  })
}

export function useUpworkOverview(days = 30) {
  return useQuery<UpworkOverview>({
    queryKey: queryKeys.upwork.overview(days),
    queryFn: () => apiGet<UpworkOverview>(`/api/upwork/overview?days=${days}`),
    staleTime: 30_000,
  })
}

export function useBidderLeaderboard(days = 30, opts: { enabled?: boolean } = {}) {
  return useQuery<UpworkLeaderboard>({
    queryKey: queryKeys.upwork.leaderboard(days),
    queryFn: () => apiGet<UpworkLeaderboard>(`/api/upwork/leaderboard?days=${days}`),
    enabled: opts.enabled !== false,
    staleTime: 30_000,
  })
}
