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
