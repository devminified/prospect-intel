# Phase 3 — Efficiency pass (M16–M19)

**Status:** Shipped.

**What triggered this:** M13 dogfood exposed four issues:
1. **Wild and Beautiful Natural Aesthetics** pitch recommended online booking to a clinic that already had a Book Now CTA — detector only caught Calendly/Acuity/OpenTable/Resy/Square/Yelp
2. At 2700 prospects/mo, Apollo-on-every-prospect would cost $400+/mo in email reveals — wasted on leads the user never planned to pitch
3. Cron run hit Vercel's 60s `FUNCTION_INVOCATION_TIMEOUT` on sequential Sonnet calls, leaving 3 jobs stuck `running` forever
4. Google News press mentions returned generic noise on local businesses

## Milestones

### M16 — Scraper upgrade
- Added `lib/scrape/scrapingbee.ts` with `renderPage(url)` + new `extractTypedFields(url, schema)` calling ScrapingBee **AI Extract**
- Added `lib/booking-platforms.ts` with 16-platform regex table (Vagaro, Boulevard, Mindbody, Zenoti, GlossGenius, Jane, Mangomint, Fresha, Booker, Schedulicity, Timely, Cliniko + original 4) plus generic `book|appointment|schedule` CTA catch-all
- `lib/enrich.ts` orchestrates: Cheerio first → ScrapingBee render fallback < 500 chars → AI Extract once for `{booking_platform, book_url, primary_cta, services, team_members}` → write to `enrichments.scraped_data_json`
- ✅ Wild and Beautiful re-enriched → `scraped_data_json.booking_platform` populated, `has_online_booking=true`, regenerated pitch no longer recommends booking

### M17 — Apollo smart opt-in
- `lib/contacts.ts` split: `discoverPeople(prospectId)` (calls `/mixed_people/api_search`, writes contacts with `email=null`) + `revealEmail(contactId)` (calls `/people/match`, spends 1 credit, sets `email_revealed_at`)
- Removed `find_contacts` from cron auto-chain
- Cron checks `batches.auto_enrich_top_n` at audit-completion boundary: if set, enqueue `discover_contacts` for top N prospects by `opportunity_score`
- New routes: `POST /api/prospects/:id/discover-contacts` + `POST /api/prospects/:id/contacts/:contactId/reveal`
- UI: batch form gets "Auto-enrich top N" input (default 10, 0 = off). Prospect detail gets "Find decision makers" button + per-contact "Reveal email" button
- ✅ 10-prospect batch with `auto_enrich_top_n=3` runs Apollo on exactly 3. Clicking Reveal spends exactly 1 credit.

### M18 — SerpApi trim + pitch gate + stuck-job reaper
- Dropped `fetchPressSignals` from `lib/audit.ts`. `press_mentions_count` + `press_mentions_sample_json` now null. UI panel hides when null.
- Batch form: "Skip pitch for prospects scoring below N" input (blank = off). Cron reads `batches.pitch_score_threshold`, skips pitch chaining at analyze-done boundary if below.
- `app/api/cron/process/route.ts` adds stuck-job reaper at handler top:
  ```ts
  await supabaseAdmin.from('jobs')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .lt('processed_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
  ```
- ✅ Stuck running job reset on next cron run. `pitch_score_threshold=60` batch → prospects scoring <60 stay at `analyzed`, no pitch.

### M19 — Pitch prompt uses scraped data
- `lib/prompts.ts` pitch prompt receives `{primary_cta}` and `{booking_status}`. New rule: if `booking_status` indicates booking already present, DO NOT recommend online booking — pick another pain.
- Added "Regenerate" button on pitch panel → re-runs Sonnet with latest enrichment
- ✅ Wild and Beautiful regenerated pitch no longer recommends online booking

## Data model added

Migration `20260424_phase3.sql`:
- `contacts.email_revealed_at timestamptz`
- `batches.pitch_score_threshold int` (null = no gate)
- `batches.auto_enrich_top_n int default 0`
- `enrichments.scraped_data_json jsonb`

## Budget expectations (locked at ship)

At 2700 prospects/mo, ~150 email reveals/mo: ~$603–$621/mo. With `pitch_score_threshold=50` filtering ~30% of low-scoring leads, drops to ~$520/mo.

Google Places ~$90, ScrapingBee Business $99, Apollo Professional $79 (+ ~$0–$18 overage), SerpApi Developer $50, Anthropic ~$270 (~$190 with gate), Groq ~$15.

## ScrapingBee AI Extract schema

```json
{
  "booking_platform": "string — specific platform name (Vagaro, Boulevard, Mindbody, Calendly, Acuity, Squarespace Scheduling, etc.) or 'none'",
  "book_url": "string — full URL of primary booking link or empty",
  "primary_cta": "string — most prominent CTA button text on homepage",
  "services": ["services/treatments, max 10"],
  "team_members": [{"name": "string", "title": "string", "bio_url": "string"}]
}
```

## Carry-forward decisions

- Apollo contact discovery is **opt-in only** — cron never auto-runs it, either user clicks the button or `auto_enrich_top_n` triggers it for the top N
- Email reveal is **never** a cron job — always inline in the API route on user click
- Every Vercel serverless function needs a stuck-job safety net or equivalent idempotency
