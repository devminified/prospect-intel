# Current phase

**Active:** none. Phases 1 → 4C all shipped. Last milestone: M26 on 2026-04-25.

The full outbound loop now works end-to-end:

```
plan (Opus, outcome-weighted) → enrich → analyze → pitch
  → send via Zoho → track opens → detect replies → classify
  → feed back into tomorrow's plan
```

**Candidates for Phase 5 (not prioritized):**
- **M27** — Google Trends/News momentum via SerpApi. Previously deferred; revisit if reply-loop signal plateaus.
- **Multi-user / team accounts.** Would require RLS rewrites, account switching, shared ICPs.
- **Second sender domain** (e.g. `mail.devminified.com`) if daily volume exceeds 50/day and main-domain reputation is at risk.
- **Thread-aware reply matching** (match on thread_id + sender) to catch forwarded/alias replies.
- **Longer reply content fetch** — currently classify from Zoho's message summary; upgrade to `/content` for replies >500 chars.
- **Dashboard: outcomes over time** — charts of reply rate trends by category/month.
- **A/B test framework for pitch prompts** — swap the pitch template, compare interested-rate after 30 days.

When a new phase starts, replace this file's contents with:
- Goal + why now
- Milestone list with verification criteria
- Locked decisions (in scope vs explicitly deferred)
- Budget expectations

When the phase ships, compress this file to ≤ 20 lines, move the full spec to `archive/phase-N-<name>.md`, and return this file to the standby state above.
