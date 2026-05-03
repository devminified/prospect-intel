# Current phase

**Active:** Phase 8 — major architecture refactor.

After 7 phases of fast feature growth, the codebase has hit complexity that's slowing further work. Phase 8 splits the monolith into clean layers, adds runtime validation, and replaces ad-hoc state management with managed server-state caching.

**Why now:** the deferred features (DnD kanban, audit log, leave-team self-service, lead auto-redistribution, email-account transfer, deal pipeline, billing) all sit on top of patterns that already creak — multiple useState per page, body validation hand-rolled in every API route, business logic interleaved with HTTP plumbing. Refactoring after one more phase of features = more code to migrate.

**This explicitly violates the original CLAUDE.md §0 #5 ("no fancy abstractions") rule.** Updated in this phase to bless the new architecture.

## Layer model

```
app/(dashboard)/.../page.tsx     ← UI (client components, JSX, shadcn)
app/api/.../route.ts             ← HTTP boundary (auth, parse, delegate)
lib/queries/                     ← TanStack Query hooks (useQuery / useMutation)
lib/services/                    ← Business logic (compose db + external APIs)
lib/db/                          ← Supabase queries (typed, no business logic)
lib/types/                       ← Shared TypeScript types + Zod schemas
lib/                             ← External vendor clients (lusha, places, zoho)
```

Each layer only depends on layers below it. UI never touches Supabase directly.

## Milestones

### M52 — Foundation (this commit)
- Install `zod` + `@tanstack/react-query`.
- Carve `lib/types/`, `lib/db/`, `lib/services/`, `lib/queries/` directories with READMEs.
- Mount QueryClientProvider in app/layout.tsx.
- Update CLAUDE.md §0 #5 to permit Zod + TanStack Query.

### M53 — Type extraction
- Move every `interface X` + Detail/Lead/Prospect/etc. shape from pages and routes into `lib/types/*.ts`.
- Add Zod schemas for every domain type. Use `z.infer<typeof X>` as the canonical TypeScript type.

### M54 — Data layer (`lib/db/`)
- Move every Supabase query out of pages and API routes into typed `lib/db/<domain>.ts` modules.
- Each function takes a typed input + returns a typed result. No business logic.
- Both client (RLS-enforced) + admin (service role) variants where needed.

### M55 — Service layer (`lib/services/`)
- Move business logic from API routes into `lib/services/`.
- Services compose `lib/db/` + external vendor clients + RBAC checks.
- Validate inputs with Zod at the service boundary.

### M56 — API route refactor
- Each API route becomes < 30 lines: auth, body parse via Zod, delegate to service, return.
- Standardize the auth + error pattern in one shared helper.

### M57 — TanStack Query migration (heavy pages)
- `/dashboard`, `/leads`, prospect detail, batch detail.
- `useQuery` for reads, `useMutation` for writes. Cache invalidation via query keys.
- Existing `use-notes` / `use-followups` / `use-contact-mutations` rewritten as TanStack mutations.

### M58 — Migration finish + cleanup + docs
- Migrate remaining pages.
- Remove dead code from old patterns.
- Update `docs/CONVENTIONS.md` with the new layer rules.
- Phase 8 archive doc.

## Locked decisions (in scope vs explicitly deferred)

**In scope:**
- Zod, TanStack Query, layered architecture.
- Updating CLAUDE.md §0 to permit the above.

**Explicitly out of scope:**
- React Hook Form (we have ~3 forms; not worth a dep).
- date-fns / dayjs (current Date.parse + toLocaleString does the job).
- Test framework (no tests by deliberate MVP choice; revisit post-Phase 8).
- DI container, event bus, feature flags, RxJS, anything else "while we're at it."
- Any deferred feature work (kanban, audit log, billing, etc.) — those go into Phase 9+ on the new foundation.

## Budget expectations

- ~1.5 weeks across 7 milestones.
- No new external API spend.
- Significant regression risk — full smoke test required after each milestone.

When Phase 8 ships, compress this to ≤ 20 lines, move the full spec to `archive/phase-8-architecture.md`, and reset.
