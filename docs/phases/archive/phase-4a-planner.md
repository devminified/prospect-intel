# Phase 4A — Daily lead planner (M20)

**Status:** Shipped and dogfooded on 2026-04-24.

**What it is:** Instead of the user deciding each morning which city + category to batch, a plan pops up saying *"Today, run these 3–5 batches for these reasons."* User reviews, clicks Execute, the existing pipeline runs them.

**Scoped tight on purpose:** only LLM + seasonality + ICP. No Google Trends, no performance-feedback loop, no cron auto-generation, no reply classifier — those are Phase 4B/4C.

## Locked defaults (chosen at ship)

| Decision | 4A default | Revisit |
|---|---|---|
| Live market signals (Trends/News) | skip | 4C |
| Reply tracking | manual status dropdown (existing) | 4B |
| Plan cadence | manual trigger only ("Generate today's plan" button) | 4C (08:00 UTC cron) |
| Auto-execute | per-plan "Execute all" + per-item "Run this one" | — |
| Category scope | unbounded via user's `icp_profile.target_categories` | — |
| Performance feedback to LLM | skip | 4B |
| Daily capacity cap | `icp_profile.daily_capacity` — hard cap across all items in a plan | — |

## Data model added

Migration `20260424120000_plans.sql`:

- `icp_profile` — one row per user (user_id PK). Fields: services[], avg_deal_size, daily_capacity, preferred_cities[], excluded_cities[], min_gmb_rating, min_review_count, target_categories[]
- `lead_plans` — plan_date, status (draft/executed/skipped), rationale_json, user_id FK
- `lead_plan_items` — plan_id FK, city, category, count, reasoning, priority, estimated_cost_usd, batch_id FK (populated after execute), executed_at

RLS on all three, same pattern as batches.

## Seasonality calendar

Hardcoded in `lib/seasonality.ts` — ~50 SMB categories × peak months with rationale. No DB table. Examples:

- `med spas` → peak [4, 5, 10, 11] — pre-summer botox, pre-holiday gifting
- `tax preparation` → peak [1, 2, 3, 4] — Q1 is the entire year
- `landscaping` → peak [3, 4, 5, 9] — spring cleanup + fall prep
- `HVAC` → peak [5, 6, 7, 11, 12] — summer AC + winter heat
- `wedding planners` → peak [1, 2, 8] — engagement season Dec/Jan; 12–18mo lead

Edit by PR.

## Planner prompt (Opus 4.7)

Input: ICP + today's date + seasonality table + recent-batch summaries for light context.

Model: `claude-opus-4-7` with `thinking: {type: 'adaptive'}`, `output_config: {effort: 'medium', format: {type: 'json_schema', schema: ...}}`. Temperature parameter removed on Opus 4.7. Structured output enforces the schema.

Returns `{rationale, items: [{priority, city, category, count, reasoning}]}`.

## Execute flow

`POST /api/plans/[id]/execute` loops items, calls existing batch-create logic for each. Each `lead_plan_items.batch_id` populated. Plan status flips to `executed`. Partial execution allowed via per-item button.

## Deliverables shipped

1. Migration applied, RLS verified
2. `lib/seasonality.ts` seeded
3. `lib/plans.ts` with `generatePlan(userId)` + `executePlan(planId, userId)`
4. `lib/prompts.ts` — `plannerPrompt()` added
5. Three UI pages: `/settings/icp`, `/plans`, `/plans/[id]`
6. Three API routes: `/api/icp` (GET+PATCH), `/api/plans` (POST), `/api/plans/[id]/execute` (POST)

## Dogfood verification (2026-04-24)

ICP filled for a mobile/web + AI agency → "Generate today's plan" returned category recommendations reflecting late April (med spas surfaced for pre-summer botox; wedding planners correctly did not). Execute all created batches in `/batches`; existing pipeline ran them.

## Definition of Done — all met

- New user lands on `/settings/icp`, fills form, saves
- "Generate today's plan" returns 3–5 items with rationale in < 15s
- "Execute" creates batches in `/batches` with planned city/category/count
- Total count across items ≤ `icp_profile.daily_capacity`
- Planner never recommends outside `target_categories` or inside `excluded_cities`
- No cron auto-runs
- Total code including Phase 4A < 7000 lines

## Carry-forward decisions

- Planner runs on **Opus 4.7** — quality of recommendations matters more than cost here; it runs once per day
- Seasonality is **static** in-code. No DB table — friction of PR editing is fine for the size of the catalog
- Daily capacity cap is a **hard** constraint the prompt enforces — not a soft preference
