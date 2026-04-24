# CLAUDE.md — Prospect Intel Build Instructions

You are building **Prospect Intel**, a cold-outreach tool for a dev + AI automation agency. It finds SMBs with tech gaps, detects the gaps from public signals, and writes custom pitch emails. This file is your source of truth. Read it fully before writing any code.

---

## 0. Rules of Engagement (read twice)

1. **Monolithic Next.js app.** Everything — frontend, API routes, background jobs, DB access — lives in one repo, one deployable unit. No microservices. No separate backend. No queue service beyond what's described here.
2. **Ship the MVP, not the dream.** If a feature is not in §3 (In Scope), do not build it. If you're tempted, stop and ask the user.
3. **Work incrementally.** Build in the order given in §8. Do not jump ahead. After each milestone, run the app and verify the milestone works before moving on.
4. **Ask before assuming.** If an API key, env var, or business decision is missing, stop and ask. Do not invent credentials, placeholder data that looks real, or mock services that pretend to work.
5. **No fancy abstractions.** Plain functions in `lib/`. Plain API routes. Plain SQL. No DI containers, no custom ORMs, no event buses. Supabase client + fetch + Cheerio + Anthropic SDK. That's it.
6. **Deploy early, deploy often.** The empty app goes to Vercel on Day 1. Every milestone ends with a green deploy.
7. **No speculative features.** No "might be useful later" code. Delete it.
8. **Respect the budget.** This is an MVP to validate a hypothesis. Every added library, page, or table needs to earn its place.

---

## 1. What We're Building (plain English)

User logs in → picks a city + business category (e.g., "restaurants in Austin") + a count → the app pulls that many businesses from HERE Maps, visits each website, extracts tech signals (no booking system? no chat? no e-commerce?), asks Claude to identify specific operational pain points, then asks Claude to write a custom 4-sentence cold email per prospect. The user reviews the emails in a dashboard, edits if needed, copies the approved ones, and pastes them into Instantly/Smartlead for sending. That's the whole product.

The magic is **evidence-backed specificity**: every pitch must reference something concrete about that specific business, not generic agency fluff.

---

## 2. Tech Stack (non-negotiable)

| Layer           | Tool                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| Framework       | Next.js 14 (App Router), TypeScript, Tailwind                                              |
| Hosting         | Vercel                                                                                     |
| DB + Auth       | Supabase (Postgres + Supabase Auth)                                                        |
| Prospect source | HERE Maps API — Geocode + Discover + Lookup                                                |
| Scraping        | Native `fetch` + `cheerio` (NO Playwright, NO Puppeteer)                                   |
| LLM             | `@anthropic-ai/sdk` — Haiku 4.5 for analysis, Sonnet 4.6 for pitches                       |
| Background jobs | Vercel Cron hitting `/api/cron/process` every 2 min                                        |
| UI components   | Plain Tailwind. No shadcn, no Radix, no component library unless the user explicitly asks. |

Model strings (use exactly these):

- Haiku: `claude-haiku-4-5-20251001`
- Sonnet: `claude-sonnet-4-6`

---

## 3. Scope

### ✅ In scope — build these, in this order

- Supabase auth (email/password), single user for now
- Batch creation: city + category + count
- HERE Maps fetch → write `prospects` rows
- Website enrichment via fetch + Cheerio
- Claude analysis → structured pain points JSON
- Claude pitch generation → subject + body
- Cron-driven job processor
- Dashboard: batches list, prospects list (sortable by score), detail view with inline edit + copy button
- CSV export of approved pitches

### ❌ Out of scope — do NOT build

- Auto-sending emails (user pastes into Instantly manually)
- Playwright / headless browser rendering
- Review scraping, job post scraping, social media scraping
- Multi-tenant / team accounts
- Stripe / billing
- Analytics beyond "how many sent / replied" counters
- Custom auth — use Supabase Auth as-is
- Email tracking pixels
- A/B test frameworks
- Any LLM abstraction library (LangChain, etc.) — call the SDK directly

---

## 4. Architecture (keep it boring)

```
Browser
  │
  ▼
Next.js on Vercel (one app)
  ├── app/(dashboard)/...   ← UI pages (server + client components)
  ├── app/api/...           ← API routes (serverless functions)
  ├── lib/                  ← shared logic, called by API routes
  └── vercel.json           ← cron config
       │
       ▼
  Vercel Cron → GET /api/cron/process (every 2 min)
                  ├─ picks up to 10 pending jobs
                  ├─ processes each: enrich | analyze | pitch
                  └─ updates job status
       │
       ▼
  Supabase (Postgres + Auth)
       │
       ▼
  External: HERE Maps API, Anthropic API
```

Key constraint: **every job processes ONE prospect and must finish in under 30 seconds.** Never loop over a batch inside one request.

---

## 5. Data Model

Write this as a single SQL migration file in `supabase/migrations/0001_init.sql`. Use `uuid` PKs, `timestamptz` for times, snake_case column names.

```sql
-- batches: one row per user-triggered search
create table batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  city text not null,
  category text not null,
  count_requested int not null,
  count_completed int not null default 0,
  status text not null default 'pending', -- pending | processing | done | failed
  created_at timestamptz not null default now()
);

-- prospects: one row per business found
create table prospects (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  website text,
  email text,
  place_id text unique,
  rating numeric,
  review_count int,
  hours_json jsonb,
  categories_text text,
  status text not null default 'new',
  -- new | enriched | analyzed | ready | contacted | replied | rejected
  created_at timestamptz not null default now()
);

-- enrichments: one row per prospect, filled after website fetch
create table enrichments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  tech_stack_json jsonb,
  has_online_booking boolean,
  has_ecommerce boolean,
  has_chat boolean,
  has_contact_form boolean,
  is_mobile_friendly boolean,
  ssl_valid boolean,
  homepage_text_excerpt text,
  fetch_error text,
  fetched_at timestamptz
);

-- analyses: Claude's pain-point output
create table analyses (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  pain_points_json jsonb,
  opportunity_score int,
  best_angle text,
  analyzed_at timestamptz
);

-- pitches: the generated email
create table pitches (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  subject text,
  body text,
  edited_body text,
  status text not null default 'draft', -- draft | approved | sent | replied
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz
);

-- jobs: the simple queue
create table jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  job_type text not null, -- enrich | analyze | pitch
  status text not null default 'pending', -- pending | running | done | failed
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on jobs(status, created_at);
create index on prospects(batch_id, status);
```

Enable Row Level Security on every table. Write policies so a user can only see their own batches and anything downstream of them.

---

## 6. Folder Structure

This section reflects the **current** tree as of Phase 4A. See §17 for scaling playbooks (how to add a new pipeline stage, a new external API, a new table, etc.).

```
prospect-intel/
├── app/
│   ├── (auth)/                                       ← public routes, no auth guard
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/                                  ← everything behind auth (layout enforces)
│   │   ├── layout.tsx                                ← session guard + top nav
│   │   ├── batches/
│   │   │   ├── page.tsx                              ← list + create form (+ pitch_score_threshold, auto_enrich_top_n)
│   │   │   └── [id]/page.tsx                         ← batch detail: sorted prospect list + Export CSV
│   │   ├── prospects/[id]/page.tsx                   ← 3-panel (signals / analysis / pitch) + visibility + executives
│   │   ├── plans/
│   │   │   ├── page.tsx                              ← list of daily lead plans
│   │   │   └── [id]/page.tsx                         ← plan detail + Execute all + per-item Run
│   │   └── settings/icp/page.tsx                     ← ICP form (services, capacity, target categories, cities, quality floor)
│   ├── api/
│   │   ├── batches/route.ts                          ← POST: create batch, queue 1 enrich job per prospect
│   │   ├── cron/process/route.ts                     ← GET: atomic claim + dispatch, stuck-job reaper, settle-batch auto-enrich
│   │   ├── icp/route.ts                              ← GET + PATCH (JWT-scoped to auth.uid)
│   │   ├── pitches/export/route.ts                   ← GET: CSV of approved pitches for a batch
│   │   ├── plans/route.ts                            ← POST: generate today's plan via Opus
│   │   ├── plans/[id]/execute/route.ts               ← POST: execute all items (or ?item_id=... for one)
│   │   ├── prospects/[id]/route.ts                   ← PATCH: prospect status, pitch edited_body, pitch status
│   │   ├── prospects/[id]/discover-contacts/route.ts ← POST: Apollo people search (no email credits)
│   │   ├── prospects/[id]/contacts/[contactId]/reveal/route.ts ← POST: Apollo /people/match (1 email credit)
│   │   ├── prospects/[id]/regenerate-pitch/route.ts  ← POST: re-run Sonnet with latest enrichment
│   │   └── test/                                     ← CRON_SECRET-gated per-stage invokers for manual debugging
│   │       ├── analyze-one/route.ts
│   │       ├── audit-one/route.ts
│   │       ├── contacts-one/route.ts
│   │       ├── enrich-demo/route.ts
│   │       ├── enrich-one/route.ts
│   │       └── pitch-one/route.ts
│   ├── layout.tsx                                    ← root <html>
│   └── page.tsx                                      ← redirects "/" → "/batches"
├── lib/
│   ├── analyze.ts                                    ← Haiku 4.5: 3 pain points per prospect
│   ├── audit.ts                                      ← Visibility audit: GMB + social + SerpApi rank + Groq summary
│   ├── booking-platforms.ts                          ← 16 booking-platform regexes + generic Book Now CTA catch-all
│   ├── contacts.ts                                   ← Apollo: discoverPeople (list) + revealEmail (per-contact credit)
│   ├── enrich.ts                                     ← fetch + Cheerio + ScrapingBee AI Extract → tech signals + scraped_data_json
│   ├── errors.ts                                     ← ExternalAPIError (provider-tagged, surfaces in UI + cron last_error)
│   ├── llm/
│   │   └── groq.ts                                   ← Groq client for bulk summarization (visibility summaries only)
│   ├── pitch.ts                                      ← Sonnet 4.6: 4-sentence cold email; upsert so Regenerate works
│   ├── places.ts                                     ← Google Places API (New): Text Search + Place Details
│   ├── plans.ts                                      ← Planner (Opus 4.7) + execute (creates batches from plan items)
│   ├── prompts.ts                                    ← SINGLE source of truth for all prompt templates
│   ├── queue.ts                                      ← enqueueJob / getNextJobs / markJobRunning / markJobDone / markJobFailed
│   ├── scrape/
│   │   └── scrapingbee.ts                            ← renderPage (JS-render fallback) + extractTypedFields (AI Extract)
│   ├── seasonality.ts                                ← Hardcoded peak-months calendar (50 SMB categories)
│   └── supabase/
│       ├── client.ts                                 ← browser client (anon key, RLS-scoped)
│       └── server.ts                                 ← supabaseAdmin (service role key, SERVER ONLY)
├── supabase/migrations/                              ← timestamped SQL migrations, applied via `supabase db push`
│   ├── 20260420181100_init.sql                       ← M1–M10 schema: batches, prospects, enrichments, analyses, pitches, jobs
│   ├── 20260422000000_rename_place_id.sql            ← HERE → Google: google_place_id → place_id
│   ├── 20260422180000_contacts.sql                   ← M12 contacts table + RLS
│   ├── 20260423000000_visibility_audits.sql          ← M13 visibility_audits + RLS
│   ├── 20260424000000_phase3.sql                     ← contacts.email_revealed_at + batches.pitch_score_threshold + batches.auto_enrich_top_n + enrichments.scraped_data_json
│   └── 20260424120000_plans.sql                      ← M20: icp_profile, lead_plans, lead_plan_items + RLS
├── .env.local.example                                ← all env keys, empty values
├── .mcp.json                                         ← Playwright MCP for local QA
├── vercel.json                                       ← cron schedule */2 * * * *
├── CLAUDE.md                                         ← this file: spec, scope, conventions
└── package.json
```

**One-line purpose per top-level folder:**

| Folder | Purpose | Rule |
|---|---|---|
| `app/(auth)/` | Public auth pages | No layout auth guard; simple Supabase client calls |
| `app/(dashboard)/` | Behind-auth UI | Layout redirects to `/login` if no session |
| `app/api/` | Server routes | JWT validation at the top of every mutating route; ownership check through `batches.user_id` |
| `app/api/test/` | Manual-debug endpoints | **Always `CRON_SECRET`-gated.** Never add a user-facing route here |
| `lib/` | Pure server logic | No JSX, no React, no `window.*`. Callable from cron + API + tests |
| `lib/llm/` | Thin clients for LLM providers | One file per provider. Grows: `anthropic.ts` when we abstract beyond direct SDK use |
| `lib/scrape/` | Scraping providers | One file per provider (`scrapingbee.ts`). Grows: add `playwright.ts` if we self-host later |
| `lib/supabase/` | DB clients | `client.ts` (browser/anon) vs `server.ts` (service role — server only) |
| `supabase/migrations/` | Schema history | **Append-only.** Never edit a past migration. Name: `YYYYMMDDHHMMSS_short_description.sql` |

---

## 7. Environment Variables

Put these in `.env.local.example` with empty values. Never commit real keys.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server only, never exposed to browser
HERE_API_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=                     # random string; check in cron route
```

In `/api/cron/process`, read `Authorization: Bearer <CRON_SECRET>` from headers and reject if it doesn't match. Vercel Cron sends this automatically when configured.

---

## 8. Build Order (strict — do not reorder)

Each milestone ends with: **commit, push, verify Vercel deploy is green, manually test the described outcome.** If a milestone can't be verified, stop and fix before moving on.

### Milestone 1 — Skeleton (Day 1)

- `create-next-app`, install deps, Tailwind config
- Push empty app to Vercel
- Create Supabase project, run migration, confirm tables exist
- Add env vars to Vercel
- ✅ Verify: empty app loads at Vercel URL

### Milestone 2 — Auth

- Supabase Auth: email/password
- `/login`, `/signup` pages
- Auth guard on `(dashboard)` layout
- ✅ Verify: can sign up, log in, see a placeholder dashboard, log out

### Milestone 3 — Places fetch

- `lib/places.ts`: two functions — `searchPlaces(query)` (Text Search), `getPlaceDetails(placeId)`
- `POST /api/batches`: takes `{city, category, count}`, creates a batch row, fetches places, writes prospect rows, creates one `enrich` job per prospect
- Minimal UI: a form on `/batches` that calls this
- ✅ Verify: submitting "restaurants in Austin" creates a batch + N prospect rows in Supabase

### Milestone 4 — Enrichment

- `lib/enrich.ts`: `enrichProspect(prospectId)` — fetches website HTML, parses with Cheerio, writes to `enrichments` table
- Detectors (simple string/regex matches on HTML):
  - **CMS:** WordPress (`wp-content`), Shopify (`cdn.shopify.com`), Wix (`wix.com`), Squarespace (`squarespace.com`)
  - **Booking:** Calendly, Acuity, OpenTable, Resy, Square Appointments (look for their script URLs or domain links)
  - **E-commerce:** Shopify, WooCommerce, Square, BigCommerce
  - **Chat:** Intercom (`widget.intercom.io`), Drift, tawk.to, Zendesk
  - **Contact form:** presence of `<form>` with email input
  - **Mobile:** `<meta name="viewport">`
  - **SSL:** did the fetch succeed on `https://`?
  - **Homepage text:** strip tags, collapse whitespace, first 3000 chars
- Timeout fetches at 8 seconds. On failure, write `fetch_error` and still mark enrichment complete (don't block the pipeline).
- ✅ Verify: call `enrichProspect` for one real prospect; see populated row

### Milestone 5 — Claude analysis

- `lib/analyze.ts`: `analyzeProspect(prospectId)` — reads prospect + enrichment, calls Haiku with prompt from §9, parses JSON, writes to `analyses`
- Temperature 0.3. Require strict JSON output. Retry once on parse failure.
- ✅ Verify: analysis produces ≥1 pain point with concrete evidence for a real prospect

### Milestone 6 — Claude pitch

- `lib/pitch.ts`: `generatePitch(prospectId)` — reads analysis, calls Sonnet with prompt from §9, writes to `pitches`
- ✅ Verify: pitch references the specific evidence from the analysis

### Milestone 7 — Cron processor

- `GET /api/cron/process`:
  1. Verify `Authorization` header
  2. Pick up to 10 jobs where `status = 'pending'` ordered by `created_at`, lock them by setting `status = 'running'` (use `update ... returning` for atomicity)
  3. For each, dispatch to `enrichProspect` | `analyzeProspect` | `generatePitch` based on `job_type`
  4. On success: mark job `done`, chain the next step (enrich → analyze → pitch) by creating the next job
  5. On failure: increment `attempts`, store `last_error`. If `attempts >= 3`, mark `failed`. Otherwise back to `pending`.
  6. When all jobs for a batch are `done` or `failed`, mark batch `done`.
- `vercel.json`:
  ```json
  {
    "crons": [{ "path": "/api/cron/process", "schedule": "*/2 * * * *" }]
  }
  ```
  Note: Hobby plan is daily-only. User is on (or will upgrade to) Pro.
- ✅ Verify: submit a batch of 5, wait 10 min, all 5 have pitches

### Milestone 8 — Dashboard UI

- `/batches`: list with status + progress ("3 of 5 done"), "New batch" form
- `/batches/[id]`: prospects in this batch, sortable by `opportunity_score`
- `/prospects/[id]`: three-panel layout
  - Left: raw signals (tech stack chips, booleans, rating, reviews)
  - Middle: pain points + evidence + score
  - Right: editable pitch (subject + body textarea), Save / Copy / Approve buttons
- Status dropdown: `new` → `ready` → `contacted` → `replied` / `rejected`
- ✅ Verify: full click-through works end to end

### Milestone 9 — CSV export

- `GET /api/pitches/export?batch_id=...` returns CSV: `name, website, email, subject, body, phone`
- Filter to `status = 'approved'`
- ✅ Verify: download a CSV, open in sheets, columns correct

### Milestone 10 — Dogfood

- Run a real batch of 50 in a city the user cares about
- Review every pitch by hand
- Fix prompt issues immediately (edit `lib/prompts.ts`, redeploy, re-run)
- ✅ Verify: ≥80% of pitches reference something real about the business

Stop here. Hand back to the user for the live email test.

---

## 9. Prompts (put these in `lib/prompts.ts`)

Export as template functions. Do not inline prompts in API routes.

### Analysis prompt (Haiku)

```
You analyze a small business to find specific tech/automation gaps
a dev + AI automation agency can solve. Be concrete, not generic.

BUSINESS
- Name: {name}
- Category: {category}
- City: {city}
- Rating: {rating} ({review_count} reviews)
- Hours: {hours}

WEBSITE SIGNALS (JSON)
{signals_json}

HOMEPAGE TEXT (first 3000 chars)
{homepage_text}

Return ONLY valid JSON, no preamble, no markdown:
{
  "pain_points": [
    {
      "pain": "ONE specific operational pain, e.g., 'Orders taken by phone only, no online menu'",
      "evidence": "The exact signal that proves it, e.g., 'No ordering widget detected; homepage says \"Call us to order\"'",
      "solution_category": "website_rebuild | online_booking | ai_chatbot | workflow_automation | ecommerce | custom_software",
      "effort": "small | medium | large",
      "impact": "low | medium | high"
    }
  ],
  "opportunity_score": 0,
  "best_angle": "The single strongest pain to lead the email with"
}

RULES
- Max 3 pain points. Quality over quantity.
- Every pain needs CONCRETE evidence from the data above.
- If no real opportunity exists, score under 30 and return a minimal list.
- Never invent facts not present in the data.
```

### Pitch prompt (Sonnet)

```
Write a cold email to a small business owner. It must feel written
by a human who actually looked at their business.

BUSINESS: {name} ({category}, {city})
PAIN TO LEAD WITH: {best_angle}
EVIDENCE: {evidence}
SOLUTION CATEGORY: {solution_category}

STRUCTURE (4 sentences max)
1. Specific observation of the issue (friendly, not accusatory)
2. The hidden cost of this issue (lost revenue or wasted time)
3. A realistic solution with a concrete timeline or outcome
4. Soft CTA, e.g., "Worth a quick 10-min call this week?"

RULES
- Under 80 words total.
- Subject line under 6 words, curiosity-based, mentions the business.
- NEVER say "I help businesses like yours" or similar templated openers.
- NEVER use "synergy", "leverage", "cutting-edge", "solutions provider".
- Reference the specific evidence, not the generic category.
- No jargon.

Return ONLY valid JSON, no preamble, no markdown:
{ "subject": "...", "body": "..." }
```

---

## 10. Coding Conventions

- TypeScript strict mode on.
- `async/await` everywhere. No `.then()` chains.
- API routes: always return `NextResponse.json(...)` with explicit status codes.
- All DB access goes through `lib/supabase/server.ts`, using the service role key. Never expose the service key to the browser.
- Errors: `try/catch` at every API route boundary. Log to console. Return `{ error: string }` with 4xx/5xx.
- No `any`. If you don't know the shape, define an interface.
- Comments: explain _why_, not _what_. Only comment non-obvious logic.

---

## 11. Testing Approach

We're not writing unit tests for the MVP. Instead:

- After each milestone, run the described manual verification.
- Before §8 Milestone 10, create a `scripts/seed.ts` that runs a 5-prospect batch end-to-end and prints the results. This is the regression test.

---

## 12. When in Doubt

- If the user's request contradicts this file, follow the user's request but flag the conflict.
- If you finish a milestone early, stop. Do not freelance the next one.
- If you hit an ambiguity not covered here, ask. Do not guess.
- If a third-party API is flaky or returns surprising data, show the user the real response and let them decide.
- If you notice a genuine improvement (not a shiny-thing tangent), describe it in one sentence and ask before building it.

---

## 13. Definition of Done (MVP)

The MVP is done when all of the following are true:

- [ ] A new user can sign up, log in, and create a batch.
- [ ] Submitting a batch of 10 real businesses produces 10 pitches within 15 minutes.
- [ ] Each pitch references at least one concrete, verifiable fact about that business.
- [ ] The user can edit a pitch, mark it approved, and export approved pitches as CSV.
- [ ] The app runs on Vercel with no local dependencies.
- [ ] Total monthly cost with 500 prospects/month is under $120.
- [ ] The code is under 3000 lines across all files. (If it's more, you over-engineered — simplify.)

Now open this file again, re-read §0, and begin at §8 Milestone 1.

---

## 14. Phase 2 Extensions (M11–M15)

Phase 1 (M1–M10) is sealed. Phase 2 turns this from an MVP pitch generator into an account-based prospect intelligence tool: reliable discovery, decision-maker contact info, and a full digital visibility audit per account.

### 14.0 What changes vs Phase 1

- **Prospect source** switches from HERE to **Google Places API (New)**. HERE returned 3 results for "med spas in Austin" during M10 dogfood — unusable for real outreach volume.
- **Website scraping** adds a **ScrapingBee** fallback when `fetch + Cheerio` returns <500 chars of homepage text, so JS-rendered sites (Wix, Squarespace, Shopify) get real content.
- **New module: contact enrichment** via **Apollo.io** — decision maker, title, verified email, LinkedIn, phone. One `contacts` row per person; `is_primary` flag picks the one to pitch to.
- **New module: visibility audit** — Google Business Profile reviews, social handles + follower counts, SerpApi rank for `<category> <city>`, Meta Ads Library presence, Google News mentions. One `visibility_audits` row per prospect.
- **LLM provider** stays **Anthropic** for analyze + pitch (M10 proved quality); **Groq (Llama 3.3 70B)** is added for bulk summarization in the visibility audit (~20x cheaper than Sonnet, quality sufficient).

### 14.1 Updated Tech Stack (additions)

| Layer                 | Tool                                                                |
| --------------------- | ------------------------------------------------------------------- |
| Prospect source       | Google Places API (New) — Text Search + Place Details               |
| JS-rendered scraping  | ScrapingBee — fallback when Cheerio text excerpt < 500 chars        |
| Contact enrichment    | Apollo.io — People Search + Email Finder                            |
| Search rank           | SerpApi — organic rank for category + brand queries                 |
| Social audience       | Meta Graph API (public endpoints), direct Instagram scrape fallback |
| Ad transparency       | Meta Ad Library API                                                 |
| Press mentions        | Google News via SerpApi                                             |
| Bulk summarization    | Groq — `llama-3.3-70b-versatile` (used only in visibility audit)    |

HERE is removed. `lib/places.ts` is rewritten against Google Places.

### 14.2 Updated Env Vars

Add to `.env.local.example`:

```
GOOGLE_PLACES_API_KEY=
SCRAPINGBEE_API_KEY=
APOLLO_API_KEY=
SERPAPI_KEY=
GROQ_API_KEY=
META_ACCESS_TOKEN=           # app access token for public Meta endpoints
```

Remove `HERE_API_KEY`.

### 14.3 New Data Model

Add a migration `0003_phase2.sql`:

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  full_name text,
  title text,
  seniority text,            -- owner | c_suite | vp | director | manager | other
  department text,
  email text,
  email_confidence text,     -- verified | guessed | unverified
  phone text,
  linkedin_url text,
  apollo_person_id text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on contacts(prospect_id, is_primary);

create table visibility_audits (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  gmb_rating numeric,
  gmb_review_count int,
  gmb_review_highlights_json jsonb,
  gmb_photo_count int,
  social_links_json jsonb,            -- { instagram, facebook, tiktok, linkedin, x }
  instagram_followers int,
  facebook_followers int,
  serp_rank_main int,                 -- rank for "<category> <city>"
  serp_rank_brand int,                -- rank for "<business name>"
  meta_ads_running boolean,
  meta_ads_count int,
  meta_ads_sample_json jsonb,
  press_mentions_count int,
  press_mentions_sample_json jsonb,
  visibility_summary text,            -- Groq-generated narrative
  audited_at timestamptz
);
```

Enable RLS on both. Policies mirror §5 — a user can access rows that chain back to a batch they own.

Extend `jobs.job_type` to include `find_contacts` and `audit_visibility`. No schema migration needed — `text not null` column already accepts new values.

### 14.4 Pipeline Flow

```
enrich → analyze → find_contacts → audit_visibility → pitch
```

All five stages are sequential per prospect. The cron processor (unchanged in behavior) chains: on success of stage N, enqueue stage N+1. Retry/failure semantics unchanged (3 attempts, then `failed`).

Pitch prompt now receives the primary contact's name + title and the visibility summary as additional context. The resulting email addresses the person by name where available.

### 14.5 Folder Additions

```
lib/
├── places.ts              ← rewritten for Google Places
├── enrich.ts              ← adds ScrapingBee fallback
├── contacts.ts            ← NEW: Apollo lookup, writes contacts rows
├── audit.ts               ← NEW: visibility signals + Groq summary
├── llm/
│   ├── anthropic.ts       ← existing analyze + pitch calls
│   └── groq.ts            ← NEW: cheap summarization only
└── prompts.ts             ← new prompts per §14.8
```

### 14.6 Milestone Plan

Each milestone ends with: commit, push, verify Vercel deploy is green, manually test one real prospect end-to-end.

#### M11 — Google Places + ScrapingBee (Phase A)

- Rewrite `lib/places.ts` against Google Places API (New). Text Search returns up to 60 via pagination; use Place Details for website/phone/hours/rating/review_count.
- Update `.env.local.example` (remove HERE, add Google + ScrapingBee).
- Add a ScrapingBee helper in `lib/enrich.ts`: if the Cheerio text excerpt is under 500 chars after stripping scripts/styles, re-fetch via ScrapingBee with `render_js=true` and re-parse.
- ✅ Verify: Austin "med spas" returns ≥ 15 real prospects. Homepage excerpts for Wix / Squarespace / Shopify sites come back with real body text.

#### M12 — Contact enrichment (Phase B)

- `lib/contacts.ts`: `findContacts(prospectId)` — calls Apollo People Search scoped to the prospect's company (by website domain). Writes up to 5 `contacts` rows. Marks the most senior decision-maker (owner / C-suite / VP in that order of preference) as `is_primary = true`.
- New job type `find_contacts`. Cron chains: `analyze → find_contacts`.
- ✅ Verify: a real Austin med spa gets at least 1 contact row with a verified email and LinkedIn URL.

#### M13 — Visibility audit (Phase C)

- `lib/audit.ts`: `auditVisibility(prospectId)` — parallelizes 5 external calls:
  - GMB details from Google Places Details (already fetched in M11; cached).
  - Social link discovery: parse homepage HTML for `instagram.com`, `facebook.com`, `tiktok.com`, `linkedin.com/company`, `x.com` URLs.
  - SerpApi: two searches — `"<category> in <city>"` and `"<business name>"`. Extract organic rank.
  - Meta Ad Library: query by Page ID (if we can discover it from the FB URL) or by `search_terms=<business_name>`. Extract ads running count.
  - Google News via SerpApi: search `<business_name>`. Collect top 5 press mentions.
- After the 5 parallel calls settle, send a single Groq prompt (see §14.8.3) to produce a one-paragraph `visibility_summary`.
- New job type `audit_visibility`. Cron chains: `find_contacts → audit_visibility`.
- ✅ Verify: a real Austin med spa gets an audit row with non-null values for ≥ 3 of the 5 categories and a readable summary.

#### M14 — UI + updated CSV (Phase D)

- Extend `/prospects/[id]` with two new panels (or a tabbed layout):
  - **Contacts**: table of contacts with name/title/seniority/email/LinkedIn. Highlight the primary.
  - **Visibility**: GMB stars + reviews, social icons with follower counts, rank badges, ads-running indicator, summary paragraph.
- Update pitch prompt to reference the primary contact and visibility summary (see §14.8.2).
- Extend CSV export: add columns `contact_name`, `contact_title`, `contact_email`, `contact_linkedin`, `opportunity_score`, `gmb_rating`, `gmb_review_count`, `primary_social`.
- ✅ Verify: export a real batch; the CSV has the new columns populated and the pitch addresses the primary contact by name.

#### M15 — LLM provider abstraction + Groq

- `lib/llm/anthropic.ts` and `lib/llm/groq.ts`. Both expose `generateStructured({model, schema, prompt, temperature})`.
- `lib/analyze.ts` and `lib/pitch.ts` import from `lib/llm/anthropic.ts` (behavior unchanged).
- `lib/audit.ts` imports `lib/llm/groq.ts` for the visibility summary.
- ✅ Verify: audit summary generates via Groq; analysis + pitch still go through Anthropic. Monthly spend aligns with the budget in §14.9.

### 14.7 Definition of Done (Phase 2)

Phase 2 is done when:

- [ ] A batch of 20 real businesses produces, for each one: enrichment, analysis, ≥ 1 contact row, visibility audit row, and a pitch that addresses the primary contact by name.
- [ ] The pitch references at least one fact from the visibility audit (e.g. "your 4.8-star GMB rating with 127 reviews" or "I see you've been running Meta ads for …").
- [ ] CSV export includes all Phase 2 columns and round-trips cleanly into Google Sheets.
- [ ] Monthly spend at 1000 prospects/month stays under **$550** (target: $450).
- [ ] Total code including Phase 2 stays under **5000 lines** across all files.

### 14.8 Prompts (additions / updates)

Put all three in `lib/prompts.ts`.

#### 14.8.1 Contact selection (Anthropic Haiku, temperature 0)

Only needed if Apollo returns multiple candidates and none are clearly the owner. In that case, feed the Haiku the candidate list and let it pick the best contact. Most of the time, skip this prompt and choose by a deterministic rule in `lib/contacts.ts`: `owner > c_suite > vp > director > manager > other`.

#### 14.8.2 Pitch prompt (update, Sonnet)

Add two new placeholders to the existing pitch prompt:

```
CONTACT (if known, lead with their first name): {contact_first_name} ({contact_title})
VISIBILITY SNAPSHOT: {visibility_summary}
```

New rule:

- If `{contact_first_name}` is present, open with "Hey {first_name} —" instead of "Hey —".
- Use the visibility snapshot only if it contains a specific, strong signal (high review count, active ads, top-3 rank). If it's generic, ignore it. Do not list signals just because they exist.

#### 14.8.3 Visibility summary prompt (Groq Llama 3.3 70B, temperature 0.3)

```
Summarize this small business's digital footprint in 2-3 sentences. Be factual.
Do not editorialize, do not mention strengths vs weaknesses. State what's there.

BUSINESS: {name} ({category}, {city})

GMB: rating {gmb_rating} ({gmb_review_count} reviews, {gmb_photo_count} photos)
TOP REVIEW EXCERPTS: {gmb_review_highlights}
SOCIAL: {social_links_json}
FOLLOWERS: IG {instagram_followers}, FB {facebook_followers}
SEARCH: rank {serp_rank_main} for "{category} in {city}", rank {serp_rank_brand} for own brand
ADS: {meta_ads_count} Meta ads currently running
PRESS: {press_mentions_count} news mentions in the last 90 days

Return plain text, no formatting, no preamble.
```

### 14.9 Budget expectations

At 1000 prospects/month:

| Component       | Cost    |
| --------------- | ------- |
| Google Places   | ~$34    |
| ScrapingBee     | $49     |
| Apollo.io       | ~$270   |
| SerpApi         | $50     |
| Anthropic       | ~$100   |
| Groq            | ~$5     |
| **Total**       | **~$510** |

Of this, ~$180 is fixed platform fees that don't scale with volume. Cost per prospect variable ≈ $0.40.

### 14.10 Phase 2 out-of-scope (still)

Don't build in Phase 2:

- LinkedIn scraping beyond what Apollo returns. Enterprise / ToS risk.
- Ahrefs or SEMrush deep SEO (overkill for outbound; SerpApi is enough).
- Auto-sending emails. User still pastes into Instantly / Smartlead manually.
- Multi-tenant / teams. Single-user stays.
- CRM bidirectional sync. CSV export stays the handoff.
- Non-US markets, non-English pitch generation. Revisit in Phase 3 if needed.

---

## 15. Phase 3 — Efficiency pass (M16–M19)

Phase 2 shipped the full pipeline but the M13 dogfood exposed real issues:

- The pitch for **Wild and Beautiful Natural Aesthetics** recommended "add online booking" to a clinic that already has a prominent Book Now CTA. Our `has_online_booking` detector only matched Calendly/Acuity/OpenTable/Resy/Square/Yelp — it missed the Squarespace-embedded provider entirely.
- At **2700 prospects/mo** (90 discovered daily), the M12 Apollo-on-every-prospect model would cost **$400+/mo in email reveals alone** — wasted on leads the user never planned to personally pitch.
- Cron `run 2` hit the Vercel 60s `FUNCTION_INVOCATION_TIMEOUT` while processing 10 sequential Sonnet calls, leaving 3 jobs stuck in `running` forever (no reaper).
- Google News press mentions returned generic noise ("Do Beautiful Birds Have an Evolutionary Advantage?" on a med spa audit).

Phase 3 fixes all four with minimal surface area.

### 15.0 What changes vs Phase 2

- **Scraper upgrade:** add **ScrapingBee AI Extract** — send a typed schema, get back `{booking_platform, book_url, services, team_members, primary_cta}` as structured JSON, rendered with JS. Kills the "recommended booking to a site that has booking" class of pitch error.
- **Booking detector expansion:** add regex for 12 med-spa / local-SMB platforms (Vagaro, Boulevard, Mindbody, Zenoti, GlossGenius, Jane, Mangomint, Fresha, Booker, Schedulicity, Timely, Cliniko) plus a generic `book|appointment|schedule` CTA catch-all.
- **Apollo becomes opt-in.** `lib/contacts.ts` splits into `discoverPeople` (list, cheap) + `revealEmail` (per-contact, costs 1 credit). Cron no longer runs contact enrichment automatically. Triggers: batch-level "auto-enrich top N by score" checkbox (default N=10) + per-prospect "Find decision makers" button + per-contact "Reveal email" button.
- **SerpApi trim:** drop Google News press search entirely. Keep only category rank + brand rank. Fits the $50 Developer plan.
- **Pitch-gate on opportunity_score < 50:** optional per-batch checkbox, default off. When on, skip Sonnet pitch generation for low-scoring prospects.
- **Stuck-job reaper:** cron run first resets any job in `running` for > 2 min back to `pending` before claiming new work.
- **Pitch prompt** gets the new scraped fields so it can reference "your Book Today button on the homepage" vs generic suggestions.

### 15.1 Updated tech stack (additions / changes)

| Layer                 | Tool                                                                |
| --------------------- | ------------------------------------------------------------------- |
| Rendered scraping + typed extraction | **ScrapingBee Business** with AI Extract endpoint  |
| Contact discovery     | Apollo — people search only (no email reveal by default)            |
| Contact email reveal  | Apollo `/people/match` — user-triggered per contact                 |
| Search rank           | SerpApi Developer (5000 searches/mo) — ranks only, no news           |

No new services. Hunter.io was considered and rejected — user prefers Apollo's LinkedIn + native seniority data and the opt-in model keeps cost within plan quota.

### 15.2 Env vars — unchanged

All Phase 2 env vars carry forward. Apollo uses the same `APOLLO_API_KEY`. SerpApi uses the same `SERPAPI_KEY`. ScrapingBee AI Extract uses the same `SCRAPINGBEE_API_KEY` — just a different endpoint path.

### 15.3 Data model additions

Add migration `20260424_phase3.sql`:

```sql
-- Track which contacts had their email revealed (an Apollo email credit spent)
alter table contacts add column email_revealed_at timestamptz;

-- Per-batch settings for the pitch-gate and auto-enrich toggles
alter table batches add column pitch_score_threshold int;            -- null = no gate
alter table batches add column auto_enrich_top_n int not null default 0;  -- 0 = no auto-enrich

-- Structured scraped fields from ScrapingBee AI Extract
alter table enrichments add column scraped_data_json jsonb;
```

No new tables. No RLS changes needed.

### 15.4 Pipeline flow

```
enrich → analyze → audit → [pitch_gate?] → pitch
                      │
                      └─ for top N prospects: discover_contacts
```

Key changes:
- `find_contacts` renamed **`discover_contacts`** semantically (list search only). Cron no longer auto-chains it — triggered by batch flag `auto_enrich_top_n` or by explicit user action.
- `audit_visibility` is now a sibling of `analyze`, both fan out from `enrich`. No change to downstream.
- Email reveal is **not a cron job** — it runs inline in the API route when the user clicks "Reveal email" on a contact row.

### 15.5 Folder changes

```
lib/
├── scrape/
│   ├── cheerio.ts           ← NEW: extract fn moved from enrich.ts
│   └── scrapingbee.ts       ← NEW: render + AI Extract client
├── enrich.ts                ← slimmed: orchestrates cheerio + scrapingbee
├── contacts.ts              ← split: discoverPeople + revealEmail exports
└── booking-platforms.ts     ← NEW: regex table for 12 SMB booking platforms

app/api/
├── prospects/[id]/discover-contacts/route.ts   ← NEW: manual trigger
├── prospects/[id]/contacts/[contactId]/reveal/route.ts  ← NEW: per-contact reveal
└── cron/process/route.ts    ← adds stuck-job reaper; drops find_contacts from auto-chain
```

### 15.6 Milestone plan

Each milestone ends with: commit, push, verify Vercel deploy is green, manually test one real prospect end-to-end.

#### M16 — Scraper upgrade (Phase 3-A)

- Add `lib/scrape/scrapingbee.ts` with `renderPage(url)` (existing behavior) and new `extractTypedFields(url, schema)` calling ScrapingBee AI Extract.
- Move existing Cheerio detectors to `lib/scrape/cheerio.ts`. Add `lib/booking-platforms.ts` with the 12-platform table + generic Book Now regex.
- `lib/enrich.ts` orchestrates: Cheerio first, ScrapingBee render fallback if <500 chars, AI Extract once (for `team_members`, `services`, `primary_cta`, `book_url`, `booking_platform`), write everything to `enrichments.scraped_data_json`.
- ✅ Verify: re-enrich Wild and Beautiful → `scraped_data_json.booking_platform` is populated (Squarespace native or detected provider) AND `has_online_booking=true`. Pitch regenerated from this enrichment no longer recommends booking.

#### M17 — Apollo smart opt-in (Phase 3-B)

- `lib/contacts.ts` splits into `discoverPeople(prospectId)` (calls `/mixed_people/api_search`, writes contacts rows with `email=null`) and `revealEmail(contactId)` (calls `/people/match`, updates the single row, sets `email_revealed_at`).
- Remove `find_contacts` from cron auto-chain.
- Cron checks `batches.auto_enrich_top_n` at audit-completion boundary: if set, enqueue `discover_contacts` for top N prospects in the batch (sorted by `analyses.opportunity_score`).
- New API routes: `POST /api/prospects/:id/discover-contacts` and `POST /api/prospects/:id/contacts/:contactId/reveal`. Both JWT-validated.
- UI updates: batch create form gets "Auto-enrich top ___ leads" input (default 10, 0 = off). Prospect detail gets "Find decision makers" button when no contacts exist. Each contact row gets "Reveal email" button when email is null.
- ✅ Verify: 10-prospect batch with `auto_enrich_top_n=3` runs Apollo on exactly 3 prospects. Remaining 7 have no contacts. Clicking "Find decision makers" on one of the 7 triggers discovery. Clicking "Reveal email" on a discovered contact without email spends exactly 1 credit.

#### M18 — SerpApi trim + pitch gate + stuck-job reaper (Phase 3-C)

- `lib/audit.ts`: delete `fetchPressSignals`. `press_mentions_count` and `press_mentions_sample_json` become null. UI panel hides that section when null.
- Batch create form: "Skip pitch for prospects scoring below ___" input (blank = off). Cron reads `batches.pitch_score_threshold`, at analyze-done boundary checks score, skips chaining pitch if below.
- `app/api/cron/process/route.ts` adds at the top of the handler:
  ```ts
  await supabaseAdmin.from('jobs')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .lt('processed_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
  ```
  This runs before claim, freeing stuck jobs automatically every 2 minutes.
- ✅ Verify: induce a stuck running job → next cron run resets it. Submit a batch with pitch_score_threshold=60 → prospects scoring <60 have status=`analyzed` with no pitch. Submit without threshold → behaves as before.

#### M19 — Pitch prompt uses scraped data (Phase 3-D)

- `lib/prompts.ts`: pitch prompt receives two new inputs:
  - `{primary_cta}`: e.g. "Book Today" button / "Schedule Consultation" button / "no visible CTA"
  - `{booking_status}`: "has online booking via Boulevard" / "has Book Now button but no backend platform detected" / "no booking on site at all"
- New rule in the prompt: if `booking_status` indicates booking is already present, DO NOT recommend online booking — pick a different pain to lead with (chatbot, ecommerce, automation).
- Sonnet regenerates existing pitches if user clicks "Regenerate" on the pitch panel (new button).
- ✅ Verify: Wild and Beautiful pitch regenerated with new inputs no longer recommends online booking.

### 15.7 Definition of Done (Phase 3)

- [ ] Re-running the M13 Austin med spa batch: zero pitches recommend online booking to prospects that already have it.
- [ ] A 10-prospect batch with `auto_enrich_top_n=3` consumes ≤ 3 Apollo search calls and 0 email credits until user clicks "Reveal email".
- [ ] Monthly bill at 2700 prospects/mo stays under **$650** with ~150 email reveals/mo.
- [ ] Stuck-job reaper demonstrably recovers jobs after a forced timeout.
- [ ] Total code stays under **6000 lines**.

### 15.8 Prompts (additions)

Added to `lib/prompts.ts`:

**ScrapingBee AI Extract schema** (not a prompt per se, but what we send them):

```json
{
  "booking_platform": "string — the specific booking/scheduling platform used on this site (Vagaro, Boulevard, Mindbody, Calendly, Acuity, Squarespace Scheduling, etc.) or 'none' if no online booking is available",
  "book_url": "string — full URL of the primary booking link if one exists, or empty string",
  "primary_cta": "string — the text of the most prominent call-to-action button visible on the homepage",
  "services": ["array of the services/treatments offered, max 10"],
  "team_members": [
    {
      "name": "string",
      "title": "string",
      "bio_url": "string"
    }
  ]
}
```

**Pitch prompt additions** in §9: see §15.6 M19 for the `{primary_cta}` and `{booking_status}` placeholders and the "do not recommend booking if already present" rule.

### 15.9 Budget expectations (locked)

At 2700 prospects discovered/mo, ~150 email reveals/mo:

| Component       | Cost    |
| --------------- | ------- |
| Google Places   | ~$90    |
| ScrapingBee Business (render + AI Extract) | $99 |
| Apollo Professional (150 reveals incl.)   | $79   |
| Apollo extras (if >150 reveals)           | ~$0-$18 |
| SerpApi Developer (5000 searches)          | $50    |
| Anthropic (analyze + pitch × 2700)         | ~$270  |
| Groq (bulk summaries)                       | ~$15   |
| **TOTAL**                                   | **~$603–$621/mo** |

With `pitch_score_threshold=50` filtering out ~30% of leads, Anthropic drops by ~$80 → total **~$520/mo**.

### 15.10 Phase 3 out-of-scope (still)

- Hunter.io or other secondary contact sources. Apollo covers the need now that reveals are opt-in.
- Multi-region Places searches. Single-city batches stay.
- Scheduled batch refresh (re-running the same city monthly). Separate feature.
- Full-text pitch regeneration based on rolling feedback. The "Regenerate" button just re-calls the prompt; no RL loop.
- GMB Posts / Reviews API write-back. Purely read.
- LinkedIn Sales Navigator scraping. Still a ToS landmine.

---

## 16. Phase 4A — Daily Lead Planner (M20)

Phase 3 made the pipeline efficient. Phase 4A adds an **advisor layer** on top: instead of the user deciding each morning which city + category to run, a daily plan pops up saying *"Today, run these 3-5 batches (city, category, count) for these reasons."* The user reviews and executes with one click.

**Phase 4A is scoped tight on purpose.** Only LLM + seasonality + ICP. No Google Trends, no performance-feedback loop, no cron auto-generation, no reply classifier. Those are 4B/4C.

### 16.0 Defaults locked in for 4A

User deferred 6 of 8 decision points to "whatever sensible for 4A". The locked defaults:

| Decision | 4A default | Revisit in |
|---|---|---|
| Live market signals (Google Trends / news) | skip | 4C |
| Reply tracking | manual status dropdown only (existing) | 4B (Instantly API) |
| Plan generation cadence | manual trigger only ("Generate today's plan" button) | 4C (08:00 UTC cron) |
| Auto-execute | per-plan "Execute all" button; also per-item "Run this one" | — |
| Category scope | unbounded via user's `icp_profile.target_categories` array | — |
| Performance feedback to LLM | skip for 4A | 4B |
| ICP fields | services, avg_deal_size, daily_capacity (hard cap), preferred_cities, excluded_cities, min_gmb_rating, min_review_count, target_categories | — |
| Daily capacity cap | the `daily_capacity` field on the ICP is the hard cap across all items in a plan | — |

### 16.1 Data model additions

Migration `20260424120000_plans.sql`:

```sql
create table icp_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  services text[] not null default '{}',
  avg_deal_size int,
  daily_capacity int not null default 0,   -- 0 means no hard cap
  preferred_cities text[] not null default '{}',
  excluded_cities text[] not null default '{}',
  min_gmb_rating numeric,
  min_review_count int,
  target_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table lead_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  status text not null default 'draft', -- draft | executed | skipped
  rationale_json jsonb,                  -- planner's overall reasoning + signals used
  created_at timestamptz not null default now(),
  executed_at timestamptz
);
create index on lead_plans(user_id, plan_date desc);

create table lead_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references lead_plans(id) on delete cascade,
  city text not null,
  category text not null,
  count int not null,
  reasoning text,                        -- per-item reason string
  priority int not null default 0,       -- 1 = highest, rendered in that order
  estimated_cost_usd numeric,            -- rough cost estimate for the item
  batch_id uuid references batches(id) on delete set null,  -- populated after execute
  executed_at timestamptz
);
create index on lead_plan_items(plan_id, priority);
```

RLS on both tables, same pattern as batches (user owns rows where `user_id = auth.uid()`). `icp_profile` RLS is trivially `auth.uid() = user_id`.

### 16.2 Seasonality calendar

Hardcoded in `lib/seasonality.ts` — no DB table. One exported array of ~30 common SMB categories × peak months with brief rationale. Seed on first write of the module; edit by PR if needed. Example entries:

```ts
{ category: 'med spas',        peak_months: [4, 5, 10, 11], reason: 'Pre-summer prep and pre-holiday gifting drive botox/filler demand.' }
{ category: 'tax preparation', peak_months: [1, 2, 3, 4],    reason: 'Q1 tax season is the entire business year for these firms.' }
{ category: 'landscaping',     peak_months: [3, 4, 5, 9],    reason: 'Spring cleanup and fall yard prep.' }
{ category: 'HVAC',            peak_months: [5, 6, 7, 11, 12], reason: 'Summer AC + winter heat peaks.' }
{ category: 'wedding planners', peak_months: [1, 2, 8],      reason: 'Engagement season Dec/Jan; planning typically 12-18 months out.' }
// ...~30 total
```

### 16.3 Folder additions

```
lib/
├── seasonality.ts            ← NEW: static category calendar
├── plans.ts                  ← NEW: generatePlan(userId), executePlan(planId, userId)
└── prompts.ts                ← plannerPrompt() added

app/(dashboard)/
├── settings/
│   └── icp/page.tsx          ← NEW: one-page ICP form
└── plans/
    ├── page.tsx              ← NEW: list of past plans
    └── [id]/page.tsx         ← NEW: plan detail + execute button

app/api/
├── icp/route.ts              ← NEW: GET + PATCH
├── plans/route.ts            ← NEW: POST = generate today's plan
└── plans/[id]/execute/route.ts ← NEW: creates batches from plan items
```

### 16.4 Planner prompt (Opus 4.7)

Takes the ICP, today's date, seasonality table, plus a handful of recent batch summaries (counts by city+category) for light context. Returns structured JSON:

```json
{
  "rationale": "one-paragraph summary of why this plan for today",
  "items": [
    {
      "priority": 1,
      "city": "Austin",
      "category": "med spas",
      "count": 20,
      "reasoning": "Late April is peak pre-summer botox demand; Austin is in your preferred cities and high GMB density for this category."
    }
  ]
}
```

Model: `claude-opus-4-7` · `thinking: {type: 'adaptive'}` · `output_config: {effort: 'medium', format: {type: 'json_schema', schema: ...}}`. Temperature parameter removed on Opus 4.7. Structured output enforces the schema.

### 16.5 Execute flow

`POST /api/plans/[id]/execute` loops items, calls the existing batch-create logic for each. Each `lead_plan_items.batch_id` gets populated. Plan status flips to `executed`. Partial execution allowed (per-item button = one call).

### 16.6 Milestone plan

**M20 — Planner module ships as one cohesive milestone.** Deliverables:

1. Migration applied; RLS verified
2. `lib/seasonality.ts` seeded with ~30 categories
3. `lib/plans.ts` with `generatePlan(userId)` + `executePlan(planId, userId)`
4. `lib/prompts.ts` gets `plannerPrompt()`
5. Three UI pages + three API routes
6. Test: ICP filled → "Generate today's plan" → 3-5 items returned → "Execute all" → N batches land in /batches list → existing pipeline runs them

✅ Verify end-to-end: a plan generated on April 24 for a mobile/web + AI agency ICP returns category recommendations that *reflect that date* — e.g. med spas should surface because April is pre-summer; should NOT surface wedding planners (off-peak).

### 16.7 Definition of Done (Phase 4A)

- [ ] New user lands on `/settings/icp`, fills form, saves.
- [ ] Clicks "Generate today's plan" → within 15s gets 3-5 items with rationale.
- [ ] Clicks "Execute" → batches created in /batches list with the planned city/category/count.
- [ ] Daily capacity cap enforced: total count across items ≤ `icp_profile.daily_capacity`.
- [ ] Planner never recommends a category outside `icp_profile.target_categories` or a city in `excluded_cities`.
- [ ] No cron auto-runs (4A scope).
- [ ] Total code including Phase 4A stays under **7000 lines**.

### 16.8 Out of scope (Phase 4B / 4C)

- Reply-rate feedback into planner (4B)
- Instantly / Smartlead API integration (4B)
- Google Trends / News momentum signals via SerpApi (4C)
- Daily 08:00 UTC cron auto-generation (4C)
- Reply-email classifier (Haiku) (4C)
- Multi-user shared plan calendar (still single-user)

---

## 17. Conventions & Scaling Playbook

This section is for *new contributors* (human or AI). Read it before adding code. Every rule here exists because we already hit the gap it covers during M1–M20.

### 17.1 Naming conventions

| Artifact | Pattern | Example |
|---|---|---|
| Migration file | `YYYYMMDDHHMMSS_snake_case_description.sql` | `20260424120000_plans.sql` |
| API route | `app/api/<noun>/<verb-or-param>/route.ts` | `app/api/prospects/[id]/regenerate-pitch/route.ts` |
| Lib file | `lib/<single-noun>.ts` for a module, `lib/<category>/<provider>.ts` for a vendor client | `lib/contacts.ts`, `lib/scrape/scrapingbee.ts` |
| UI page | `app/(dashboard)/<noun>/page.tsx` or `.../[id]/page.tsx` | `app/(dashboard)/plans/[id]/page.tsx` |
| Test endpoint | `app/api/test/<stage>-one/route.ts`, `CRON_SECRET`-gated | `app/api/test/contacts-one/route.ts` |
| Env var | `UPPER_SNAKE_CASE`; client-visible ones get `NEXT_PUBLIC_` prefix | `APOLLO_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` |
| DB table | snake_case, singular subject per row | `visibility_audits` (NOT `visibilityAudits`) |
| DB column | snake_case; `*_json` for jsonb; `*_at` for timestamptz | `scraped_data_json`, `email_revealed_at` |

### 17.2 Where things go — decision tree

```
Is it server-side business logic (no React, no browser globals)?
  → lib/
     ├─ is it a thin wrapper around one external API?      → lib/<category>/<provider>.ts
     ├─ is it shared infra (errors, queue, db clients)?    → lib/*.ts at the root (errors.ts, queue.ts, supabase/)
     └─ is it a pipeline stage (enrich, analyze, pitch)?   → lib/<stage>.ts
Is it an HTTP handler?
  → app/api/<resource>/[...].ts  (JWT auth at the top; ownership check; structured error)
  Is it CRON_SECRET-gated and only for debugging?           → app/api/test/*
Is it React?
  → app/(dashboard)/<route>/page.tsx  (client component; uses supabase client + fetch)
  OR app/(auth)/<route>/page.tsx (public)
Is it a prompt string?
  → lib/prompts.ts  (NEVER inline in api routes or lib modules)
Is it a schema migration?
  → supabase/migrations/<new-timestamp>_<desc>.sql
  Is it changing an existing column's meaning?              → write a rename/alter migration — NEVER edit an old one
```

### 17.3 Playbook — add a new pipeline stage (e.g. "enrich_finances")

We did this four times already (enrich, analyze, audit_visibility, pitch, discover_contacts). The recipe:

1. **Migration** (if it needs its own table): `supabase/migrations/<ts>_<name>.sql` with RLS policy that chains through `prospects.batch_id → batches.user_id`.
2. **Lib module**: `lib/<stage>.ts` with a single exported `async function <stage>Prospect(prospectId: string): Promise<void>`. Reads prospect row → does work → writes result row.
3. **Prompt** (if LLM-backed): add `<stage>Prompt(input)` to `lib/prompts.ts`. Never inline.
4. **Cron wiring** (`app/api/cron/process/route.ts`):
   - Add the new string to `JobType`.
   - Add a `case '<stage>': return <stage>Prospect(job.prospect_id)` in `dispatch()`.
   - Add the chain entry in `enqueueNext()` if it runs auto (not all do — `discover_contacts` is opt-in).
5. **Test endpoint**: `app/api/test/<stage>-one/route.ts`, CRON_SECRET-gated. Copy the shape from `audit-one/route.ts`.
6. **UI panel** (if user should see it): add a section to `app/(dashboard)/prospects/[id]/page.tsx`, load the new row in the existing `Promise.all` block in `load()`.

### 17.4 Playbook — add a new external API integration

1. **Env var** added to `.env.local.example` (empty value) AND pushed to Vercel (`vercel env add`).
2. **Lib file**: `lib/<category>/<provider>.ts` if vendor, else `lib/<noun>.ts`. Export functions, not classes.
3. **Error tagging**: every non-2xx response throws `new ExternalAPIError('<Provider>', message, status)` from `lib/errors.ts`. The UI + cron last_error column both read `error.message`, which shows the user `[Provider] ...` prefix.
4. **Timeouts**: every `fetch` gets `signal: AbortSignal.timeout(ms)`. Serverless functions have a 60s hard ceiling on Vercel Pro.
5. **Graceful degradation**: audit-style fan-out (`Promise.allSettled`) when one signal failing shouldn't kill the whole job. Hard-fail only for critical-path stages.

### 17.5 Playbook — add a new API route

Skeleton every mutating route should match:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  // 1. AUTH — JWT bearer
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  // 2. OWNERSHIP — chain through batches.user_id
  const { data: row, error } = await supabaseAdmin
    .from('prospects').select('id, batches!inner(user_id)').eq('id', id).single()
  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((row as any).batches?.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. WORK — delegate to lib, never inline business logic here
  try {
    const result = await doWork(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
```

Never skip steps 1–2. Never put business logic in the route body — delegate to `lib/`.

### 17.6 Playbook — add a new table

1. **Migration** with `create table ...` + `create index` + `alter table ... enable row level security` + a policy that chains to `auth.uid()` through whatever foreign key makes sense.
2. **Test the RLS**: query the table with the user's JWT — confirm they only see their rows. Do this **locally against the Supabase REST API with the anon key + bearer token** before shipping.
3. **DB client**: server code writes via `supabaseAdmin` (service role bypasses RLS). Browser code reads via the `supabase` export from `lib/supabase/client.ts` (anon — RLS-enforced).
4. **Types**: no generated types — we define narrow `interface Row { ... }` at the top of each consumer file. Matches how we handle the rest of the codebase.

### 17.7 Error handling rules

- Every `Bash`/`fetch` boundary wrapped in `try/catch`.
- Every caught error carries a readable `.message`. Use `errorMessage(err)` from `lib/errors.ts` when you don't control the shape.
- Provider-tagged errors (`[Google Places] ...`, `[Apollo] ...`, `[ScrapingBee] ...`) via `ExternalAPIError` — see §17.4.
- API route errors return `{ error: string }` with 4xx/5xx status — never swallow into 200.
- Background job errors (cron dispatcher) get written to `jobs.last_error` and surfaced in the batch detail UI per-prospect.

### 17.8 Testing approach

We do **not** write unit tests. Verification is manual, driven by three tools:

1. **Test endpoints** (`app/api/test/*-one`) — CRON_SECRET-gated, run one pipeline stage against one prospect. Useful when you need to iterate on a lib module without running a full batch.
2. **`curl` scripts in chat** — submit a batch, drive the cron, check rows. Embedded in every milestone verification.
3. **Playwright MCP** — when available, drives the UI end-to-end. Captures screenshots in `.playwright-mcp/`.

If a change breaks the happy path, you'll see it in the next batch. No CI gate guards against it. This is a deliberate MVP choice per CLAUDE.md §11.

### 17.9 UI conventions (for Phase 4+ contributors)

- **Plain Tailwind, no shadcn/Radix/component-library.** CLAUDE.md §2 explicitly forbids them unless the user opts in. Existing pages use handwritten `<div className="...">` + inline conditional classes.
- **Client components only** (`'use client'`). Every dashboard page does its own data fetching via the `supabase` client with the user's session.
- **Error display**: red banner at the top of the page with the raw `error` string. Success: green banner. See `app/(dashboard)/batches/page.tsx` for the canonical pattern.
- **Auth header helper**: when hitting our own API from the browser, get the token via `supabase.auth.getSession()` and set `Authorization: Bearer <token>`. See `app/(dashboard)/prospects/[id]/page.tsx::authHeaders()`.
- **Nav**: add new top-level pages to the dashboard nav in `app/(dashboard)/layout.tsx`. Keep the list short — if it gets past 5 links, introduce a dropdown or a sidebar.

### 17.10 Anti-patterns — DO NOT

- **Don't inline prompt strings in `api/` or `lib/<stage>.ts`.** All prompts belong in `lib/prompts.ts` as exported functions taking typed inputs.
- **Don't call `supabaseAdmin` from client code.** The service role key must never reach the browser. `lib/supabase/server.ts` is the only file that should ever import it.
- **Don't hand-edit an existing migration.** Schema changes go in a NEW timestamped file. Someone downstream may have already applied the old version.
- **Don't add a dependency without flagging it.** Every npm package pulls latency, bundle size, and security surface. Current working set is deliberately small — Anthropic SDK, Cheerio, Supabase client, Next.js. That's it.
- **Don't chain jobs inside `lib/<stage>.ts`.** The cron processor (`app/api/cron/process/route.ts`) owns chaining. Keep lib modules pure: they read, do work, write.
- **Don't log or echo secrets.** If a debug line needs to confirm a key is set, print its length, not its value.
- **Don't catch-and-ignore.** If you `try/catch`, you re-throw, log, or return a structured error. Silent swallowing has bit us three times during Phase 2/3 dogfood.

### 17.11 When this codebase should split

MVP-to-V2 is OK at this scale (~5,000 LOC after Phase 4A). Re-evaluate splitting into multiple packages if any of these happen:

- Total lib surface exceeds 3,000 LOC. Then break `lib/` into subpackages by domain (`lib/pipeline/`, `lib/integrations/`, `lib/planning/`).
- API routes exceed 30. Then introduce route groups (`app/api/(v1)/` etc).
- More than one consumer (e.g., a mobile app needs the same backend). Then extract `lib/` to a workspace package.

Until then, monolith is the right call per §0 rule 1.

### 17.12 When to update this file

- Every milestone that ships a new lib module / new table / new API route.
- Every time the folder tree changes non-trivially.
- When a convention changes (e.g. swapping from direct Anthropic SDK to Vercel AI Gateway — Phase 5?).

Put the update in the same commit as the code change. Never ship code and update CLAUDE.md in a separate PR — the two will drift.


