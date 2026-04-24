# Phase 4B — Outbound execution (M23–M24)

**Status:** Shipped 2026-04-25.

**What it is:** The send-and-track loop. Pitches now leave the app via the user's own Zoho Workspace inbox, come back as opens + replies, and get auto-classified by Haiku. The planner (Phase 4C) then uses those outcomes as feedback.

Preceded by the standalone **M22 — channel recommendation** (on-demand Sonnet call per prospect scoring phone vs email fit and generating a cold-call script). M22 isn't a Phase 4B milestone but shipped in the same window.

## Milestones

### M23 — Zoho send + open tracking + unsubscribe

- **OAuth2 connect flow** via `/api/auth/zoho/{authorize,callback}`. Cookie-based CSRF state. Scopes: `ZohoMail.messages.CREATE`, `ZohoMail.messages.READ`, `ZohoMail.accounts.READ`.
- **Send route** `POST /api/pitches/:id/send`. Daily cap + 30s spacing + auto token refresh + unsub check + bounce capture.
- **Tracking pixel** `/api/track/open/:sent_email_id` — 1×1 PNG, logs `email_opens` row. MPP-aware: opens within 10s of send get `is_probably_mpp=true` and are counted separately in the UI.
- **Unsubscribe** `/api/unsub?t=<b64url(contact_id)>` — public page, writes to `email_unsubs`, blocked on future sends.
- **Click tracking intentionally OFF** — link rewriting is a top-3 spam signal for cold email. Kept simple: pixel + unsub footer only.
- **UI:** `/settings/email` for Connect/disconnect/daily cap. Prospect detail gets **Send via Zoho** button + status strip (opens · replies · bounce · timestamp).

**Deliverability decision:** user sends from main domain `muhammadmahad@devminified.com` at 20/day. Acceptable risk with warmup. If volume scales past 50/day → migrate to `mail.devminified.com` subdomain.

### M24 — Reply polling + Haiku classifier

- **Cron** `/api/cron/read-replies` every 10 min. Matches inbox replies against `sent_emails.to_email` (case-insensitive). Dedupes via unique index on `email_replies.raw_message_id`.
- **Haiku classifier** tags each reply: `interested | not_interested | ooo | unsubscribe | question`. Classifies from Zoho's message summary field (no extra /content fetch needed).
- **Status propagation:** matched reply → `pitches.status='replied'` → `prospects.status='replied'`.
- **UI:** prospect detail pitch panel shows color-coded classification badge (green/red/sky/neutral/amber) + last-reply timestamp.

## Data model added

Migration `20260425120000_email.sql`:
- `email_accounts` — OAuth tokens, daily_send_cap, sends_today counters, spacing state
- `sent_emails` — one row per send, message_id + thread_id for reply threading
- `email_opens` — pixel hits with `is_probably_mpp` flag
- `email_replies` — sent_email_id FK, received_at, snippet, classification, raw_message_id
- `email_unsubs` — global opt-out list

Migration `20260425140000_email_poll_state.sql`:
- `email_accounts.last_poll_at` + `inbox_folder_id` (cached on first poll)
- Unique index on `email_replies.raw_message_id`

## Key decisions (carry forward)

- **Zoho Mail API domain is `mail.zoho.com`, NOT the OAuth-returned `api_domain`.** The OAuth response points at the generic Zoho API gateway (`www.zohoapis.com`) which doesn't serve Mail. We derive the Mail base from `ZOHO_ACCOUNTS_BASE` and override whatever OAuth returned. If multi-region support is needed, handle regional accounts domain → mail domain map.
- **Sender matching only** (not thread_id) for reply detection. Misses <5% of cases (forwarded replies, aliases). Upgrade path: also match on thread_id.
- **Summary-based classification** for Haiku. Good enough for short replies; could miss nuance in long ones. Upgrade path: fetch `/content` for replies longer than N chars.
- **Click tracking is OFF by default.** Do not re-enable without research showing it doesn't hurt deliverability from this domain.

## Budget impact

- Zoho Workspace: no added cost (user's existing seat)
- Haiku reply classifier: ~$0.001 per reply · at ~50 replies/mo ≈ $0.05/mo
- No new infrastructure — all crons run on existing Vercel Pro

## Post-ship improvements (2026-04-25)

Sender signature + Calendly + Devminified branding on outbound pitches, shipped after Phase 4C to polish the sending experience before the learning loop accumulates data.

- **Migration `20260425160000_sender_signature.sql`** adds four nullable columns on `email_accounts`: `sender_title`, `sender_company`, `calendly_url`, `website_url`.
- **`lib/email/templates.ts`** rewritten to render a proper signature block below the pitch body — name (bold), title · company, then Calendly link + website link, separated from the body by a subtle 1px border. 560px max-width container with system-font stack + 15px/1.6 line height for readable typography on desktop and mobile.
- **Pitch prompt** updated with an explicit rule: `DO NOT include a signature line or sign-off ("— Name", "Best,", "Cheers,", etc)`. The template owns the signature; Sonnet was sometimes adding its own, which duplicated.
- **`/settings/email`** gains an Email signature card with four inputs + a live preview that renders exactly how the block will appear in outgoing mail. Defaults seed `company='Devminified'` and `website='https://devminified.com'` so first-time setup is one click.
- **Send route** reads the four signature fields from the account row and passes them via the new `EmailSignatureInput` type.

Design constraint (carry forward): **no images, no emoji, no color banners, no multi-column layouts in outbound pitches.** Cold-email spam filters punish all of those. Only the 1×1 tracking pixel + text-based signature. If future milestones want a "branded template" option, gate it behind a settings toggle and A/B-test reply-rate impact before defaulting it on.
