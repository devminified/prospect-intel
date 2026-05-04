# Phase 9 — finish the architecture migration

**Status:** shipped 2026-05-04
**Goal:** close the gaps Phase 8 left: routes still on the legacy auth/parse pattern, pages still mixing data-fetching with UI, types living inline next to consumers, and `lib/*.ts` files that didn't fit the new layer model.

## What shipped

### M60 — Route migration to `withAuth` + services

All user-facing API routes now use `withAuth` and delegate to a service module. Ten routes converted:

- `/api/performance` GET → `performanceService`
- `/api/prospects/[id]/discover-contacts` POST → `contactsService.discover`
- `/api/prospects/[id]/recommend-channel` POST → `recommendationsService.recommend`
- `/api/prospects/[id]/regenerate-pitch` POST → `pitchesService.regenerate`
- `/api/prospects/[id]/contacts/[contactId]/reveal` POST → `contactsService.revealEmail`
- `/api/plans` POST → `plansService.generate`
- `/api/plans/[id]/execute` POST (item + full) → `plansService.executeItem` / `execute`
- `/api/batches` POST → `batchesService.create`
- `/api/pitches/export` GET → `pitchesService.exportApprovedCsv` (returns `text/csv` via custom Response)
- `/api/pitches/[id]/send` POST → `pitchesService.send`

Routes that intentionally remain on the legacy pattern: `auth/*` (OAuth flow, no Bearer), `cron/*` (CRON_SECRET-gated), `test/*` (CRON_SECRET-gated debug), `track/open` (public pixel), `unsub` (public token).

### M61 — `lib/` reorganization

Mechanical moves into proper homes:

- `lib/places.ts` → `lib/places/index.ts`
- `lib/lusha.ts` → `lib/lusha/index.ts`
- `lib/enrich.ts`, `lib/analyze.ts`, `lib/audit.ts`, `lib/pitch.ts`, `lib/recommend.ts` → `lib/pipeline/{name}.ts`
- `lib/plans.ts` → `lib/pipeline/plans.ts`
- `lib/contacts.ts` split: pure Apollo HTTP into `lib/apollo/index.ts`, contact-row orchestration kept at `lib/contacts/index.ts`. Apollo can now be swapped without touching the orchestration layer.
- `lib/email/`, `lib/scrape/`, `lib/llm/` folder shells already existed from earlier passes — confirmed nothing was outside them.

Helpers that stay flat: `lib/booking-platforms.ts`, `lib/email-discovery.ts`, `lib/seasonality.ts`, `lib/prompts.ts`, `lib/auth-headers.ts`, `lib/api-client.ts`, `lib/errors.ts`.

### M62 — Custom hook internals on TanStack

`lib/hooks/use-{notes,followups,contact-mutations}.ts` rewritten to use TanStack mutations + optimistic updates internally. Public API unchanged so the prospect detail page didn't have to be rewritten — still the path of least risk for that 1500-line page.

### M63 — Page migrations + type extraction sweep

Six pages migrated from direct `supabase` + ad-hoc `fetch` to TanStack hooks:

- `/batches` → `useBatches`, `useCreateBatch`
- `/plans` → `usePlans`, `usePerformance`, `useGeneratePlan`
- `/plans/[id]` → `usePlanDetail`, `useExecutePlan`
- `/settings/icp` → `useIcp`, `useSaveIcp`
- `/settings/email` → `useEmailAccount`, `useUpdateSignature`, `useUpdateCap`, `useDisconnectEmailAccount`
- `/settings/team` → `useCurrentTeam`, `useRenameTeam`, `useCreateInvite`, `useRevokeInvite`, `useChangeMemberRole`, `useRemoveMember`, `useTransferOwnership`

Type extraction sweep — every inline `interface`/`type` in pages, queries, and routes moved into `lib/types/`:

- `lib/types/views.ts` (new) — `Lead`, `ProspectLite`, `DashFollowup`, `ActivityEvent`, `DashboardData`, `BatchListRow`, `BatchHeader`, `BatchProspect`, `BatchDetail`, `StageKey`, `ViewedKey`, `SortKey`, `ViewMode`, `SavedView`, `PlanListRow`, `PerformanceRow`, `PlanDetail`, `PlanItem`, `PlanWithItems`, `GeneratePlanResponse`, `ExecutePlanResponse`
- `lib/types/prospect-detail.ts` (new) — `DetailPainPoint`, `ProspectContact`, `DetailVisibilityAudit`, `ChannelRecommendationView`, `SentEmailDetail`, `SentEmailLite`, `ProspectActivityEvent`, `ProspectDetail`
- `lib/types/email-account.ts` (new) — `EmailAccount`, `EmailSignaturePatch`
- `lib/types/job.ts` (new) — `Job`, `JobType`, `JobStatus`
- `lib/types/team.ts` extended — `TeamView`, `CreateInviteResponse`
- `lib/types/icp.ts` extended — `IcpFormState`, `IcpResponse`
- `lib/types/batch.ts` extended — `CreateBatchClientInput`, `CreateBatchResponse`

Result: zero inline interfaces remain in pages or query modules. Only one inline type left in the app — `type Status` in `app/invite/[token]/page.tsx`, a local 6-state UI machine. That stays inline by design.

## Locked decisions

- M60 routes are the only ones migrated. `cron/`, `test/`, `track/`, `unsub` stay on existing patterns deliberately — they have non-Bearer auth modes that don't fit `withAuth`.
- `lib/plans.ts` became `lib/pipeline/plans.ts` rather than `lib/services/plans.ts` — it's pipeline-stage logic invoked from cron + the planner service.
- The prospect detail page (1500+ lines) was NOT rewritten end-to-end. M62 made the underlying hooks TanStack-backed, so the page now benefits from cache invalidation and optimistic updates without a risky full rewrite. Carry-forward for a future phase if it ever becomes painful again.
- "Types live in `lib/types/`, never inline" is now an enforced convention — see CONVENTIONS § Layered architecture.

## Carry-forward

- Full prospect detail page rewrite (still). Three blockers documented in Phase 8 archive.
- `lib/hooks/use-{notes,followups,contact-mutations}.ts` could be deleted if/when the prospect detail page is rewritten — but they currently provide useful structural decomposition and are TanStack-backed under the hood.
