# Architecture

## Two-module overview

The app is one Next.js deployment but two parallel product modules sharing the team boundary:

```
                           Devminified team
                          ┌──────────────────┐
   OUTBOUND ──────────────┤ team_members     ├────────────── UPWORK
   (cold prospecting)     │  owner / manager │       (agency BD operation)
                          │  lead_gen        │
                          │  cold_caller     │
                          │  closer          │
                          │  bidder          │
                          └──────────────────┘
                              │           │
              outbound roles  │           │  upwork_profile_members
              gate /leads     │           │  gate /upwork
              etc.            │           │  per profile + role
```

**Module isolation rule:** owner is the only role that bypasses both gates. Team-wide manager grants outbound management only — Upwork access requires an explicit `upwork_profile_members` row. Bidder = Upwork-only (zero outbound permissions). The nav layout filters tabs against this matrix; pure-bidder accounts auto-redirect from outbound URLs to `/upwork`.

## High-level flow

```
Browser
  │
  ▼
Next.js on Vercel (one app, one deployable)
  ├── app/(auth)/…            ← public login + invite-only /signup + /no-team
  ├── app/(dashboard)/…       ← auth-guarded UI: outbound + /upwork sub-tree
  ├── app/api/…               ← API routes (mostly thin delegators to lib/services)
  └── lib/
       ├── types/              ← Zod schemas + z.infer types (single source of truth)
       ├── db/                 ← typed Supabase queries (no business logic)
       ├── services/           ← business layer: RBAC + Zod validation + composes db
       ├── queries/            ← TanStack Query hooks (browser only)
       ├── pipeline/           ← cron-driven outbound stages (enrich/analyze/etc)
       └── <vendor>/           ← apollo, contacts, lusha, places, llm, scrape, email
       │
       ▼
  Vercel Cron (three schedules — all OUTBOUND only):
    ├─ */2  → /api/cron/process       (outbound pipeline driver)
    ├─ */10 → /api/cron/read-replies  (Zoho inbox poll + Haiku classify)
    └─ 0 8  → /api/cron/daily-plan    (auto-gen today's plan at 08:00 UTC)
       │
       ▼
  Supabase (Postgres + Auth + RLS)
       │
       ▼
  External APIs: Google Places (New), ScrapingBee (render + AI Extract),
                 Apollo.io, Lusha, SerpApi, Anthropic, Groq, Meta Graph, Zoho Mail
```

The Upwork module currently has no cron — it's manual data entry only. Future Phase 12 may add Upwork API auto-pull.

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

## Folder tree (current — Phase 11D)

```
prospect-intel/
├── app/
│   ├── (auth)/                          ← public routes
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx              ← invite-token-gated (M67)
│   │   └── no-team/page.tsx             ← orphan-account landing
│   ├── (dashboard)/                     ← auth-guarded by layout (probes /api/team for orphan→/no-team redirect)
│   │   ├── layout.tsx                   ← session guard + role-gated nav (incl. Upwork tab + pure-bidder redirect)
│   │   ├── dashboard/page.tsx           ← outbound dashboard + team-progress card (owner+manager)
│   │   ├── batches/                     ← outbound batch list + detail
│   │   ├── leads/page.tsx               ← outbound list + Group-by Outreach/Pipeline kanban + DnD
│   │   ├── plans/                       ← outbound daily planner
│   │   ├── prospects/[id]/page.tsx      ← outbound prospect detail (1300+ lines, TanStack)
│   │   ├── settings/{icp,email,team}/   ← outbound settings
│   │   └── upwork/                      ← Phase 11 module (parallel to outbound)
│   │       ├── page.tsx                 ← cross-profile overview + revenue chart
│   │       ├── leaderboard/             ← bidder leaderboard (manager+ scoped)
│   │       ├── jobs/                    ← team-wide jobs list + detail with bid form
│   │       ├── conversations/[id]/      ← message thread + status flow
│   │       ├── contracts/[id]/          ← type-aware: milestones (fixed) or time logs (hourly)
│   │       └── profiles/
│   │           ├── page.tsx             ← profiles list (owner-only create)
│   │           └── [id]/
│   │               ├── page.tsx         ← profile detail: tiles + dashboard + members
│   │               ├── proposals/       ← per-profile proposals
│   │               ├── conversations/   ← per-profile threads
│   │               ├── contracts/       ← per-profile contracts
│   │               └── connects/        ← Connects ledger
│   ├── api/
│   │   ├── auth/zoho/{authorize,callback}/    ← OAuth (legacy pattern — non-Bearer)
│   │   ├── auth/heartbeat/                    ← capture sender IP for self-open filter
│   │   ├── batches/route.ts                   ← thin delegator → batchesService.create
│   │   ├── cron/process/                      ← every 2 min outbound pipeline
│   │   ├── cron/read-replies/                 ← every 10 min inbox poll + Haiku classify
│   │   ├── cron/daily-plan/                   ← 08:00 UTC outbound planner auto-gen
│   │   ├── icp/                               ← outbound ICP CRUD
│   │   ├── invite/[token]/                    ← public token-redeem
│   │   ├── pitches/{[id]/send,export}/        ← Zoho send + CSV export
│   │   ├── plans/{,[id]/execute}/             ← Opus generate + plan execution
│   │   ├── prospects/[id]/{,...}              ← detail + nested actions (assign, status, deal_stage, mutations, contacts)
│   │   ├── team/{,members,invites,progress,transfer-ownership}/  ← team-side management
│   │   ├── performance/                       ← outbound (category,city) reply aggregates
│   │   ├── unsub/                             ← public unsubscribe redemption
│   │   ├── track/open/[id]/                   ← 1x1 PNG + email_opens log
│   │   ├── upwork/                            ← Phase 11 — parallel module
│   │   │   ├── access/                        ← my role + profile membership count
│   │   │   ├── overview/                      ← cross-profile dashboard
│   │   │   ├── leaderboard/                   ← bidder roll-up (manager+ scoped)
│   │   │   ├── profiles/{,[id]/{members,proposals,conversations,contracts,connects,dashboard}}
│   │   │   ├── jobs/{,[id]}/                  ← team-wide jobs + dedup
│   │   │   ├── proposals/{,[id]}/             ← bid actions
│   │   │   ├── conversations/{,[id]/messages} ← thread + append-only messages
│   │   │   ├── contracts/{,[id]/{milestones,time-logs}}
│   │   │   ├── milestones/[id]/               ← fixed-price scoping
│   │   │   └── time-logs/[id]/                ← hourly logs
│   │   └── test/                              ← CRON_SECRET-gated per-stage invokers
│   ├── invite/[token]/page.tsx                ← invite redemption flow
│   ├── layout.tsx                             ← root <html>
│   └── page.tsx                               ← redirects "/" → "/dashboard"
├── components/ui/                             ← shadcn primitives
├── lib/                                       ← layered architecture (Phase 8/9)
│   ├── types/                                 ← Zod schemas + z.infer types (single source of truth — see CONVENTIONS § Layered architecture)
│   │   ├── prospect.ts                        ← Prospect / ProspectStatus / OutreachStatus / DealStage
│   │   ├── upwork.ts                          ← UpworkProfile / UpworkProfileRole / UpworkClient / UpworkAccessInfo
│   │   ├── upwork-jobs.ts                     ← Upwork jobs + proposals + connects ledger
│   │   ├── upwork-conversations.ts            ← Upwork threads + messages
│   │   ├── upwork-contracts.ts                ← Upwork contracts + milestones + time logs
│   │   ├── upwork-analytics.ts                ← analytics rollup shapes (no Zod — read-only)
│   │   ├── views.ts · prospect-detail.ts · email-account.ts · job.ts · …
│   │   └── (other domain types)
│   ├── db/                                    ← typed Supabase queries (no business logic)
│   │   ├── prospects.ts · contacts.ts · followups.ts · notes.ts · batches.ts · teams.ts · icp.ts
│   │   ├── upwork-profiles.ts · upwork-jobs.ts · upwork-proposals.ts · upwork-connects.ts · upwork-conversations.ts · upwork-contracts.ts
│   ├── services/                              ← business layer: RBAC + Zod + composes db + vendors
│   │   ├── access.ts                          ← requireProspectAccess / requireTeamAccess / requireUpworkAccess / requireUpworkProfileAccess / requireUpworkProfileManager
│   │   ├── route-helper.ts                    ← withAuth wrapper + readJsonBody
│   │   ├── errors.ts                          ← DomainError subclasses (Validation/Forbidden/Conflict/NotFound)
│   │   ├── auth.ts · batches.ts · contacts.ts · followups.ts · icp.ts · notes.ts · pitches.ts · plans.ts · prospects.ts · recommendations.ts · teams.ts · team-progress.ts · performance.ts
│   │   ├── upwork-profiles.ts · upwork-jobs.ts · upwork-proposals.ts · upwork-connects.ts · upwork-conversations.ts · upwork-contracts.ts · upwork-analytics.ts
│   ├── queries/                               ← TanStack Query hooks (browser only)
│   │   ├── api-client.ts (in lib/) · keys.ts (cache key registry)
│   │   ├── batches.ts · batch-detail.ts · contacts.ts · dashboard.ts · email-account.ts · followups.ts · icp.ts · leads.ts · notes.ts · plans.ts · prospect-detail.ts · team.ts
│   │   ├── upwork-profiles.ts · upwork-jobs.ts · upwork-conversations.ts · upwork-contracts.ts · upwork-analytics.ts
│   ├── pipeline/                              ← cron-driven OUTBOUND stages (no Upwork)
│   │   └── enrich.ts · analyze.ts · audit.ts · pitch.ts · recommend.ts · plans.ts
│   ├── apollo/                                ← Apollo HTTP layer (split from old lib/contacts.ts in M61)
│   ├── contacts/                              ← contact-row orchestration (Apollo + GMB + Lusha glue)
│   ├── places/                                ← Google Places client
│   ├── lusha/                                 ← Lusha v2 person-match
│   ├── email/                                 ← zoho.ts (OAuth + Mail API), templates.ts, replies.ts (poll + classify)
│   ├── llm/                                   ← anthropic.ts (Haiku/Sonnet/Opus), groq.ts (bulk summary)
│   ├── scrape/                                ← scrapingbee.ts (render + AI Extract)
│   ├── supabase/                              ← client.ts (anon RLS) + server.ts (service role)
│   ├── hooks/                                 ← legacy custom hooks (use-notes/use-followups/use-contact-mutations) — TanStack-backed internally
│   ├── api-client.ts · auth-headers.ts · errors.ts · ics.ts · prompts.ts · queue.ts · rbac.ts · seasonality.ts · team.ts · utils.ts · booking-platforms.ts · email-discovery.ts
├── supabase/migrations/                       ← timestamped, append-only — see ARCHITECTURE.md "Migration history" below
├── .env.local.example                         ← all env keys, empty values
├── .mcp.json                                  ← Playwright MCP for local QA
├── vercel.json                                ← cron schedules
├── CLAUDE.md                                  ← root spec — rules + index
├── docs/                                      ← this directory + per-phase archive
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

The schema is split between the outbound module (the original ~13 tables) and the Upwork module (Phase 11, 11 new `upwork_*` tables). Every table has RLS enabled. After Phase 6 (M42-M48) RLS policies route through `team_members` rather than direct `auth.uid()` ownership, so members can see + mutate their team's data subject to per-route role gates.

### Outbound module

- **`teams`**, **`team_members`**, **`team_invites`** — Phase 6 multi-tenancy. `team_members.role` enum: `owner | manager | lead_gen | cold_caller | closer | bidder` (the last added in M72 as Upwork-only). Up to 2 owners per team enforced by trigger (M69). `team_invites.upwork_assignments_json jsonb default '[]'` (M88) carries `[{ profile_id, role }]` to fan out Upwork profile memberships on redeem; populated from one of seven invite presets (outbound role × 4, single-profile Upwork bidder/manager, combined manager).
- **`batches`** — user-triggered search. Fields: user_id, team_id, city, category, count_requested, count_completed, status, pitch_score_threshold, auto_enrich_top_n, **count_filtered_below_icp**, **count_duplicates_skipped**.
- **`prospects`** — one per business. Fields: batch_id, name, address, phone, website, email, **email_source** ('website_scrape' | 'apollo' | null), **email_confidence**, place_id (globally unique), rating, review_count, status (new | enriched | analyzed | ready | contacted | replied | rejected | failed | filtered_out), filter_reason, **assigned_to + assigned_at** (Phase 7), **outreach_status** (M36, manual call-outcome), **deal_stage + deal_stage_changed_at** (Phase 10A — 7-stage CRM funnel: lead → contacted → qualified → meeting → proposal → won + terminal lost).
- **`enrichments`** — Cheerio + ScrapingBee output. tech_stack_json, has_online_booking, has_ecommerce, has_chat, has_contact_form, is_mobile_friendly, ssl_valid, scraped_data_json, fetch_error.
- **`analyses`** — Haiku output. pain_points_json, opportunity_score, best_angle.
- **`contacts`** — one per person. prospect_id, full_name, title, seniority, email, email_confidence, **phone, phone_source** (gmb_business | lusha_direct | apollo_legacy | manual — M34), **phone_revealed_at**, linkedin_url, apollo_person_id, is_primary.
- **`visibility_audits`** — gmb_*, social_links_json, follower counts, serp_rank_main/brand, meta_ads_*, visibility_summary.
- **`pitches`** — Sonnet output. subject, body, edited_body, status (draft | approved | sent | replied).
- **`channel_recommendations`** — on-demand. phone_fit_score, email_fit_score, recommended_channel, reasoning, phone_script.
- **`email_accounts`** — connected Zoho. UNIQUE `(team_id, provider)` after M70 (one mailbox per team, both owners share). Fields: zoho_account_id, api_domain, access/refresh tokens, daily_send_cap, sends_today, last_poll_at, signature fields (sender_title, sender_company, calendly_url, website_url), known_self_ips.
- **`sent_emails`** + **`email_opens`** (with is_probably_mpp + is_probably_self filters) + **`email_replies`** (with Haiku classification: interested/not_interested/ooo/unsubscribe/question) + **`email_unsubs`** (global opt-out).
- **`prospect_notes`** + **`prospect_followups`** — Phase 5 CRM-lite layer.
- **`icp_profile`** — Phase 4A planner config, one per user. Services, capacity, cities, rating/review floors, target_categories, **hard filters** (require_reachable | require_linkedin | require_instagram | require_facebook | require_business_phone — failing prospects get `status='filtered_out'`).
- **`lead_plans`** + **`lead_plan_items`** — Phase 4A daily plans.
- **`jobs`** — the only queue. Fields: batch_id, prospect_id, job_type, status, attempts, last_error.

### Upwork module (Phase 11)

- **`upwork_profiles`** — one per Upwork freelancer/agency account the team operates from. Fields: team_id, name, slug (unique per team), description, account_type (individual | agency), profile_url, hourly_rate_usd, **connects_balance** (snapshot updated by `trg_upwork_sync_balance` AFTER INSERT on the ledger), status (active | paused | archived).
- **`upwork_profile_members`** — junction `(profile_id, user_id)` with `role: manager | bidder`. Partial unique index enforces ≤1 manager per profile.
- **`upwork_clients`** — team-scoped buyer dedup. UNIQUE `(team_id, upwork_client_id)`.
- **`upwork_jobs`** — postings the team is tracking. UNIQUE `(team_id, upwork_job_id)` for cross-profile dedup. Budget shape (fixed/hourly with min/max), skills jsonb, status (open | closed | hired_other | dead).
- **`upwork_proposals`** — one bid per `(profile_id, job_id)`. bidder_user_id, cover_letter, bid_amount_usd, bid_type (fixed/hourly), proposed_milestones_json, **connects_spent**, status enum (drafted/sent/viewed/shortlisted/interview/declined/withdrawn/hired/no_response), per-status timestamps.
- **`upwork_connects_log`** — append-only ledger. Type enum (purchase/grant/refund/spend/adjustment), amount + signed_amount + balance_after, related_proposal_id (set when a 'spend' is auto-written by proposal submit). The trigger keeps `upwork_profiles.connects_balance` in sync.
- **`upwork_conversations`** — thread between team and client. proposal_id (nullable for direct hires), client_id, status (waiting_reply | replying | interviewing | negotiating | closed_won | closed_lost | stale), denormalized last_message_at + last_message_from ('us' | 'them') + needs_reply.
- **`upwork_messages`** — append-only thread log. direction (sent/received), occurred_at (Upwork-side timestamp).
- **`upwork_contracts`** — signed engagement. type (fixed | hourly), agreed_total_usd | agreed_rate_usd, status (active | paused | ended | disputed), end_reason, optional FKs to proposal + conversation.
- **`upwork_contract_milestones`** — fixed-price scoping. sequence (1-based, unique per contract), name, amount_usd, status (pending → funded → in_progress → submitted → paid + disputed/refunded), per-status timestamps.
- **`upwork_time_logs`** — hourly weekly entries. UNIQUE `(contract, bidder, week_starting)` — week is the Monday. hourly_rate_usd snapshotted at log time. amount_usd is a **stored generated column** (`hours * rate`). status (logged → billed → paid → disputed).

RLS gates everything through `is_team_member(team_id)` either directly or via the parent profile's team_id. Per-route role gates layer on top — see `lib/services/access.ts`.

## Environment variables

The canonical list lives in `CLAUDE.md` § 3 — this is a quick reference:

```
# Outbound side
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
GOOGLE_PLACES_API_KEY · SCRAPINGBEE_API_KEY
APOLLO_API_KEY · LUSHA_API_KEY (optional — direct/mobile reveal)
SERPAPI_KEY · META_ACCESS_TOKEN
ANTHROPIC_API_KEY · GROQ_API_KEY
CRON_SECRET                        # gates /api/cron/* + /api/test/*
ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / NEXT_PUBLIC_APP_URL    # outbound mailbox

# Upwork side
# (none — manual entry only as of Phase 11D; Phase 12 may add UPWORK_OAUTH_*)
```

`.env.local.example` has all keys with empty values. Never commit real keys.

## When this codebase should split

The original splitting heuristics were calibrated for a single-module app. Phase 11 added a parallel module sharing the team boundary, which inflates the line counts but doesn't change the deployment story — both modules are still one Next.js app on one Vercel project. Re-evaluate when:

- **A second product team owns one of the two modules.** Then the boundary becomes a real API contract and a separate deploy starts paying for itself.
- **lib/ exceeds 6,000 LOC** (was 3,000 pre-Phase-11 — current ~9k as of 11D, mostly typed services + db modules).
- **More than one consumer** (mobile app, public API, etc.) — extract `lib/` to a workspace package and treat the Next.js app as one of many consumers.
- **Cron schedules diverge per module** — if Phase 12 adds Upwork-side cron jobs and they have meaningfully different SLAs from outbound, splitting cron into its own deployable starts to make sense.
