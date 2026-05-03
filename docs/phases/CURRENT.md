# Current phase

**Active:** Phase 5 — CRM-lite layer over the outbound loop.

After ~1 week of dogfood, two pain points: (1) leads are batch-organized but not stage-organized, so finding "who do I follow up with today" requires opening every batch; (2) no place to leave context (notes, activity timeline) on a prospect.

## Phases (ship in order)

### 5A — Global lead view (in progress, M37)
- New `/leads` page lists all prospects across batches.
- Filter chips: stage (No outreach / In contact / Opened / Replied / Call phase / All) + outreach_status dropdown + viewed/unviewed.
- Search by name / website / city / category.
- Sort: score / last activity / unviewed-first / newest.
- Toggle: list view vs kanban grouped by `outreach_status`.
- Saved views in `localStorage` (per-browser) — pin filter combos like "My follow-ups".

### 5B — Notes + activity timeline
- New `prospect_notes` table (id, prospect_id, body, created_at, created_by).
- Notes section on prospect detail page (add / edit / delete).
- Activity timeline unifying sent_emails + email_opens + email_replies + status changes + notes + phone reveals.

### 5C — Follow-up dates + ICS calendar (Path A)
- New `prospect_followups` table (date, note, done flag).
- "Due today" / "Overdue" widget on dashboard + prospect detail.
- Generate `.ics` download per follow-up so user can add to any calendar (Google / Apple / Outlook). No OAuth.

### 5D — Dashboard with at-a-glance counts
- KPI tiles linking into `/leads` filtered.
- Recent activity feed.
- Today's plan summary.

## Explicitly deferred (NOT in Phase 5)
- Drag-and-drop on the kanban (visual grouping only for now).
- Saved views in DB / cross-device sync (localStorage is fine for solo).
- Google Calendar OAuth two-way sync (Path B from design discussion).
- Full deal pipeline with stage values + close dates.
- Multi-user / team accounts.

## Budget expectations
- Phase 5 is purely UX work + a couple small tables. No new external APIs, no new credits.
- Total estimated work: ~2.5 days.

When Phase 5 ships, compress this to ≤ 20 lines, move the full spec to `archive/phase-5-crm-lite.md`, and reset.
