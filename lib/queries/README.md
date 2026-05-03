# lib/queries/

TanStack Query hooks for client-side server-state caching. **No business logic, no direct Supabase, no JSX.**

This layer is the bridge between UI components and `/api/*` routes. Components import hooks from here; the hooks handle fetching, caching, mutation, and invalidation.

## Pattern

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authHeaders } from '@/lib/auth-headers'

const keys = {
  notes: (prospectId: string) => ['prospects', prospectId, 'notes'] as const,
}

export function useNotes(prospectId: string) {
  return useQuery({
    queryKey: keys.notes(prospectId),
    queryFn: async () => {
      const headers = await authHeaders()
      const res = await fetch(`/api/prospects/${prospectId}/notes`, { headers })
      if (!res.ok) throw new Error('notes load failed')
      const json = await res.json()
      return json.notes as Note[]
    },
  })
}

export function useAddNote(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/prospects/${prospectId}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'add note failed' }))
        throw new Error(err.error ?? 'add note failed')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes(prospectId) }),
  })
}
```

## Query-key conventions

Centralize keys per domain in a `keys` object at the top of each file. Hierarchical structure (`['prospects', id, 'notes']`) supports broad invalidation. When in doubt, write the key by hand and pull it into `keys` once it's used twice.

## Optimistic updates

Use TanStack's `onMutate` + `onError` rollback pattern instead of mirroring server state into local component state. Example: see `useFollowups` once migrated.

## What does NOT belong here

- Domain logic — that's `lib/services/` (server-side) or compose multiple hooks in components.
- Direct Supabase calls — always go through `/api/*` so RBAC + validation runs.
- Forms / input state — components own that with plain `useState`.
