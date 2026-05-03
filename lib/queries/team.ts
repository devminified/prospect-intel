'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import type { Role, Team, TeamInvite, TeamMemberWithEmail } from '@/lib/types'
import { queryKeys } from './keys'

interface TeamView {
  team: Team
  members: TeamMemberWithEmail[]
  invites: TeamInvite[]
  my_role: Role
}

export function useCurrentTeam() {
  return useQuery({
    queryKey: queryKeys.team.current(),
    queryFn: () => apiGet<TeamView>('/api/team'),
    staleTime: 60_000, // team membership rarely changes; cache aggressively
  })
}
