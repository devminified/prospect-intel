# Phase 8 — Layered architecture refactor (M52–M59)

**Status:** Shipped 2026-05-04. Prospect detail TanStack migration deferred to Phase 9.

**What it is:** After 7 phases of feature growth, the monolith hit complexity that slowed further work. Phase 8 split the codebase into named layers (UI → queries → services → db → types) and added Zod validation + TanStack Query for managed server state.

This phase explicitly violated the original CLAUDE.md §0 #5 "no fancy abstractions" rule. The rule was rewritten in M52 to bless the new architecture.

## Final layer model

```
app/(dashboard)/.../page.tsx     UI
app/api/.../route.ts             HTTP boundary
lib/queries/                     server state (TanStack)
lib/services/                    business logic (Zod + RBAC)
lib/db/                          Supabase queries
lib/types/                       Zod schemas + types
lib/                             vendor clients
```

Each layer depends only on layers below it.

## Milestones

### M52 — Foundation
Installed `zod` + `@tanstack/react-query`. Carved `lib/{types,db,services,queries}/` directories with READMEs. Mounted `QueryClientProvider` in root layout. Updated CLAUDE.md §0 #5.

### M53 — Type extraction
Twelve domain modules in `lib/types/` — Prospect, Note, Followup, Contact, Team (+TeamMember+Invite), Batch, Pitch, SentEmail (+EmailOpen+EmailReply+ReplyClassification), Recommendation, ICP, LeadPlan, Enrichment (+Analysis+VisibilityAudit+PainPoint). Each is a Zod schema with `z.infer` TypeScript types and any Create/Update input variants. Index re-export so consumers `import from '@/lib/types'`.

### M54 — Data layer
Eight `lib/db/` modules — notes, followups, contacts, prospects, batches, teams, icp, lead-plans, email. ~50 typed query functions. Each throws `db.<module>.<fn>: <reason>` on failure for traceability. No business logic; no auth checks; no vendor calls.

### M55 — Service layer
Nine `lib/services/` modules — errors (DomainError + ValidationError/UnauthorizedError/ForbiddenError/NotFoundError/ConflictError + errorToResponse mapper), auth (requireUserFromHeader), access (requireProspectAccess + requireTeamAccess), notes, followups, contacts, prospects, icp, teams, pitches. Plus `route-helper.ts` (`withAuth` + `readJsonBody`).

Pattern: services accept `userId + raw input`, validate via Zod, run RBAC, delegate to `lib/db`, throw DomainError on failure.

### M56 — API route refactor
Sixteen routes refactored to thin delegators (auth → parse → service → respond). Net delta on the route layer: −1395 lines / +251 lines. Notes, Followups, Contact PATCH, Use-business-phone, Find-direct-line, Prospect PATCH, ICP, Team CRUD + invites + redeem + member ops + transfer-ownership.

Out of scope (kept their existing integration shape): batches POST, pitches send (Zoho), recommend-channel, regenerate-pitch, discover-contacts, cron routes, auth callbacks.

### M57 — TanStack Query infrastructure
- `lib/api-client.ts` — `apiGet/apiPost/apiPatch/apiDelete` typed wrappers around fetch. Single source of truth for client→`/api/*` calls. Throws `ApiError` with `{ status, message }`. **No axios** — kept native, the surface area is small.
- `lib/queries/keys.ts` — central `queryKeys` factory (hierarchical for broad invalidation).
- `lib/queries/{notes,followups,contacts,prospects,team,prospect-detail}.ts` — `useQuery` for reads, `useMutation` for writes, optimistic patterns where the old hooks had them.

### M58 — Page migrations
- ✓ M58a — `/dashboard` (485 → 295 lines, drops 6 useState)
- ✓ M58b — `/leads` (drops load(), team-fetch IIFE; uses `useLeads` + `useCurrentTeam`)
- ✓ M58c — `/batches/[id]` (drops load() entirely, page-level error state replaced by TanStack error)
- **M58d — Prospect detail deferred to Phase 9** (see "Carry-forward" below)

### M59 — Cleanup + docs (this milestone)
- `docs/CONVENTIONS.md` updated with the layer contract + allowed-libraries list.
- Phase 8 archive doc (this file).
- CURRENT.md reset to standby.

## Carry-forward to Phase 9

**Prospect detail (`app/(dashboard)/prospects/[id]/page.tsx`, 1563 lines).** The TanStack hooks are ready to consume; the page rewrite is what's missing. Three blockers that make a one-shot migration unsafe:

1. **Three custom hooks bundle form state with mutation state.** `lib/hooks/use-{notes,followups,contact-mutations}.ts` each own `newBody`, `editingId`, `pendingId` etc. alongside the network code. Splitting form state out is a sizable change per hook.
2. **Optimistic updates close over `setDetail`.** `changeAssignee`, `changeOutreachStatus`, the followup toggle all call `setDetail({...})` with rollback on error. Each needs to swap to `qc.setQueryData(queryKeys.prospect(id), ...)` with a matching rollback in `onError`.
3. **Two competing data flows.** The `load()` aggregate + each custom hook's own `onChange` callback that re-triggers `load()`. Migrating the page to `useProspectDetail` means rewiring all three custom hooks' `onChange` to call `qc.invalidateQueries` instead — straightforward but each call site needs verification.

Phase 9 should treat this as its own milestone with explicit smoke testing between each step.

**Out-of-scope items still in the queue from Phase 7's deferred list:** DnD kanban on `/leads?view=kanban`, per-assignment history / audit log, leave-team self-service, auto-redistribute leads on member removal, per-team email_account ownership transfer, deal pipeline, billing.

## Key decisions

- **Native fetch + tiny `lib/api-client.ts` over axios.** Surface we need is small; a dep would be tax.
- **No React Hook Form, no date-fns/dayjs, no test framework.** Each was explicitly considered and rejected for being premature optimization at current scale.
- **DomainError + `errorToResponse` mapping over per-route try/catch.** The shared route helper makes every route consistent.
- **Hierarchical query keys.** `['notes', 'byProspect', id]` so invalidating a prospect's notes is one call from a mutation success handler.
- **30s default `staleTime`.** Conservative default; navigation between pages doesn't refetch on every mount but values stay fresh.
- **Per-prospect aggregate lives at `queryKeys.prospect(id)`.** Mutations from any sub-domain invalidate this single key to refresh the prospect detail page.

## Migrations

None — Phase 8 was pure code architecture, no schema changes.

## Allowed libraries (post-Phase-8)

See `docs/CONVENTIONS.md` § Allowed libraries. Adding new libraries requires updating CLAUDE.md §0 #5 + a phase note.
