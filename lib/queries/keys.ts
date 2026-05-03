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
  },
} as const
