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

```
prospect-intel/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← sidebar, auth guard
│   │   ├── page.tsx                ← redirect to /batches
│   │   ├── batches/
│   │   │   ├── page.tsx            ← list + create form
│   │   │   └── [id]/page.tsx       ← batch detail (prospects in this batch)
│   │   └── prospects/
│   │       ├── page.tsx            ← all prospects, filters
│   │       └── [id]/page.tsx       ← detail: signals | analysis | pitch
│   ├── api/
│   │   ├── batches/route.ts        ← POST: create batch + fetch places + queue jobs
│   │   ├── prospects/[id]/route.ts ← GET, PATCH (status, edited_body)
│   │   ├── pitches/export/route.ts ← GET: CSV of approved pitches
│   │   └── cron/process/route.ts   ← GET: process next N jobs
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── supabase/
│   │   ├── server.ts               ← server-side client
│   │   └── client.ts               ← browser client
│   ├── places.ts                   ← HERE Maps API wrapper
│   ├── enrich.ts                   ← fetch + cheerio signal extraction
│   ├── analyze.ts                  ← Claude Haiku call
│   ├── pitch.ts                    ← Claude Sonnet call
│   ├── prompts.ts                  ← prompt templates (single source of truth)
│   └── queue.ts                    ← enqueue/dequeue helpers
├── supabase/
│   └── migrations/0001_init.sql
├── vercel.json
├── .env.local.example
├── package.json
└── README.md
```

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

