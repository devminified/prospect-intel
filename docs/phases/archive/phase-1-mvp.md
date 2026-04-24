# Phase 1 — MVP (M1–M10)

**Status:** Shipped. Dogfooded on real batches. Pipeline is stable.

**What it is:** User logs in → picks a city + business category + count → app pulls businesses from Google Places (swapped from HERE in M11), visits each website, extracts tech signals (no booking, no chat, no e-commerce), asks Claude to identify pain points, asks Claude to write a 4-sentence cold email per prospect. User reviews, edits, copies into Instantly/Smartlead.

The magic: **evidence-backed specificity** — every pitch references something concrete about that specific business.

## Milestones

### M1 — Skeleton
- `create-next-app`, Tailwind, Vercel deploy, Supabase project, initial migration
- ✅ Empty app loads at Vercel URL

### M2 — Auth
- Supabase Auth email/password, `/login`, `/signup`, auth guard on `(dashboard)` layout
- ✅ Sign up, log in, logout works

### M3 — Places fetch
- `lib/places.ts` (originally HERE, later Google) — search + details
- `POST /api/batches` creates batch + prospect rows + one `enrich` job per prospect
- Minimal form on `/batches`
- ✅ Submitting "restaurants in Austin" creates batch + N prospect rows

### M4 — Enrichment
- `lib/enrich.ts` — fetch HTML, Cheerio parse, write `enrichments` row
- Detectors: CMS (WordPress/Shopify/Wix/Squarespace), booking (Calendly/Acuity/OpenTable/Resy/Square), ecommerce, chat (Intercom/Drift/tawk/Zendesk), contact form, mobile viewport, SSL, homepage text (first 3000 chars)
- 8-second fetch timeout. On failure, write `fetch_error` and continue.
- ✅ Enrich one real prospect → populated row

### M5 — Claude analysis (Haiku)
- `lib/analyze.ts` — Haiku call, strict JSON output, retry once on parse failure
- Temperature 0.3
- ✅ Produces ≥1 pain point with concrete evidence

### M6 — Claude pitch (Sonnet)
- `lib/pitch.ts` — Sonnet call, writes to `pitches`
- ✅ Pitch references specific evidence from analysis

### M7 — Cron processor
- `GET /api/cron/process` — atomic claim (update…returning) of up to 10 pending jobs, dispatch by `job_type`, chain next stage on success, exponential retry (3 attempts) on failure, mark batch done when all jobs terminal
- `vercel.json` cron every 2 min (Pro plan)
- ✅ Submit 5-prospect batch → all 5 have pitches within 10 min

### M8 — Dashboard UI
- `/batches` list + form, `/batches/[id]` prospects sorted by `opportunity_score`, `/prospects/[id]` 3-panel (signals / analysis / pitch) with inline edit + Copy + Approve
- Status dropdown: new → ready → contacted → replied/rejected
- ✅ Full click-through end to end

### M9 — CSV export
- `GET /api/pitches/export?batch_id=…` returns CSV (name, website, email, subject, body, phone)
- Filters `status = 'approved'`
- ✅ Download + open in sheets, columns correct

### M10 — Dogfood
- Ran real batches in cities the user cared about. Every pitch reviewed by hand.
- Surfaced issues that became Phase 2/3: HERE returned 3 med spas in Austin (unusable — triggered swap to Google), Wix/Squarespace sites returned empty homepage text (triggered ScrapingBee fallback).
- ✅ ≥80% of pitches referenced something real

## Original prompts (now in `lib/prompts.ts`)

Analysis prompt (Haiku) returns strict JSON: `{pain_points: [{pain, evidence, solution_category, effort, impact}], opportunity_score, best_angle}`. Rules: max 3 pain points, every pain needs concrete evidence, never invent facts.

Pitch prompt (Sonnet) returns `{subject, body}`. 4 sentences max, under 80 words, subject under 6 words, references the specific evidence. Forbidden: "I help businesses like yours", "synergy", "leverage", "cutting-edge", "solutions provider".

Full current prompt bodies live in `lib/prompts.ts` — always the source of truth.

## Definition of Done (Phase 1) — all met

- New user could sign up, log in, create a batch
- 10-prospect batch produced 10 pitches in 15 min
- Each pitch referenced ≥1 verifiable fact
- Edit → approve → CSV export worked
- Ran on Vercel with no local deps
- Monthly cost at 500 prospects < $120

## Carry-forward decisions

- Monolith Next.js — no microservices, no separate backend, no queue beyond the `jobs` table
- Supabase for DB + Auth, service role key SERVER ONLY
- Direct Anthropic SDK calls — no LangChain or other abstraction
- Background jobs via Vercel Cron hitting `/api/cron/process` every 2 min
- Every job processes ONE prospect, must finish under 30 seconds
- RLS enabled on every table, policies chain to `auth.uid()` through foreign keys
