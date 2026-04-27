# Architecture

## High-level flow

```
Browser
  │
  ▼
Next.js on Vercel (one app, one deployable)
  ├── app/(dashboard)/…      ← UI pages (client components behind auth guard)
  ├── app/(auth)/…            ← public login/signup
  ├── app/api/…               ← API routes (serverless functions)
  └── lib/                    ← shared server logic
       │
       ▼
  Vercel Cron (three schedules):
    ├─ */2  → /api/cron/process       (pipeline driver)
    │         reaps stuck-running jobs, claims pending, dispatches + chains
    ├─ */10 → /api/cron/read-replies  (inbox poll + Haiku classify)
    └─ 0 8  → /api/cron/daily-plan    (auto-gen today's plan at 08:00 UTC)
       │
       ▼
  Supabase (Postgres + Auth + RLS)
       │
       ▼
  External APIs: Google Places (New), ScrapingBee (render + AI Extract),
                 Apollo.io, SerpApi, Anthropic, Groq, Meta Graph
```

**Hard constraint:** every job processes ONE prospect and must finish under 30 seconds. Never loop over a batch inside one request.

## Pipeline stages

```
Batch create
  └─► enrich                           (Cheerio → ScrapingBee render → AI Extract)
        ├─► analyze                    (Haiku — pain points + opportunity score)
        │     └─► [pitch_gate?]        (skip if score < batches.pitch_score_threshold)
        │           └─► pitch          (Sonnet — subject + body, addresses primary contact)
        └─► audit_visibility           (GMB + social + SerpApi rank + Meta ads → Groq summary)
              └─► [auto_enrich_top_n?] (for top N in batch, enqueue discover_contacts)
                    └─► discover_contacts (Apollo People Search — no email reveal yet)
```

Email reveal is **not a cron job**. It runs inline in `POST /api/prospects/:id/contacts/:contactId/reveal` when the user clicks Reveal on a specific contact (spends 1 Apollo credit).

The daily planner (Phase 4A) is orthogonal to this pipeline. It writes `lead_plans` + `lead_plan_items`; executing a plan simply creates normal `batches` that then flow through this pipeline.

## Folder tree (current)

```
prospect-intel/
├── app/
│   ├── (auth)/                                       ← public routes
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/                                  ← auth-guarded by layout
│   │   ├── layout.tsx                                ← session guard + top nav
│   │   ├── batches/
│   │   │   ├── page.tsx                              ← list + create form
│   │   │   └── [id]/page.tsx                         ← prospect list sorted by score + Export CSV
│   │   ├── prospects/[id]/page.tsx                   ← 3-panel + visibility + executives
│   │   ├── plans/
│   │   │   ├── page.tsx                              ← list of daily plans
│   │   │   └── [id]/page.tsx                         ← plan detail + Execute
│   │   └── settings/icp/page.tsx                     ← ICP form
│   ├── api/
│   │   ├── batches/route.ts                          ← POST: create batch + enqueue enrich jobs
│   │   ├── cron/process/route.ts                     ← atomic claim + dispatch + reaper
│   │   ├── icp/route.ts                              ← GET + PATCH
│   │   ├── pitches/export/route.ts                   ← CSV of approved pitches
│   │   ├── plans/route.ts                            ← POST: generate plan via Opus
│   │   ├── plans/[id]/execute/route.ts               ← POST: execute all items (or ?item_id=...)
│   │   ├── prospects/[id]/route.ts                   ← PATCH: status / pitch edits
│   │   ├── prospects/[id]/discover-contacts/route.ts ← POST: Apollo people search
│   │   ├── prospects/[id]/contacts/[contactId]/reveal/route.ts ← POST: reveal email
│   │   ├── prospects/[id]/recommend-channel/route.ts ← POST: Sonnet channel fit + phone script
│   │   ├── prospects/[id]/regenerate-pitch/route.ts  ← POST: re-run Sonnet
│   │   ├── pitches/[id]/send/route.ts                ← POST: send via Zoho, log sent_emails
│   │   ├── auth/zoho/authorize/route.ts              ← GET: start Zoho OAuth, set state cookie
│   │   ├── auth/zoho/callback/route.ts               ← GET: exchange code, store tokens
│   │   ├── auth/heartbeat/route.ts                   ← POST: capture sender IP for self-open filter
│   │   ├── track/open/[id]/route.ts                  ← GET: 1x1 PNG + log email_opens
│   │   ├── unsub/route.ts                            ← GET: public unsubscribe page
│   │   ├── performance/route.ts                      ← GET: per-(category,city) reply aggregates
│   │   ├── cron/read-replies/route.ts                ← GET */10: poll inbox + classify replies
│   │   ├── cron/daily-plan/route.ts                  ← GET 0 8 * * *: auto-gen today's plan
│   │   └── test/                                     ← CRON_SECRET-gated per-stage invokers
│   │       ├── analyze-one/route.ts
│   │       ├── audit-one/route.ts
│   │       ├── contacts-one/route.ts
│   │       ├── enrich-demo/route.ts
│   │       ├── enrich-one/route.ts
│   │       ├── pitch-one/route.ts
│   │       ├── recommend-one/route.ts
│   │       └── replies-one/route.ts
│   ├── layout.tsx                                    ← root <html>
│   └── page.tsx                                      ← redirects "/" → "/batches"
├── components/ui/                                    ← shadcn primitives (Base UI + Tailwind)
├── lib/
│   ├── analyze.ts                                    ← Haiku: pain points + score
│   ├── audit.ts                                      ← GMB + social + SerpApi + Groq summary
│   ├── booking-platforms.ts                          ← 16-platform regex table + generic CTA
│   ├── contacts.ts                                   ← Apollo: discoverPeople + revealEmail
│   ├── enrich.ts                                     ← Cheerio → ScrapingBee render → AI Extract → business email discovery
│   ├── email-discovery.ts                            ← extractEmailsFromHtml + pickBestEmail (vendor-domain filter, business-domain match, localpart ranking)
│   ├── errors.ts                                     ← ExternalAPIError (provider-tagged)
│   ├── llm/
│   │   ├── anthropic.ts                              ← analyze + pitch + planner
│   │   └── groq.ts                                   ← bulk summarization only
│   ├── pitch.ts                                      ← Sonnet: 4-sentence cold email, upsertable
│   ├── places.ts                                     ← Google Places (New): Text Search (paginates to 60 via nextPageToken, over-fetches 2×) + Details + filterDuplicatePlaces + filterByIcpFloors (rating / reviews / business_status / require_phone)
│   ├── plans.ts                                      ← planner (Opus) + executePlan + computeRecentPerformance
│   ├── prompts.ts                                    ← SINGLE source of truth for prompt templates
│   ├── recommend.ts                                  ← Sonnet: channel fit scores + phone script
│   ├── email/
│   │   ├── zoho.ts                                   ← Zoho OAuth + Mail API wrapper (send, folders, list)
│   │   ├── templates.ts                              ← HTML email builder + signature block + unsub token
│   │   └── replies.ts                                ← pollReplies: inbox poll + match + Haiku classify
│   ├── queue.ts                                      ← enqueueJob / getNextJobs / markJob* helpers
│   ├── scrape/
│   │   └── scrapingbee.ts                            ← renderPage + extractTypedFields
│   ├── seasonality.ts                                ← ~50-category peak-months calendar
│   ├── supabase/
│   │   ├── client.ts                                 ← browser (anon, RLS-scoped)
│   │   └── server.ts                                 ← supabaseAdmin (service role, SERVER ONLY)
│   └── utils.ts                                      ← cn() helper for shadcn
├── supabase/migrations/                              ← timestamped, append-only
│   ├── 20260420181100_init.sql                       ← M1–M10 schema
│   ├── 20260422000000_rename_place_id.sql            ← HERE → Google rename
│   ├── 20260422180000_contacts.sql                   ← M12 contacts + RLS
│   ├── 20260423000000_visibility_audits.sql          ← M13 visibility_audits + RLS
│   ├── 20260424000000_phase3.sql                     ← M18: score threshold, auto_enrich, scraped_data
│   ├── 20260424120000_plans.sql                      ← M20: icp_profile, lead_plans, lead_plan_items
│   ├── 20260424180000_channel_recommendations.sql    ← M22: channel_recommendations
│   ├── 20260425120000_email.sql                      ← M23: email_accounts, sent_emails, opens, replies, unsubs
│   ├── 20260425140000_email_poll_state.sql           ← M24: last_poll_at, inbox_folder_id, replies unique index
│   ├── 20260425160000_sender_signature.sql           ← post-M26: signature fields on email_accounts
│   ├── 20260425180000_icp_social_and_filter.sql      ← post-M26: icp social toggles + prospects.filter_reason
│   ├── 20260425200000_self_open_and_planner_aware.sql ← post-M26: is_probably_self + known_self_ips
│   ├── 20260425220000_email_discovery.sql            ← M28: prospects.email_source/confidence + icp.require_reachable
│   ├── 20260425230000_batch_filter_counts.sql        ← M29: batches.count_filtered_below_icp + count_duplicates_skipped
│   └── 20260427000000_phone_reveal.sql               ← M31: contacts.phone_revealed_at audit timestamp for Apollo phone reveals
├── .env.local.example                                ← all env keys, empty values
├── .mcp.json                                         ← Playwright MCP for local QA
├── vercel.json                                       ← cron schedule */2 * * * *
├── CLAUDE.md                                         ← root spec — rules + index
├── docs/                                             ← this directory
└── package.json
```

**One-line purpose per top-level folder:**

| Folder | Purpose | Rule |
|---|---|---|
| `app/(auth)/` | Public auth pages | No layout auth guard |
| `app/(dashboard)/` | Behind-auth UI | Layout redirects to `/login` if no session |
| `app/api/` | Server routes | JWT validation + ownership check (through `batches.user_id`) at route top |
| `app/api/test/` | Manual-debug endpoints | **Always `CRON_SECRET`-gated.** Never add a user-facing route here |
| `components/ui/` | shadcn primitives | Only edit to change design system; app pages consume, don't modify |
| `lib/` | Pure server logic | No JSX, no React, no `window.*`. Callable from cron + API + tests |
| `lib/llm/` | Thin provider clients | One file per provider |
| `lib/scrape/` | Scraping providers | One file per provider |
| `lib/supabase/` | DB clients | `client.ts` = browser/anon · `server.ts` = service role (SERVER ONLY) |
| `supabase/migrations/` | Schema history | **Append-only.** `YYYYMMDDHHMMSS_short_description.sql` |
| `docs/` | This directory | Living refs (ARCHITECTURE, CONVENTIONS) + archived phase specs + playbooks |

## Data model summary

Six core tables — see `supabase/migrations/20260420181100_init.sql` for the authoritative shape, and later migrations for additions.

- **`batches`** — user-triggered search. Fields: user_id, city, category, count_requested, count_completed, status, pitch_score_threshold, auto_enrich_top_n, **count_filtered_below_icp** (places dropped at import for not meeting min_gmb_rating / min_review_count / business_status), **count_duplicates_skipped** (places already existing as prospects)
- **`prospects`** — one per business. Fields: batch_id, name, address, phone, website, email, **email_source** ('website_scrape' | 'apollo' | null), **email_confidence** ('verified' | 'guessed' | null), place_id (globally unique — used for cross-batch dedup), rating, review_count, hours_json, categories_text, status (new | enriched | analyzed | ready | contacted | replied | rejected | failed | filtered_out), filter_reason
- **`enrichments`** — one per prospect. Fields: tech_stack_json, has_online_booking, has_ecommerce, has_chat, has_contact_form, is_mobile_friendly, ssl_valid, homepage_text_excerpt, scraped_data_json, fetch_error, fetched_at
- **`analyses`** — Haiku output. Fields: pain_points_json, opportunity_score, best_angle, analyzed_at
- **`contacts`** — one row per person. Fields: prospect_id, full_name, title, seniority, department, email, email_confidence, phone, linkedin_url, apollo_person_id, is_primary, email_revealed_at
- **`visibility_audits`** — one per prospect. Fields: gmb_*, social_links_json, follower counts, serp_rank_main, serp_rank_brand, meta_ads_*, visibility_summary
- **`pitches`** — Sonnet output. Fields: subject, body, edited_body, status (draft | approved | sent | replied), timestamps
- **`channel_recommendations`** — on-demand, one per prospect. Fields: phone_fit_score, email_fit_score, recommended_channel (phone | email | either), reasoning, phone_script, generated_at
- **`email_accounts`** — connected Zoho accounts (OAuth). Fields: user_id, email, display_name, zoho_account_id, api_domain, access_token, refresh_token, token_expires_at, daily_send_cap, sends_today, sends_reset_at, last_send_at, last_poll_at, inbox_folder_id, **sender_title, sender_company, calendly_url, website_url** (signature fields), **known_self_ips** (text[] — IPs captured via heartbeat to suppress sender-self opens)
- **`sent_emails`** — one row per send. Fields: pitch_id, contact_id, account_id, message_id, thread_id, subject, body_html, to_email, bounced, bounce_reason, sent_at
- **`email_opens`** — tracking-pixel hits. Fields: sent_email_id, opened_at, ip, user_agent, is_probably_mpp (true if hit <10s after send — likely Apple MPP or Gmail proxy), is_probably_self (true if request IP matches one of the sender's `email_accounts.known_self_ips` — sender browsing Sent folder, not a real recipient open)
- **`email_replies`** — matched reply messages. Fields: sent_email_id, received_at, snippet, classification (interested | not_interested | ooo | unsubscribe | question), raw_message_id (unique)
- **`email_unsubs`** — global opt-out list. Fields: contact_email (unique), unsubscribed_at, reason
- **`jobs`** — the simple queue. Fields: batch_id, prospect_id, job_type, status (pending | running | done | failed), attempts, last_error, created_at, processed_at

Phase 4A added:
- **`icp_profile`** — one per user. Services[], capacity, cities, rating/review floors, target_categories, plus optional hard filters: **require_reachable** (any email or phone — recommended for B2C-friendly), require_linkedin, require_instagram, require_facebook, require_business_phone (prospect missing a required signal gets `status='filtered_out'` at the audit-done boundary in cron)
- **`lead_plans`** — plan_date, rationale_json, status
- **`lead_plan_items`** — priority, city, category, count, reasoning, batch_id (populated on execute)

Every table has RLS enabled. Policies chain back to `auth.uid()` through the foreign-key graph (batch → user, prospect → batch → user, etc.).

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server only, never exposed to browser
GOOGLE_PLACES_API_KEY=
SCRAPINGBEE_API_KEY=
APOLLO_API_KEY=
SERPAPI_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
META_ACCESS_TOKEN=               # app token for public Meta endpoints
CRON_SECRET=                     # random string; cron route checks Bearer header
```

`.env.local.example` has all keys with empty values. Never commit real keys.

## When this codebase should split

Stay monolith until any of these happens, then re-evaluate:

- **lib/ exceeds 3,000 LOC** → break into subpackages by domain (`lib/pipeline/`, `lib/integrations/`, `lib/planning/`)
- **> 30 API routes** → introduce route groups (`app/api/(v1)/` etc)
- **More than one consumer** (mobile app wants same backend) → extract `lib/` to a workspace package
