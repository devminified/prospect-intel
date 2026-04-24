# Phase 2 — Account intelligence (M11–M15)

**Status:** Shipped.

**What changed vs Phase 1:**
- Prospect source switched from HERE → **Google Places API (New)** after M10 dogfood showed HERE returned only 3 results for "med spas in Austin"
- Website scraping added **ScrapingBee** fallback when Cheerio returns <500 chars (JS-rendered sites: Wix, Squarespace, Shopify)
- New module: **contact enrichment** via Apollo.io — decision maker, title, email, LinkedIn, phone. One `contacts` row per person; `is_primary` flag picks pitch recipient
- New module: **visibility audit** — GMB reviews, social handles + follower counts, SerpApi rank for category + brand, Meta Ads Library, Google News
- **Groq** (`llama-3.3-70b-versatile`) added for bulk summarization in visibility audits (~20× cheaper than Sonnet)

## Milestones

### M11 — Google Places + ScrapingBee
- Rewrite `lib/places.ts` for Google Places API (New): Text Search (up to 60 via pagination) + Place Details
- Dropped `HERE_API_KEY`, added `GOOGLE_PLACES_API_KEY`, `SCRAPINGBEE_API_KEY`
- `lib/enrich.ts`: if Cheerio homepage excerpt < 500 chars, re-fetch via ScrapingBee `render_js=true`
- ✅ "med spas in Austin" returns ≥15 real prospects. Wix/Squarespace sites return real body text.

### M12 — Contact enrichment
- `lib/contacts.ts`: `findContacts(prospectId)` → Apollo People Search scoped to company domain. Writes up to 5 `contacts` rows. Marks most senior decision-maker as `is_primary` (owner → c_suite → vp → director → manager)
- New job type `find_contacts`. Cron chained `analyze → find_contacts`
- Later split in M17 into `discoverPeople` (cheap) + `revealEmail` (per-contact credit)
- ✅ A real Austin med spa gets ≥1 contact row with verified email + LinkedIn

### M13 — Visibility audit
- `lib/audit.ts`: `auditVisibility(prospectId)` — parallelizes 5 external calls (GMB, social discovery, SerpApi category + brand rank, Meta Ad Library, Google News via SerpApi)
- Groq single-prompt summary after `Promise.allSettled`
- New job type `audit_visibility`. Cron chained `find_contacts → audit_visibility`
- Later in M18 dropped Google News (noisy: "Do Beautiful Birds Have an Evolutionary Advantage?" on a med spa)
- ✅ Real med spa gets audit row with ≥3 of 5 signal categories + readable summary

### M14 — UI + updated CSV
- `/prospects/[id]` extended with Contacts table + Visibility panel
- Pitch prompt updated to reference primary contact + visibility summary
- CSV export added: contact_name, contact_title, contact_email, contact_linkedin, opportunity_score, gmb_rating, gmb_review_count, primary_social
- ✅ Exported CSV has new columns; pitch addresses primary contact by name

### M15 — LLM provider abstraction
- `lib/llm/anthropic.ts` (analyze + pitch) and `lib/llm/groq.ts` (audit summary) — both expose the same `generateStructured` interface
- ✅ Audit summaries via Groq; analyze + pitch still via Anthropic; spend aligned with budget

## Data model added

Migration `0003_phase2.sql` added `contacts` and `visibility_audits` tables. See current migrations directory for shape.

`jobs.job_type` extended to include `find_contacts` and `audit_visibility` — no schema migration needed (text column accepts new values).

## New prompts

- Pitch prompt: added `{contact_first_name}` and `{visibility_summary}` placeholders. Rule: open with "Hey {first_name} —" if known. Use visibility snapshot only if it contains a specific strong signal.
- Visibility summary prompt (Groq): factual 2–3 sentence digital footprint description. No editorializing.

## Budget expectations (locked at ship)

At 1000 prospects/mo: ~$510 total. Google Places $34, ScrapingBee $49, Apollo $270, SerpApi $50, Anthropic $100, Groq $5. ~$180 fixed platform fees; variable cost ≈ $0.40/prospect.

## Carry-forward decisions

- Apollo stays as the contact source (LinkedIn + seniority baked in)
- Groq only for summarization — analyze + pitch stay on Anthropic for quality
- SerpApi Google News dropped in M18 for noise
