# Phase 4C — Learning loop + automation (M25–M26)

**Status:** Shipped 2026-04-25.

**What it is:** The planner stops guessing from seasonality alone and starts weighing real outreach outcomes. Daily plan generation automates at 08:00 UTC.

**Explicitly deferred (originally in 4C scope):**
- **M27 — Google Trends/News momentum via SerpApi.** Dropped at decision time. For SMB services, search-volume trends don't correlate with buying intent, and the M25 reply-outcome signal is a stronger feedback source than proxied search demand. Revisit only if we hit a cold-start problem the reply loop can't solve.
- **Multi-user shared plan calendar.** Still single-user.

## Milestones

### M25 — Reply-outcome feedback into the planner

- **New function** `computeRecentPerformance(userId, daysBack=30)` in `lib/plans.ts`. Aggregates per (category, city): sent count, reply count, interested count, not_interested count, unsub count, plus rates. Source: `sent_emails` joined through `pitches → prospects → batches` with `email_replies.classification`.
- **Prompt update**: `plannerPrompt` gains a `RECENT PERFORMANCE` section + an `OUTCOME-WEIGHTED RANKING` rules block:
  - ≥10% interested on ≥5 sent → rank up
  - ≥20% unsub on ≥5 sent → drop entirely
  - 10+ sent with 0 replies → downrank (try a different city)
  - **Outcomes beat seasonality when they conflict.** Real reply data wins over a calendar heuristic.
  - Opus must cite specific numbers in its reasoning string ("14% interested over 21 sent").
- **New route** `GET /api/performance?days=30` — JWT-gated, returns the same aggregates the planner sees.
- **UI**: `/plans` gets a "Recent outreach performance" card above the plan list. Rows with ≥10% interested on ≥5 sent highlight green; ≥20% unsub highlight red. Caption explains the thresholds.

**Cold start behavior:** empty performance → prompt says "no outreach outcomes yet, rely on seasonality + ICP only". Planner falls back to Phase 4A behavior until data accumulates.

### M26 — Daily 08:00 UTC auto-plan cron

- **New cron** `/api/cron/daily-plan` at `0 8 * * *`. Iterates every `icp_profile`, generates today's plan via `generatePlan(userId)` if one doesn't already exist.
- **Idempotent.** Skips users who already have a `lead_plans` row for today.
- Per-user errors don't fail the whole run — each result is captured in the response.

## Key decisions (carry forward)

- **Performance window** is `PERFORMANCE_LOOKBACK_DAYS = 30` as a constant in `lib/plans.ts`. Change in one place if the window needs to flex.
- **Latest classification wins** when a `sent_email` has multiple `email_replies` rows (e.g., OOO auto-response then a real reply). This matches how a human would interpret the thread: the most recent signal is the state.
- **Planner is told outcomes > seasonality when they conflict.** This is the rule that makes the feedback loop actually loop — without it, the LLM would hedge and the learning would stall.

## Budget impact

- No new external APIs
- Opus 4.7 planner call: same cost (~$0.10/plan)
- Daily auto-gen at 1 user × 1 call/day = ~$3/mo max

## How to verify it's working

After 30 days of real sends + replies:
1. `/plans` shows a populated performance table
2. The next auto-generated plan's rationale references specific interested/unsub rates by (category, city)
3. Green-highlighted rows show up in plan items; red-highlighted combos do NOT

## Post-ship improvements (2026-04-25)

Two quality-of-life gaps closed before the pause for data collection. Not full milestones, just hygiene.

### Duplicate detection on new batches

New `filterDuplicatePlaces()` helper in `lib/places.ts`. Both `POST /api/batches` and `createBatchForPlanItem` (used when executing a plan item) now pre-check Google Places results against existing `prospects.place_id` rows and filter duplicates out before inserting. Response includes `duplicates_skipped` count. Avoids re-paying Google Places + the full pipeline on prospects the user has already seen.

**Known tradeoff:** since `prospects.place_id` is globally unique (not per-user), this dedup is cross-tenant. Single-user today so it's correct. When multi-user ships, the unique constraint + the filter both need to scope by `batches.user_id`.

### Optional ICP hard filters (social presence)

Migration `20260425180000_icp_social_and_filter.sql` adds four booleans to `icp_profile` (`require_linkedin`, `require_instagram`, `require_facebook`, `require_business_phone`) and one column to `prospects` (`filter_reason`).

Gate runs in `app/api/cron/process/route.ts::enqueueNext` at the audit-done → pitch boundary, right after the existing `pitch_score_threshold` check. If any required signal is missing, the prospect's status flips to `filtered_out`, `filter_reason` records why (e.g. "ICP requires LinkedIn + Instagram — none found"), and the pitch job is never enqueued.

- **LinkedIn** passes if business social_links_json.linkedin is set OR any contact has a `linkedin_url`
- **Instagram / Facebook** pass if business-level audit found the respective social link
- **Business phone** passes if `prospects.phone` (from Google Places) is non-null

UI: `/settings/icp` gets a "Hard filters" block with 4 toggle rows + help text. Prospect detail surfaces an amber callout under the header when `status='filtered_out'`, explaining the reason.

Deliberately NOT added: Twitter/X, Threads, TikTok requirements (not useful for B2B SMB outreach). Multi-platform OR logic (kept AND-only for clarity).

### Planner now learns about hard filters at plan time

User-reported: planner kept picking categories where 100% of leads got filtered_out at the audit-done boundary, wasting Google Places + ScrapingBee + Anthropic on doomed batches.

Fix: `plannerPrompt` now receives the four hard-filter booleans and gets explicit per-filter category guidance:
- `require_linkedin: YES` → prefer B2B/professional-services (law firms, accounting, dental, agencies); avoid hyper-local B2C (restaurants, salons, single-location landscaping)
- `require_instagram: YES` → prefer visual consumer categories; avoid dry B2B
- `require_facebook: YES` → minimal restriction (most SMBs have FB)
- `require_business_phone: YES` → virtually all Places have phones; minimal

Multi-filter intersections narrow further (e.g. linkedin + instagram → med spas, full-service agencies; NOT restaurants). When the planner drops a normally-targeted category because of a filter clash, it must mention the dropped category in the rationale so the user understands why their default categories weren't picked.

`lib/plans.ts::generatePlan` now passes `require_linkedin`, `require_instagram`, `require_facebook`, `require_business_phone` to the prompt.

### Self-open detection (sender's own opens no longer inflate counts)

User-reported: opening the Sent folder in Zoho fired the tracking pixel, counting as a recipient open and inflating real-open numbers.

Fix: `email_opens.is_probably_self boolean` + `email_accounts.known_self_ips text[]`. Mechanism:
- New route `POST /api/auth/heartbeat` captures the requester IP, prepends to `known_self_ips` for every email account this user owns (cap 10 most-recent, deduped).
- `app/(dashboard)/layout.tsx` calls heartbeat once on mount inside the existing auth-resolution effect. Best-effort, fire-and-forget.
- `/api/track/open/:sent_email_id` joins to `email_accounts` to read `known_self_ips`, sets `is_probably_self=true` if request IP matches.
- Prospect detail open count now excludes BOTH `is_probably_mpp` AND `is_probably_self`. Both sub-counts surface separately for transparency: "5 opens (+2 likely MPP, +1 self)".

This catches any opens that arrive from the user's known IPs — Sent folder views, browser previews, accidental self-opens. Recipient opens from real prospect IPs continue to count normally.
