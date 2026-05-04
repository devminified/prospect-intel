# Current phase

**Active:** none.

Phase 10A shipped 2026-05-04 (`archive/phase-10a-deal-pipeline.md`).
Phase 11 (Upwork CRM module, A–D) shipped 2026-05-05 (`archive/phase-11-upwork-crm.md`).

Next candidates (not started):
- **Phase 10B — Outbound audit log.** Capture every state-changing user action on the outbound side (assignee changes, role changes, ownership transfers, sends, deal-stage moves). Admin question: "who did what when?" without trawling Supabase logs.
- **Phase 10C — Outbound reply auto-routing.** Use the existing Haiku reply classifier output to auto-set `outreach_status` (`interested` → qualified, `not_interested` → not_interested, OOO → snooze a follow-up). Same machinery could also auto-bump `deal_stage` (interested → qualified at minimum).
- **Phase 12 — Upwork API integration.** OAuth into Upwork to auto-pull jobs / proposals / messages / contracts. Replaces manual entry on the Upwork side. The API has gaps that may need Playwright fallbacks for some flows.

Pick when ready.
