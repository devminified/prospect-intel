# Current phase

**Active:** Phase 9 — finish the architecture migration that Phase 8 started but didn't complete.

Phase 8 shipped + archived, but it left real gaps: 9 user-facing routes still on the legacy auth/parse pattern, the prospect detail page still on M41 custom hooks, and several legacy `lib/*.ts` files that don't fit the new layer model. Phase 9 closes those gaps.

## Milestones

### M60 — Finish the route migration (this commit)
- ✓ `/api/performance` GET → performanceService
- ✓ `/api/prospects/[id]/discover-contacts` POST → contactsService.discover
- ✓ `/api/prospects/[id]/recommend-channel` POST → recommendationsService.recommend
- ✓ `/api/prospects/[id]/regenerate-pitch` POST → pitchesService.regenerate
- ✓ `/api/prospects/[id]/contacts/[contactId]/reveal` POST → contactsService.revealEmail
- ✓ `/api/plans` POST → plansService.generate
- ✓ `/api/plans/[id]/execute` POST (item + full) → plansService.executeItem / execute
- ✓ `/api/batches` POST → batchesService.create
- ✓ `/api/pitches/export` GET → pitchesService.exportApprovedCsv (text/csv, custom Response)
- ✓ `/api/pitches/[id]/send` POST → pitchesService.send

After M60, every user-facing route uses `withAuth`. The remaining "legacy pattern" routes are all legitimate exceptions: auth/* (OAuth flow, no Bearer), cron/* (CRON_SECRET-gated), test/* (CRON_SECRET-gated debug), track/open (public pixel), unsub (public token redemption).

### M61 — `lib/` reorganization
Move legacy files into proper homes. Mechanical refactor with import updates.
- `lib/places.ts` → `lib/places/index.ts`
- `lib/lusha.ts` → `lib/lusha/index.ts`
- `lib/enrich.ts`, `lib/analyze.ts`, `lib/audit.ts`, `lib/pitch.ts`, `lib/recommend.ts` → `lib/pipeline/{name}.ts`
- `lib/plans.ts` → `lib/pipeline/plans.ts`
- `lib/contacts.ts` → split Apollo client into `lib/apollo/index.ts`; business logic already lives in `lib/services/contacts.ts`
- Helpers stay (`lib/booking-platforms.ts`, `lib/email-discovery.ts`, `lib/seasonality.ts`, `lib/prompts.ts`)
- Update CONVENTIONS.md

### M62 — Prospect detail TanStack migration
Deferred from Phase 8's M58d. Three blockers (custom hooks bundling form+mutation state, optimistic closures over setDetail, dual data flows via load+onChange) need step-by-step rewiring.

### M63 — Cleanup, archive Phase 9
- Delete `lib/hooks/use-{notes,followups,contact-mutations}.ts` (orphan after M62).
- Final CONVENTIONS pass, update CLAUDE.md §6.
- Archive doc.

## Locked decisions

- M60 routes are the only ones being migrated. cron/test/track/unsub stay on their existing patterns deliberately.
- `lib/plans.ts` becomes `lib/pipeline/plans.ts` rather than `lib/services/plans.ts` because it's invoked from cron + the planner service. The service layer wraps it; the file itself is pipeline-stage logic.
- No new features in Phase 9. Deal pipeline / kanban DnD / audit log all wait for Phase 10+.
