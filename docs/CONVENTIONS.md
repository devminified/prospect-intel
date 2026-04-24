# Conventions

Read before adding code. Every rule exists because we already hit the gap during a past milestone.

## Naming

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

## Where things go — decision tree

```
Is it server-side business logic (no React, no browser globals)?
  → lib/
     ├─ thin wrapper around one external API?      → lib/<category>/<provider>.ts
     ├─ shared infra (errors, queue, db clients)?  → lib/*.ts root (errors.ts, queue.ts, supabase/)
     └─ pipeline stage (enrich, analyze, pitch)?   → lib/<stage>.ts

Is it an HTTP handler?
  → app/api/<resource>/[...].ts
     — JWT auth at top · ownership check · structured error
  Is it CRON_SECRET-gated and only for debugging?  → app/api/test/*

Is it React?
  → app/(dashboard)/<route>/page.tsx  (client component, shadcn primitives, supabase client + fetch)
  OR app/(auth)/<route>/page.tsx (public)

Is it a prompt string?
  → lib/prompts.ts  (NEVER inline in api routes or lib modules)

Is it a schema migration?
  → supabase/migrations/<new-timestamp>_<desc>.sql
  Changing an existing column's meaning?  → NEW alter/rename migration, never edit an old one
```

## Coding style

- TypeScript strict mode on.
- `async/await` everywhere. No `.then()` chains.
- API routes always return `NextResponse.json(...)` with explicit status codes.
- All DB access via `lib/supabase/server.ts` (service role). Never expose the service key to the browser.
- `try/catch` at every API route boundary. Log to console. Return `{ error: string }` with 4xx/5xx.
- No `any`. If you don't know the shape, define an interface.
- Comments explain **why**, not **what**. Default to no comment. Add one only when removing it would confuse a future reader.
- Never log or echo secrets. If a debug line needs to confirm a key is set, print its length, not its value.

## Error handling rules

- Every `fetch` boundary wrapped in `try/catch`.
- Every caught error carries a readable `.message`. Use `errorMessage(err)` from `lib/errors.ts` when you don't control the shape.
- Provider-tagged errors (`[Google Places] …`, `[Apollo] …`, `[ScrapingBee] …`) via `ExternalAPIError` — see the external-API playbook.
- API route errors return `{ error: string }` with 4xx/5xx status — never swallow into 200.
- Background job errors (cron dispatcher) get written to `jobs.last_error` and surface per-prospect in the batch detail UI.
- Every `fetch` gets `signal: AbortSignal.timeout(ms)`. Serverless has a 60s hard ceiling on Vercel Pro.
- Audit-style fan-out uses `Promise.allSettled` when a single signal failing shouldn't kill the whole job. Hard-fail only on critical-path stages.

## UI conventions

- **shadcn/ui primitives** in `components/ui/` (Base UI + Tailwind). Don't bring in another component library.
- **Client components only** (`'use client'`). Every dashboard page does its own data fetching via the `supabase` client with the user's session.
- **Theming via CSS variables** — use `text-muted-foreground`, `bg-primary/5`, `border-destructive/20`, etc. Avoid hard-coded gray-500 / indigo-600. This keeps dark mode free.
- **Error display**: `<div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>`. Success: green-50 variant.
- **Auth header helper**: `const token = (await supabase.auth.getSession()).data.session?.access_token; fetch(url, { headers: { Authorization: \`Bearer ${token}\` } })`. See `app/(dashboard)/prospects/[id]/page.tsx::authHeaders()`.
- **Nav**: add new top-level pages in `app/(dashboard)/layout.tsx`. Keep the list short — if past 5 links, introduce a dropdown or sidebar.

## Testing

We don't write unit tests. Verification is manual, driven by three tools:

1. **Test endpoints** (`app/api/test/*-one`) — CRON_SECRET-gated, run one pipeline stage against one prospect. Use when iterating on a lib module without running a full batch.
2. **`curl` scripts in chat** — submit a batch, drive the cron, check rows. Embedded in every milestone verification.
3. **Playwright MCP** — drives the UI end-to-end when available. Screenshots in `.playwright-mcp/`.

No CI gate. If a change breaks the happy path, the next batch will surface it. This is a deliberate MVP choice.

## Anti-patterns — DO NOT

- **Don't inline prompt strings** in `api/` or `lib/<stage>.ts`. All prompts live in `lib/prompts.ts`.
- **Don't call `supabaseAdmin` from client code.** Service role key must never reach the browser.
- **Don't hand-edit an existing migration.** Schema changes go in a NEW timestamped file.
- **Don't add a dependency without flagging it.** Every npm package is latency, bundle size, and security surface.
- **Don't chain jobs inside `lib/<stage>.ts`.** The cron processor owns chaining. Lib modules stay pure: read, work, write.
- **Don't catch-and-ignore.** If you `try/catch`, re-throw, log, or return a structured error.
- **Don't add features, refactors, or abstractions beyond the task.** A bug fix doesn't need surrounding cleanup.
- **Don't add backwards-compatibility shims** when you can just change the code — no team-mates depending on the old API.

## When to update `docs/` and CLAUDE.md

- Every milestone that ships a new lib module, table, or API route.
- Every time the folder tree changes non-trivially.
- When a convention changes.
- Shipped phase specs compress to ≤ 20 lines in `docs/phases/CURRENT.md`'s replacement, and the full spec moves to `docs/phases/archive/phase-N-<name>.md`, within a week of ship.

Put the update in the same commit as the code change. Never ship code and update docs in a separate PR — the two will drift.
