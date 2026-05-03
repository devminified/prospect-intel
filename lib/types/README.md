# lib/types/

Shared TypeScript types + Zod schemas. **No runtime logic, no I/O, no React.**

## Pattern

For every domain entity (Prospect, Lead, Note, Followup, ...) declare:

```ts
import { z } from 'zod'

export const ProspectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['new', 'enriched', 'analyzed', /* ... */]),
  // ...
})

export type Prospect = z.infer<typeof ProspectSchema>
```

The Zod schema is the single source of truth — both the TypeScript type and runtime validation derive from it. Use `Schema.parse(data)` at every boundary (API request body, vendor API response, anywhere unsafe data enters the app).

## When to add a file

One file per domain entity (`prospect.ts`, `note.ts`, `team.ts`). When schemas are tightly coupled (e.g. `Note` and `NoteCreateInput`), keep them in one file.

## What does NOT belong here

- Functions that perform I/O — those go to `lib/db/` or `lib/services/`.
- React components / hooks — those go to `lib/queries/` or component files.
- Vendor-specific types that aren't part of our domain — keep those next to the vendor client (e.g. `lib/lusha.ts`).
