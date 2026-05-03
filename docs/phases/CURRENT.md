# Current phase

**Active:** none. Phases 1 → 8 all shipped. Last milestone: M59 on 2026-05-04.

The codebase now has a layered architecture (UI → queries → services → db → types) with Zod validation at every boundary and TanStack Query for server state on three of four heavy pages. Prospect detail is the one consumer still on the M41 custom hooks — its TanStack migration is the obvious first thing for Phase 9.

```
plan (Opus, outcome-weighted) → enrich → analyze → pitch
  → send via Zoho → track opens → detect replies → classify
  → feed back into tomorrow's plan

  ↓ user-facing layer (Phase 5):
/dashboard      KPI tiles + today's followups + activity feed
/leads          cross-batch filter/sort/kanban + saved views + assignee filter
/prospects/:id  notes + followups + activity timeline + ICS download

  ↓ multi-team (Phases 6+7):
team management with owner / manager / lead_gen / cold_caller / closer
per-lead assignment with My-leads / Unassigned filters
member removal + ownership transfer
RBAC at API + RLS at DB

  ↓ architecture (Phase 8):
typed Zod schemas, db / services / queries layers, thin API routes
```

## Phase 9 candidates (not prioritized)

- **Prospect detail TanStack migration** — last page on the legacy custom hooks. See `archive/phase-8-architecture.md` § Carry-forward for the three blockers.
- **DnD kanban** on `/leads?view=kanban` — drag a card between outreach_status columns to update.
- **Per-assignment audit log** — track who assigned what and when (separate table, not just current state).
- **Leave-team self-service** for non-owners.
- **Auto-redistribute leads on member removal** instead of dumping to Unassigned.
- **Per-team email_account ownership transfer.**
- **Deal pipeline** with stage values + close dates. Only if business model warrants.
- **Billing.**
- **Test framework** — deferred from Phase 8 explicitly. Revisit when first multi-team customer hits us.
- **M27 Google Trends/News momentum** — still deferred from Phase 4C; revisit if reply-loop signal plateaus.

When a new phase starts, replace this file's contents with:
- Goal + why now
- Milestone list with verification criteria
- Locked decisions (in scope vs explicitly deferred)
- Budget expectations

When the phase ships, compress this file to ≤ 20 lines, move the full spec to `archive/phase-N-<name>.md`, and return this file to the standby state above.
