# lib/db/

Typed Supabase queries. **No business logic, no Anthropic, no Lusha, no auth checks.**

This layer answers one question: "what's in the database for this query?" and nothing else.

## Pattern

```ts
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Prospect } from '@/lib/types/prospect'

export async function getProspectById(id: string): Promise<Prospect | null> {
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`prospects.getById: ${error.message}`)
  return (data as Prospect | null) ?? null
}
```

## Server vs client

Most files use `supabaseAdmin` (service role) — they're called from API routes / services / cron.

A small subset (`lib/db/client/`) wraps the browser-side `supabase` client for direct page reads where RLS does the auth work. Prefer routing reads through services where practical, but for high-traffic listing pages a direct client read is fine.

## What does NOT belong here

- RBAC / role checks — go in `lib/services/`.
- Composing multiple queries with branching logic — also `lib/services/`.
- Request validation — services validate input, db functions assume valid input.
- React state — `lib/queries/`.
