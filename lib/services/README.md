# lib/services/

Business logic. Composes `lib/db/` + vendor clients (`lib/lusha`, `lib/places`, etc.) + RBAC checks. **No HTTP, no React, no direct Supabase calls.**

This layer answers: "given these inputs, what should happen?"

## Pattern

```ts
import { z } from 'zod'
import * as dbProspects from '@/lib/db/prospects'
import * as dbBatches from '@/lib/db/batches'
import { canCreateBatch, getUserRole } from '@/lib/rbac'
import { resolveUserTeamId } from '@/lib/team'
import { searchPlaces } from '@/lib/places'

const CreateBatchInput = z.object({
  city: z.string().min(1),
  category: z.string().min(1),
  count: z.number().int().min(1).max(50),
})
export type CreateBatchInput = z.infer<typeof CreateBatchInput>

export async function createBatch(userId: string, raw: unknown) {
  const input = CreateBatchInput.parse(raw)            // validate
  const teamId = await resolveUserTeamId(userId)
  const role = await getUserRole(userId, teamId)
  if (!canCreateBatch(role)) throw new ForbiddenError(...)
  // ... compose db calls + vendor calls
}
```

## Errors

Throw typed errors (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ExternalAPIError`). API routes map these to HTTP status codes in one shared helper. Services NEVER return `NextResponse`.

## When a service gets too big

Split by domain (`prospects.ts`, `batches.ts`, `team.ts`). Don't make a god-service. Cross-domain operations (e.g. "execute plan" creates batches + prospects) get their own file (`plans.ts`).

## What does NOT belong here

- Direct Supabase calls — go through `lib/db/`.
- HTTP request/response objects — services accept plain inputs and return plain values.
- React state.
