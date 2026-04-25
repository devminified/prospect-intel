# CLAUDE.md — Prospect Intel

Root spec for contributors (human or AI). Live rules here; detail in `docs/`.

---

## 0. Rules of Engagement (read twice)

1. **Monolithic Next.js app.** Everything — frontend, API routes, background jobs, DB access — lives in one repo, one deployable. No microservices, no separate backend, no queue beyond the `jobs` table.
2. **Ship the MVP, not the dream.** If a feature isn't in the current phase spec (`docs/phases/CURRENT.md`), don't build it. If tempted, stop and ask.
3. **Work incrementally.** Build in the order the current phase spec gives. Don't jump ahead. After each milestone, run the app and verify it works before moving on.
4. **Ask before assuming.** If an API key, env var, or business decision is missing, stop and ask. Don't invent credentials or mock services that pretend to work.
5. **No fancy abstractions.** Plain functions in `lib/`. Plain API routes. Plain SQL. Supabase client + fetch + Cheerio + Anthropic SDK + shadcn primitives. That's it. No DI containers, no custom ORMs, no event buses, no LangChain.
6. **Deploy early, deploy often.** Every milestone ends with a green Vercel deploy.
7. **No speculative features.** No "might be useful later" code. Delete it.
8. **Respect the budget.** Every added library, page, or table earns its place.

## 1. What we're building (one paragraph)

Cold-outreach tool for a dev + AI automation agency. User picks a city + category + count → app pulls businesses from Google Places → extracts tech signals from each website → asks Claude to identify operational pain → asks Claude to write a 4-sentence cold email per prospect → user reviews and exports a CSV for Instantly/Smartlead. The magic is **evidence-backed specificity**: every pitch references something concrete about that specific business. Phase 4A added a daily planner that tells the user *which* city + category to run each morning.

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
- **Phase 4C (M25–M26)** — Reply-outcome feedback into planner + daily 08:00 UTC auto-gen cron. Post-ship hygiene rounds added: duplicate detection, optional ICP hard filters (LinkedIn/Instagram/Facebook/phone), planner now sees hard filters at plan time, self-open suppression, and **M28 — business email discovery during enrichment with `require_reachable` ICP filter** (B2C-friendly reachability check that supersedes the LinkedIn proxy). `archive/phase-4c-learning.md`

**Active:** see `docs/phases/CURRENT.md`. Today: none.

**Next candidates (not started):** Phase 4B (Instantly/Smartlead + reply-rate feedback) · Phase 4C (daily cron auto-gen, Google Trends/News, reply classifier).

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
