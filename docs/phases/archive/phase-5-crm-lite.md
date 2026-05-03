# Phase 5 — CRM-lite layer (M37–M40)

**Status:** Shipped 2026-05-03.

**What it is:** After ~1 week of dogfood, the batch-centric layout didn't scale — every morning required opening 5+ batches to find today's follow-ups, and there was no place to leave context (notes / call outcomes / next-step reminders). Phase 5 added a thin CRM-style layer over the existing tables.

## Milestones

### M37 — Global `/leads` view
- Single page lists all prospects across batches (RLS-filtered).
- Filter chips: stage (No outreach / In contact / Opened / Replied / Call phase / All) + outreach_status dropdown + viewed/unviewed dropdown.
- Search by name / website / city / category.
- Sort: score / last activity / unviewed-first / newest.
- View toggle: list or kanban grouped by `outreach_status` (visual grouping only, no DnD yet).
- Saved views in `localStorage` per browser. Add / apply / delete pills.

### M38 — Notes + activity timeline
- New `prospect_notes` table (id, prospect_id, user_id, body, created_at, updated_at). 10k char body cap. RLS via prospect→batch chain.
- POST/GET on `/api/prospects/:id/notes`; PATCH/DELETE on `/:noteId`.
- Notes card on prospect detail (add via textarea, inline edit, delete with confirm).
- Activity timeline card unifies prospect.created_at + notes + all sent_emails + email_opens (real / MPP / self labeled differently) + email_replies (color-coded by Haiku classification). Vertical-line + dot motif.

### M39 — Follow-up reminders + ICS calendar (Path A)
- New `prospect_followups` table (id, prospect_id, user_id, due_at, note, done, done_at, created_at). Indexed on (prospect_id, done, due_at) for the per-prospect card and (user_id, done, due_at) for global "due today" queries.
- POST/GET on `/api/prospects/:id/followups`; PATCH/DELETE on `/:fid`. PATCH supports due_at/note/done independently.
- New `lib/ics.ts` builds RFC 5545 VEVENT strings. Triggers a Blob download client-side — no auth round-trip needed since the followup is already loaded in the page. Filename slugged from prospect name.
- Follow-ups card on prospect detail (3-col layout: Notes / Follow-ups / Activity). Datetime-local input + optional note. Optimistic done toggle. Visual states: today (blue), overdue (red), done (line-through + dimmed). "Add to calendar" button per active followup.
- Activity timeline extended with `Follow-up scheduled` and `Follow-up completed` events.

### M40 — `/dashboard` at-a-glance home
- New `/dashboard` route in nav (first item). RLS-filtered cross-prospect rollup of everything from M37–M39.
- **Today's follow-ups card** — three buckets (Overdue / Due today / Upcoming next 5). Each row links to the prospect, shows due time + name + note. Color-coded per bucket.
- **Pipeline tiles** — six clickable Tile cards (Total / No outreach / In contact / Opened / Replied / Call phase). Each deep-links to `/leads?stage=...`. Counts derived from the same outreach-state aggregator used in `/leads`.
- **Recent activity feed** — last 20 events across all prospects. Aggregates sent_emails, email_opens (real only), email_replies (with classification), prospect_notes, prospect_followups. Each row links to the prospect.
- `/leads` updated to read URL params (`stage`, `outreach`, `viewed`, `sort`) so dashboard tiles deep-link correctly.

## Key decisions (carry forward)

- **Saved views in localStorage, not DB.** Solo single-browser use case. Revisit if multi-device or team support comes online.
- **No drag-and-drop on the kanban.** Visual grouping is the value; outreach_status changes happen on the prospect detail page where context is already loaded.
- **ICS calendar over Google OAuth two-way sync (Path A from design discussion).** Path B (full Google Calendar OAuth) is 2-3× the work and provides marginal value for solo use. ICS works with any calendar.
- **`prospects.outreach_status` orthogonal to automatic `prospects.status`.** The pipeline status is set by cron jobs as work progresses; outreach_status is the user's manual annotation. Both can coexist.
- **Activity feed derived, not logged.** No new audit table for status changes — events come from existing tables (sent_emails, email_opens, etc.) plus the two new tables (notes, followups).

## Data model additions

- `prospect_notes` — id, prospect_id, user_id, body, created_at, updated_at.
- `prospect_followups` — id, prospect_id, user_id, due_at, note, done, done_at, created_at.
- `prospects.outreach_status` (M36, free-form text whitelisted in API). `prospects.last_viewed_at` (M36).

## Migrations

- `20260429000000_outreach_state.sql` — M36, prospects.outreach_status + last_viewed_at.
- `20260503000000_prospect_notes.sql` — M38.
- `20260503010000_prospect_followups.sql` — M39.

## How to verify it's working

- Open `/dashboard` after login. Should render KPI counts that match the totals in `/leads`.
- Click "No outreach" tile → lands on `/leads?stage=no_outreach` with that filter pre-selected.
- Open any prospect → add a note, schedule a follow-up for tomorrow at 10am, click "Add to calendar" → `.ics` downloads and opens in your calendar.
- Mark the follow-up done → it crosses out and gets dimmed; activity feed shows the completion event.

## Explicitly deferred

- Drag-and-drop on the kanban (status changes via DnD).
- Saved views synced to DB (cross-device).
- Google Calendar OAuth two-way sync.
- Per-status SLA / aging warnings ("this prospect has been in 'follow_up' for 12 days").
- Multi-user / team accounts.
- Deal pipeline with stage values + close dates (would be Phase 6 if business model warrants).
