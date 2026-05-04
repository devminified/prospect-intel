/**
 * Centralized TanStack Query keys. Hierarchical so broad invalidations
 * (e.g. invalidate everything for a prospect when a note is added)
 * are one call.
 *
 * Pattern:
 *   notes(prospectId)        → ['notes', 'byProspect', <id>]
 *   followups(prospectId)    → ['followups', 'byProspect', <id>]
 *   prospect(id)             → ['prospect', <id>]   (the aggregate detail load)
 */

export const queryKeys = {
  notes: {
    byProspect: (prospectId: string) => ['notes', 'byProspect', prospectId] as const,
  },
  followups: {
    byProspect: (prospectId: string) => ['followups', 'byProspect', prospectId] as const,
  },
  contacts: {
    byProspect: (prospectId: string) => ['contacts', 'byProspect', prospectId] as const,
  },
  prospect: (prospectId: string) => ['prospect', prospectId] as const,
  prospectActivity: (prospectId: string) => ['prospect', prospectId, 'activity'] as const,
  team: {
    current: () => ['team', 'current'] as const,
    progress: (days: number) => ['team', 'progress', days] as const,
  },
  batches: {
    list: () => ['batches', 'list'] as const,
  },
  plans: {
    list: () => ['plans', 'list'] as const,
    detail: (id: string) => ['plans', 'detail', id] as const,
    performance: (days: number) => ['plans', 'performance', days] as const,
  },
  icp: {
    current: () => ['icp', 'current'] as const,
  },
  emailAccount: {
    current: () => ['emailAccount', 'current'] as const,
  },
  upwork: {
    access: () => ['upwork', 'access'] as const,
    profiles: () => ['upwork', 'profiles'] as const,
    profile: (id: string) => ['upwork', 'profile', id] as const,
    addableMembers: (profileId: string) => ['upwork', 'profile', profileId, 'addable'] as const,
    jobs: (status: string | null) => ['upwork', 'jobs', status ?? 'any'] as const,
    job: (id: string) => ['upwork', 'job', id] as const,
    proposalsForProfile: (profileId: string, status: string | null) =>
      ['upwork', 'profile', profileId, 'proposals', status ?? 'any'] as const,
    proposal: (id: string) => ['upwork', 'proposal', id] as const,
    connectsForProfile: (profileId: string) =>
      ['upwork', 'profile', profileId, 'connects'] as const,
    conversations: (profileId: string, status: string | null) =>
      ['upwork', 'profile', profileId, 'conversations', status ?? 'any'] as const,
    conversation: (id: string) => ['upwork', 'conversation', id] as const,
    contracts: (profileId: string, status: string | null) =>
      ['upwork', 'profile', profileId, 'contracts', status ?? 'any'] as const,
    contract: (id: string) => ['upwork', 'contract', id] as const,
  },
} as const
