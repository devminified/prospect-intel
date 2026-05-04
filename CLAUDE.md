# CLAUDE.md — Prospect Intel

Root spec for contributors (human or AI). Live rules here; detail in `docs/`.

---

## 0. Rules of Engagement (read twice)

1. **Monolithic Next.js app.** Everything — frontend, API routes, background jobs, DB access — lives in one repo, one deployable. No microservices, no separate backend, no queue beyond the `jobs` table.
2. **Ship the MVP, not the dream.** If a feature isn't in the current phase spec (`docs/phases/CURRENT.md`), don't build it. If tempted, stop and ask.
3. **Work incrementally.** Build in the order the current phase spec gives. Don't jump ahead. After each milestone, run the app and verify it works before moving on.
4. **Ask before assuming.** If an API key, env var, or business decision is missing, stop and ask. Don't invent credentials or mock services that pretend to work.
5. **Layered architecture (Phase 8+).** Code lives in named layers — UI → queries → services → db → types. Each layer only depends on layers below it. UI never touches Supabase directly; routes are thin delegators to services. Allowed libraries: Supabase client, fetch, Cheerio, Anthropic SDK, shadcn primitives, **Zod** (validation at every boundary), **TanStack Query** (server state). Still NO DI containers, custom ORMs, event buses, LangChain, ORMs other than the Supabase client, RxJS, or anything else not in this list. Adding a new library requires updating this rule + a phase note explaining why. See `docs/CONVENTIONS.md` for the layer contract.
6. **Deploy early, deploy often.** Every milestone ends with a green Vercel deploy.
7. **No speculative features.** No "might be useful later" code. Delete it.
8. **Respect the budget.** Every added library, page, or table earns its place.

## 1. What we're building (one paragraph)

Two parallel modules sharing one team boundary, both for the agency that runs the app. **Outbound** (the original): user picks a city + category + count → app pulls businesses from Google Places → extracts tech signals from each website → asks Claude to identify operational pain → asks Claude to write a 4-sentence cold email per prospect → user reviews and exports a CSV for Instantly/Smartlead, OR sends via Zoho with open + reply tracking. The magic is **evidence-backed specificity**: every pitch references something concrete about that specific business. Phase 4A added a daily planner; Phase 10A added a kanban deal-pipeline. **Upwork** (Phase 11, parallel module): tracks the agency's Upwork business-development team — multiple Upwork profiles, each with a manager + bidders, the full bid → proposal → conversation → contract loop with Connects ledger + milestone/time-log tracking + per-profile and bidder analytics. The two modules are RBAC-isolated: outbound managers don't auto-see Upwork; Upwork bidders don't see outbound. Only the team owner bypasses both gates.

## 2. Tech stack (non-negotiable)

| Layer           | Tool                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| Framework       | Next.js 15 (App Router), TypeScript strict, Tailwind v4                |
| UI primitives   | shadcn/ui (Base UI + Tailwind) — `components/ui/`                       |
| Hosting         | Vercel (Pro — cron every 2 min)                                        |
| DB + Auth       | Supabase (Postgres + Supabase Auth + RLS)                              |
| Prospect source | Google Places API (New) — Text Search + Place Details                   |
| Scraping        | `fetch` + Cheerio → ScrapingBee render fallback → ScrapingBee AI Extract |
| Contacts        | Apollo.io — discovery opt-in, email reveal per-contact                 |
| Visibility      | GMB via Google Places · social link parse · SerpApi rank · Meta Ad Library |
| LLMs            | `@anthropic-ai/sdk` — Haiku 4.5 (analyze), Sonnet 4.6 (pitch), Opus 4.7 (planner) · Groq `llama-3.3-70b-versatile` (bulk summaries only) |
| Background jobs | Vercel Cron → `/api/cron/process` every 2 min                           |

Model strings (use exactly):
- Haiku: `claude-haiku-4-5-20251001`
- Sonnet: `claude-sonnet-4-6`
- Opus: `claude-opus-4-7`

## 3. Environment variables

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
LUSHA_API_KEY=                   # OPTIONAL — direct/mobile reveal for B2B decision-makers (sync). For SMB ICPs the GMB phone is usually enough.
```

`.env.local.example` has all keys with empty values. Never commit real keys. Never log or echo them.

## 4. Architecture, folder tree, data model

See **`docs/ARCHITECTURE.md`** — pipeline flow, full folder tree, data-model summary, when-to-split criteria.

## 5. Conventions + playbooks

See **`docs/CONVENTIONS.md`** — naming, where-things-go decision tree, coding style, error handling, UI conventions, testing approach, anti-patterns.

Per-task playbooks in `docs/playbooks/`:
- `add-pipeline-stage.md` — new stage like enrich / analyze / pitch
- `add-external-api.md` — new vendor integration
- `add-api-route.md` — new HTTP handler (skeleton with auth + ownership check)
- `add-table.md` — new Supabase table with RLS policy

## 6. Phase status

**Shipped** (summaries in `docs/phases/archive/`):
- **Phase 1 (M1–M10)** — MVP pipeline. `archive/phase-1-mvp.md`
- **Phase 2 (M11–M15)** — Google Places, ScrapingBee, Apollo, visibility audit, Groq. `archive/phase-2-intel.md`
- **Phase 3 (M16–M19)** — ScrapingBee AI Extract, 16-platform booking regex, Apollo opt-in, pitch gate, stuck-job reaper, pitch uses scraped data. `archive/phase-3-efficiency.md`
- **Phase 4A (M20)** — Daily lead planner with ICP + Opus 4.7. Dogfooded 2026-04-24. `archive/phase-4a-planner.md`
- **M21** — shadcn/ui migration across all 9 dashboard pages + CLAUDE.md restructure.
- **M22** — On-demand channel-fit recommendation per prospect (Sonnet scores phone vs email + writes cold-call opening script). New `channel_recommendations` table, `POST /api/prospects/:id/recommend-channel`, UI panel on prospect detail, CSV export columns added.
- **Phase 4B (M23–M24)** — Zoho send + open tracking + unsubscribe + reply polling + Haiku classifier. Post-ship: sender signature + Calendly + Devminified branding on outbound. `archive/phase-4b-outbound.md`
- **Phase 4C (M25–M26)** — Reply-outcome feedback into planner + daily 08:00 UTC auto-gen cron. Post-ship hygiene rounds added: duplicate detection, optional ICP hard filters (LinkedIn/Instagram/Facebook/phone), planner now sees hard filters at plan time, self-open suppression, **M28 — business email discovery + `require_reachable` ICP filter**, **M29 — pre-batch ICP enforcement** (rating/review_count/business_status hard-filtered at import; `batches.count_filtered_below_icp` + `count_duplicates_skipped` persisted), and **M30 — Places pagination (up to 60 candidates) + 2× over-fetch + `require_business_phone` moved to pre-batch filter** so a `count: 50` plan item actually attempts to deliver 50 active leads, and **M31 — Apollo phone reveal** as an explicit per-contact action with separate credit-pool accounting (`contacts.phone_revealed_at` + `POST /api/prospects/:id/contacts/:contactId/reveal-phone`), and **M32 — webhook architecture** for Apollo's async phone delivery (since rolled back in M34), **M33 — full phone call script** (opening → discovery → value bridge → soft close → objection handlers → voicemail; 350–500 words), and **M34 — phone reveal hybrid (Path C)**: replaced Apollo's flaky async phone reveal with two paths — free `useBusinessPhone` (copies `prospects.phone` from Google listing into the contact) and paid `findDirectLine` via Lusha v2/person sync API. `contacts.phone_source` enum tracks origin. Apollo phone-reveal route + webhook removed; `LUSHA_API_KEY` env added. **M35 — lead-stage filter chips** on batch detail (All / No outreach / In contact / Opened / Replied / Call phase) plus per-row outreach chips so you can scan a batch by funnel stage. Pure UI on existing tables. `archive/phase-4c-learning.md`

- **Phase 5 (M37–M40)** — CRM-lite layer over the outbound loop. Global `/leads` view (M37 stage filters + outreach status + viewed + sort + saved views in localStorage + kanban toggle), per-prospect `prospect_notes` + activity timeline (M38), `prospect_followups` table + ICS calendar download (M39), `/dashboard` with KPI tiles deep-linking into filtered leads + Today's follow-ups (overdue/today/upcoming) + recent activity feed (M40). `archive/phase-5-crm-lite.md`
- **M41** — extracted custom hooks (`use-notes`, `use-followups`, `use-contact-mutations`) on the prospect detail page; dropped 12 useState declarations. Shared `lib/auth-headers.ts`.
- **Phase 6 (M42–M48)** — multi-team. `teams` / `team_members` / `team_invites` tables, RLS rewritten to gate via team membership, `team_id` backfilled onto user-keyed tables, route-layer team resolution + RBAC for the four roles (owner / manager / lead_gen / cold_caller / closer). `/settings/team` UI + magic-link invite + `/invite/[token]` redemption. `archive/phase-6-multi-team.md`
- **Phase 7 (M49–M51)** — assignment + team ops. `prospects.assigned_to` + `assigned_at` (M49) with self-vs-others RBAC and "My leads" / "Unassigned" / per-member filters. Member removal + ownership transfer via atomic `transfer_team_ownership` SQL function (M50) — owner can demote/remove non-owners, managers can demote only. RBAC sweep across discover-contacts / regenerate-pitch / find-direct-line / use-business-phone / contact PATCH (M51) with stale `batches.user_id` checks replaced by `getProspectTeamAccess`. `archive/phase-7-assignment-rbac.md`
- **Phase 8 (M52–M59)** — layered architecture refactor. Added Zod + TanStack Query (CLAUDE.md §0 #5 rewritten to bless them). New layers: `lib/types/` (12 Zod schemas + types), `lib/db/` (8 typed query modules), `lib/services/` (9 service modules + DomainError + Zod + RBAC), `lib/queries/` (TanStack hooks + `lib/api-client.ts`). Sixteen API routes refactored to thin delegators (−1395 / +251 lines). Three of four heavy pages migrated to TanStack (`/dashboard`, `/leads`, `/batches/[id]`). Prospect detail TanStack migration deferred to Phase 9. See `docs/CONVENTIONS.md` § Layered architecture for the layer contract. `archive/phase-8-architecture.md`
- **Phase 9 (M60–M63)** — finish the architecture migration. Ten more routes converted to `withAuth` + service delegation; `/api/batches`, `/api/plans`, `/api/plans/[id]/execute`, `/api/pitches/export`, `/api/pitches/[id]/send`, `/api/performance`, plus four prospect/contact mutations. `lib/` reorganized: `lib/places/`, `lib/lusha/`, `lib/apollo/` (split out of the old `lib/contacts.ts`), `lib/contacts/index.ts` for the row-write orchestration, and `lib/pipeline/{enrich,analyze,audit,pitch,recommend,plans}.ts`. Six remaining pages migrated to TanStack (`/batches`, `/plans`, `/plans/[id]`, `/settings/{icp,email,team}`). Type extraction sweep — every inline `interface`/`type` in pages, queries, and routes moved into `lib/types/`; new aggregate files `views.ts`, `prospect-detail.ts`, `email-account.ts`, `job.ts`. Custom hooks (`use-notes`, `use-followups`, `use-contact-mutations`) rewritten to use TanStack mutations + optimistic updates internally; public API unchanged. `archive/phase-9-architecture-finish.md`
- **Phase 10A (M64–M66)** — Deal pipeline + kanban DnD. New `prospects.deal_stage` (7-stage funnel: lead → contacted → qualified → meeting → proposal → won + terminal lost) + `deal_stage_changed_at`. Free-form text not enum, same pattern as `outreach_status`. `prospectsService.setDealStage` gated by `canSetOutreachStatus`. `/leads` kanban gained a "Group by: Outreach / Pipeline" toggle and `@dnd-kit` drag-and-drop with optimistic re-bucketing. Saved views remember `groupBy`. `archive/phase-10a-deal-pipeline.md`
- **Post-Phase-10A hygiene (M67–M71)** — Same week as 10A. **M67** locked `/signup` behind invite tokens (closed a real security gap: anyone could self-signup + auto-provision a team), added `/no-team` landing, killed `lib/team.ts` auto-team-provisioning (returns `NO_TEAM` sentinel now). **M68** wiped lead data for clean slate. **M69** allowed up to 2 owners per team via DB trigger (capped) + role-change service rewrite (last-owner protection + self-step-down + dropped the legacy `team_members_one_owner_idx`). **M70** team-scoped Zoho — `email_accounts` unique now `(team_id, provider)` so both owners see the same connected mailbox. **M71** team-progress card on `/dashboard` (owner + manager only): per-member rollup of leads/sent/opened/replied/won. Plus a nav-RBAC sweep gating Plans/Batches/ICP to `createWork`, Email to owner-only, and excluding `bidder` from outbound tabs.
- **Phase 11 (M72–M87)** — Upwork CRM module. Parallel module sharing the team boundary but RBAC-isolated: outbound managers don't auto-see Upwork; Upwork bidders don't see outbound. New `bidder` team role (Upwork-only, zero outbound permissions). 11 new tables under `upwork_*`. Per-profile `manager | bidder` membership; only the team owner bypasses Upwork gates. **11A=foundation** (profiles, profile_members, clients), **11B=jobs/proposals/Connects ledger** (auto-spend on bid submit + AFTER INSERT trigger keeping the `connects_balance` snapshot in sync), **11C=conversations/contracts/milestones/time logs** (fixed-price tracks milestones; hourly tracks weekly time logs with rate-snapshot at log time), **11D=analytics** (per-profile dashboard with funnel + Connects + revenue, cross-profile overview at `/upwork`, bidder leaderboard with profile-manager scoping). Manual entry only — no Upwork API integration yet. `archive/phase-11-upwork-crm.md`

**Active:** see `docs/phases/CURRENT.md`. Today: none.

**Next candidates (not started):** Phase 10B (audit log) · Phase 10C (reply auto-routing via Haiku classifier) · Phase 12 (Upwork API integration to replace manual entry).

## 7. Coding conventions (summary — detail in `docs/CONVENTIONS.md`)

- TypeScript strict. `async/await`. No `.then()` chains. No `any`.
- All DB via `lib/supabase/server.ts` (service role) — SERVER ONLY. Browser uses `lib/supabase/client.ts` (anon + RLS).
- Every API route: JWT auth at top, ownership check via FK chain, `try/catch` at boundary, structured `{ error: string }` on failure.
- Prompts live in `lib/prompts.ts` — never inline.
- Schema migrations are **append-only**: new file per change, never edit an old one.
- Every `fetch` gets `AbortSignal.timeout(ms)`. Wrap non-2xx responses in `ExternalAPIError` with a provider tag.
- Comments explain **why**, not what. Default to none.
- UI uses shadcn primitives with CSS variable theming (`text-muted-foreground`, `bg-primary/5`). No hard-coded `gray-500` / `indigo-600`.

## 8. Testing

No unit tests (deliberate MVP choice). Verification is manual via:
1. `app/api/test/*-one` — CRON_SECRET-gated, runs one stage on one prospect
2. `curl` scripts + row-level Supabase checks
3. Playwright MCP for UI end-to-end when available

## 9. When in doubt

- If the user's request contradicts this file, follow the user's request but flag the conflict.
- If you finish a milestone early, stop. Don't freelance the next one.
- If you hit an ambiguity not covered in `docs/`, ask. Don't guess.
- If a third-party API is flaky or returns surprising data, show the user the real response and let them decide.
- If you notice a genuine improvement (not shiny-thing), describe it in one sentence and ask before building it.

## 10. Docs maintenance rule

Update `docs/` and CLAUDE.md in the **same commit** as the code change. Never ship code and update docs in a separate PR — the two drift within a week.

When a phase ships:
1. Within one week, compress the `docs/phases/CURRENT.md` spec to ≤ 20 lines summarizing what shipped + key decisions
2. Move the full spec to `docs/phases/archive/phase-N-<name>.md`
3. Reset `CURRENT.md` to "Active: none" (or the next phase's spec)
4. Add one line to §6 above pointing to the new archive file
5. Trim `CLAUDE.md` of anything the new archive now covers

Violating this rule is how CLAUDE.md grew to 1,281 lines. Don't.
