# Phase 10A — Deal pipeline + kanban DnD

**Status:** shipped 2026-05-04
**Goal:** add a real CRM funnel dimension distinct from `outreach_status` (last-call outcome) and `prospects.status` (cron pipeline stage). Users drag prospects across funnel stages on `/leads` kanban; planner + dashboard read the new column.

## What shipped

### M64 — Schema (`20260505000000_deal_stage.sql`)

- `prospects.deal_stage` text column (default `'lead'`) + `deal_stage_changed_at` timestamptz.
- Free-form text not enum so adding a stage doesn't require a migration; UI gates the canonical 7 values.
- 7 stages: `lead → contacted → qualified → meeting → proposal → won` plus terminal `lost`.
- Backfill at migration time:
  - prospects with sent_emails → `'contacted'`
  - `outreach_status='qualified'` → `'qualified'`
  - `outreach_status in (not_interested, do_not_contact)` → `'lost'`
  - `deal_stage_changed_at` backfilled to latest `sent_at` (or `created_at` fallback) so the activity feed isn't flooded with "now" entries.
- Index on `deal_stage` for kanban grouping + dashboard tile counts.

### M65 — Types + service + API

- `DealStageSchema` (Zod enum) added to `lib/types/prospect.ts`.
- `ProspectSchema`, `ProspectLeadRowSchema`, `LeadSchema`, `ProspectDetail` extended with `deal_stage` + `deal_stage_changed_at`.
- `prospectsService.setDealStage` validates + writes via `dbProspects.update`. RBAC gated by `canSetOutreachStatus` (anyone who can record a call outcome can advance the funnel).
- `/api/prospects/[id]` PATCH route accepts `deal_stage` in the bundle body.
- `useLeads` SELECT extended to include `deal_stage`.

### M66 — Kanban DnD on `/leads`

- Added `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (~12 KB raw to the /leads bundle, +6 KB net after gzip).
- New "Group by: Outreach / Pipeline" toggle, only visible in kanban mode.
- New `KanbanGroupBy` type added to `lib/types/views.ts`; `SavedView` shape gains an optional `groupBy` field so a saved "pipeline view" reopens with the right grouping. Default `outreach_status` (preserves M37 behavior).
- `KanbanBoard` rewritten as a `DndContext` with seven (`deal_stage`) or nine (`outreach_status`) droppable columns + draggable cards. PointerSensor with 5px activation distance — small clicks still navigate to the detail page; only an actual drag fires a move.
- `useMoveLead` mutation in `lib/queries/leads.ts`: optimistically re-buckets the lead in the `['leads']` cache, PATCHes `/api/prospects/[id]` with whichever of `outreach_status` / `deal_stage` changed, rolls back on failure, invalidates both `['leads']` and the prospect aggregate.
- `KanbanCard` renders as `<Link>` (navigates on click) when not dragging, swaps to `<div>` while dragging so the pointerup doesn't trigger navigation.

## Locked decisions

- `deal_stage` is text (not Postgres enum) — same pattern as `outreach_status` (M36). New stages added without a migration.
- The 7-stage funnel matches typical agency sales: `lead → contacted → qualified → meeting → proposal → won` + terminal `lost`. `won` and `lost` are excluded from "active funnel" counts on the dashboard.
- Auto-bumps were considered (e.g. `outreach_status='qualified'` → `deal_stage='qualified'`) but deliberately deferred — felt too magical at this scale; user moves stages manually for now.
- Kanban DnD lib choice: `@dnd-kit` (modern, accessible, ~12 KB) over `react-beautiful-dnd` (deprecated).
- The `/leads` kanban was extended rather than building a dedicated `/pipeline` route. Re-uses saved-views, filters, assignee picker, search.

## Post-ship hygiene (M67–M71, same week)

These shipped as fast follow-ups to Phase 10A in the days after 10A landed. Same module, same surface area.

- **M67 — Lock signup behind invite token.** `/signup` rejects standalone visits and requires `?token=...`. New public `/api/team/invites/check` validates the token before showing the form. `/invite/[token]` redirects unauthenticated visitors to `/signup?token=...` instead of `/login`. `/login` dropped its "Sign up" link. New `/no-team` landing for orphan auth accounts. `lib/team.ts:resolveUserTeamId` no longer auto-creates personal teams — returns a `NO_TEAM` sentinel; `requireTeamAccess` maps to `ForbiddenError`. Dashboard layout probes `/api/team`; 403 → redirect to `/no-team`. Closed a real security gap: anyone with the URL could self-signup + auto-provision a team.
- **M68 — Lead-data cleanup.** Wiped batches/prospects/jobs/pitches/sent_emails/enrichments/analyses/contacts/audits/recommendations/notes/followups/lead_plans/lead_plan_items. Kept teams + members + ICP + email_accounts.
- **M69 — Up to 2 owners per team.** Migration adds a BEFORE INSERT/UPDATE trigger on `team_members` rejecting any state with >2 owners. `RoleChangeInputSchema` accepts `'owner'` so promotion/demotion happens through the same PATCH route. `changeMemberRole` rewritten with the cap + last-owner protection + self-step-down support. Settings/team UI: "X of 2 owners" header, Promote-to-owner / Demote-to-manager / Step-down buttons. Dropped legacy `team_members_one_owner_idx` (was hard-locking the team to 1 owner; the trigger is now the sole source of truth).
- **M70 — Team-scoped Zoho.** Migrated `email_accounts` from per-`(user_id, email)` to per-`(team_id, provider)` unique key. Both owners now see the same connected mailbox. `email_accounts.user_id` kept as audit ("connected_by"). Zoho callback upserts on `(team_id, provider)`. /settings/email Connect + Disconnect tightened to owner-only (was owner+manager).
- **M71 — Team progress card on `/dashboard`.** Owner + manager only. Per-member roll-up: leads owned / sent / opened / replied / won (last 30 d, except `won` which is total). Unassigned bucket included. New `getTeamProgress` service (manager-only RBAC), `/api/team/progress` route, `useTeamProgress` hook with `enabled: false` for non-qualifying roles so no 403 spam.
- **Nav-RBAC follow-up.** OUTBOUND_NAV gained per-role `roles` allow-lists: Plans/Batches/ICP gated to the `createWork` set (owner/manager/lead_gen); Email gated to owner only; Dashboard/Leads/Team gated to outbound roles only (excluding bidder once that role landed in M72). Closers + cold_callers see only Dashboard/Leads/Team.

## Carry-forward

- Auto-bump rules (e.g. reply classification → deal_stage) deferred to a future Phase 10C.
- Audit log for stage changes deferred to Phase 10B.
- Stage transition validation (can't skip from `lead` to `won`) deliberately not enforced — rare enough to handle by convention.
