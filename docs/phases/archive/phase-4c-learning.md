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

### M28 — Business email discovery (B2C reachability)

User-reported: B2C categories (restaurants, salons, single-location HVAC) couldn't be pitched because Apollo's data is B2B-leaning — "owner" of a hair salon isn't on LinkedIn so people-search returns nothing. The `require_linkedin` filter became a proxy for "we can find an email", which dropped real targets.

Fix: scrape the prospect's own website during enrichment. Most B2C SMBs publish a contact email (`info@medspa.com`, `hello@hairsalon.com`) somewhere on the homepage.

Migration `20260425220000_email_discovery.sql`:
- `prospects.email_source text` — `'website_scrape'` | `'apollo'` | null
- `prospects.email_confidence text` — `'verified'` (matches business domain) | `'guessed'` (different domain, e.g. owner's Gmail) | null
- `icp_profile.require_reachable boolean` — new hard filter that passes if the prospect has ANY usable contact path

`lib/email-discovery.ts` (pure functions): `extractEmailsFromHtml` pulls every `mailto:` link + plaintext email-regex match. `pickBestEmail` filters out vendor-platform addresses (Squarespace, Wix, Calendly form noise via a domain blacklist), prefers emails that match the business's registrable domain, and ranks by localpart (`owner` > `hello` > `contact` > `info` > `admin` > rest).

`lib/enrich.ts` calls these after the homepage HTML parse and writes the result to `prospects.email` only if it's currently empty (preserves anything an Apollo reveal already populated).

`app/api/pitches/[id]/send/route.ts` recipient priority:
1. Apollo primary contact with revealed email (best — has a first name for personalization)
2. Any Apollo contact with revealed email
3. Business email scraped from the website (B2C fallback — no name)

Unsub token format updated to handle the no-contact case:
- `contact:UUID` — Apollo-discovered contact, look up by id
- `email:address` — business-email recipient, use directly
- bare UUID — legacy tokens still resolve as contact ids

Cron processor `checkSocialIcpGate` now respects `require_reachable`: prospect passes if any contact email exists, OR `prospects.email` is set, OR `prospects.phone` exists.

ICP form gets the new toggle ranked first as the recommended option, with copy steering users away from `require_linkedin` toward `require_reachable` for B2C-friendly ICPs.

Deferred: Hunter.io / Snov.io paid email lookup as a fallback when website scraping returns nothing. Skipped for now per user direction — measure organic coverage first.

### M29 — Pre-batch ICP enforcement (rating / reviews / business_status)

User-reported: even with min_gmb_rating + min_review_count set in ICP, leads coming back didn't match. Root cause: those values were passed to the planner as soft hints but never enforced — Google Places returned whatever it returned, including 3-star spots and businesses with single-digit review counts.

Fix: hard pre-filter at batch creation, runs BEFORE inserting any prospect row. New `filterByIcpFloors()` helper in `lib/places.ts` drops anything matching ANY of:
- `rating < icp.min_gmb_rating`
- `rating == null` AND `min_gmb_rating` is set (unknown quality fails strict mode)
- `user_ratings_total < icp.min_review_count`
- `business_status !== 'OPERATIONAL'` (closed permanently or temporarily)

Applied at both batch entry points: `POST /api/batches` (manual) and `lib/plans.ts::createBatchForPlanItem` (plan execute). Order: fetch from Places → ICP floor filter → duplicate filter → take top `count`.

Migration `20260425230000_batch_filter_counts.sql` adds two columns to `batches`:
- `count_filtered_below_icp int`
- `count_duplicates_skipped int`

Both persist on the row at create time so the batch detail UI can answer "why fewer prospects than I asked for?" weeks after the fact, not just in the create-response toast.

Batch detail UI shows a sub-line under the progress count: "Dropped at import: N below ICP floor · M already in your system". Hidden when both counts are zero.

Honest tradeoff: strict ICP + thin city supply = small batches. That's the correct behavior — better than silently importing junk that wastes enrich + analyze + audit + pitch budget. If supply is consistently too thin, next move would be Google Places pagination (3× more candidates per search) — not yet built, deferred until volume warrants.

### M30 — Places pagination + over-fetch + phone pre-filter

User-reported (immediately following M29): "plan says 50 prospects but executing only delivers ~10." Two compounding causes:

1. **No pagination.** `searchPlaces` hardcoded `pageSize: 20` and never read `nextPageToken`. So a `count: 50` plan item could never see more than 20 candidates from Google. After ICP floor + dedup + post-enrichment social filters, ~6-10 active leads was the realistic ceiling.
2. **Phone filter fired late.** `require_business_phone` was checked in cron `checkSocialIcpGate` even though Google Places returns `nationalPhoneNumber` in the search response. Wasted enrichment budget on prospects we already knew would fail.

Fix:

- **`searchPlaces(category, city, desiredCount)`** — new optional 3rd argument. Function paginates via `nextPageToken` until it has `min(desiredCount × 2, 60)` candidates or pages run out. Hard ceiling 60 (Places New maximum). Default behavior when `desiredCount` is omitted is unchanged (20).
- **`X-Goog-FieldMask`** now includes `nextPageToken` so Places returns the token for chained requests.
- **`filterByIcpFloors`** gains optional `require_phone` flag. When true, drops places with no `nationalPhoneNumber` before insert. Counted into `count_filtered_below_icp` like the rating/review/status drops.
- **Both call sites updated** (`POST /api/batches` and `lib/plans.ts::createBatchForPlanItem`) to pass the requested count and pull `require_business_phone` from the ICP profile.
- **Cron `checkSocialIcpGate`** unchanged — still has phone in its `missing[]` list as defense-in-depth, but that branch is now effectively dead code on the happy path. Left in deliberately; running it costs nothing and protects against future flows that bypass `filterByIcpFloors`.

What this fixes: a 50-prospect plan item now actually attempts to deliver 50, by fetching up to 60 raw candidates and filtering them down. With moderate ICP floors (4.0 rating, 20 reviews) typical yield should now hit 30–40 active leads where it was 6–10 before.

What this does NOT fix: `require_linkedin / require_instagram / require_facebook / require_reachable` still drop leads AFTER enrichment because they need a website scrape to evaluate. If all four are toggled on, expect another 30–60% post-enrichment drop. Honest answer to that gap is option (b) from the design discussion: keep enriching extra candidates from the Places result until target N active is reached. Deferred — measure first, we may not need it.

Cost impact: a 50-count batch now does up to 3 Places Text Search calls instead of 1. Places New billing for Text Search Pro (with our field mask) is ~$32/1k → +~$0.064 per heavy batch. Negligible vs. the enrichment + analyze + pitch budget downstream.
