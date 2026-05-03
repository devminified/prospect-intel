# Current phase

**Active:** none. Phases 1 → 5 all shipped. Last milestone: M40 on 2026-05-03.

The full outbound + CRM-lite loop now works end-to-end:

```
plan (Opus, outcome-weighted) → enrich → analyze → pitch
  → send via Zoho → track opens → detect replies → classify
  → feed back into tomorrow's plan

  ↓ user-facing layer (Phase 5):
/dashboard      KPI tiles + today's followups + activity feed
/leads          cross-batch filter/sort/kanban + saved views
/prospects/:id  notes + followups + activity timeline + ICS download
```

**Candidates for Phase 6 (not prioritized):**
- **Drag-and-drop kanban** — change `outreach_status` by dragging cards between columns on `/leads?view=kanban`.
- **DB-synced saved views** — replace localStorage so views follow you across devices.
- **Per-status aging warnings** — "this prospect has been in 'follow_up' for 12 days, did you forget?"
- **Google Calendar OAuth (Path B)** — two-way sync of follow-ups, would replace ICS download for users who want it.
- **Deal pipeline** — value, expected close date, weighted forecast. Only if business model warrants.
- **M27 Google Trends/News momentum** — still deferred from Phase 4C; revisit if reply-loop signal plateaus.
- **Second sender domain** if daily volume exceeds 50/day.
- **A/B test framework for pitch prompts.**

When a new phase starts, replace this file's contents with:
- Goal + why now
- Milestone list with verification criteria
- Locked decisions (in scope vs explicitly deferred)
- Budget expectations

When the phase ships, compress this file to ≤ 20 lines, move the full spec to `archive/phase-N-<name>.md`, and return this file to the standby state above.
