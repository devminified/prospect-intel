# Phase 11 — Upwork CRM module

**Status:** shipped 2026-05-05
**Goal:** add a parallel module alongside the outbound side for managing the team's Upwork business-development operation. Multiple Upwork profiles, separate per-profile managers + bidders, the full bid → proposal → conversation → contract → analytics loop, RBAC-isolated from outbound so the two modules can't accidentally leak access into each other.

The module ships as four sub-phases (A–D) plus 8 new tables, ~17 service modules, ~24 API routes, ~15 UI pages.

## Module isolation rule (the design constraint that drove everything)

Outbound and Upwork are **isolated modules sharing one team boundary**. Membership in one does not confer access to the other:

- **Outbound manager** (`team_members.role='manager'`) — manages outbound only. Has zero automatic Upwork access.
- **Upwork profile manager** (`upwork_profile_members.role='manager'`) — manages a specific Upwork profile only.
- A user holding both roles → access to both sides.
- **Only the team owner bypasses both module gates** (CEO-level visibility).
- New `bidder` team role — minimal team membership, zero outbound permissions, Upwork access only via per-profile membership rows.

The nav layout filters tabs against this matrix: bidders only see `Dashboard / Leads / Team` blank-stubs and the `Upwork` tab; outbound-only roles never see `Upwork`; the pure-bidder redirect bounces them to `/upwork` if they navigate to outbound URLs.

## What shipped

### Phase 11A (M72–M76) — Foundation

Schema (`20260506000000_upwork_foundation.sql`):
- `upwork_profiles` — one per Upwork freelancer/agency account the team operates from. Includes `connects_balance` snapshot updated by the M77 trigger.
- `upwork_profile_members` — per-profile junction with `role: manager | bidder`. Partial unique index enforces ≤1 manager per profile.
- `upwork_clients` — team-scoped buyer dedup so two profiles don't unknowingly bid the same client.
- New `bidder` value added to the `team_members.role` CHECK constraint.

Service / API / UI:
- `lib/services/access.ts` extended with `requireUpworkAccess`, `requireUpworkProfileAccess`, `requireUpworkProfileManager`. Owner-only bypass; team manager does NOT auto-pass.
- `lib/services/upwork-profiles.ts` — getMyAccess / list / detail / create (owner-only) / update / archive / addMember / setMemberRole / removeMember / listAddableTeamMembers.
- `/api/upwork/access`, `/api/upwork/profiles`, `/api/upwork/profiles/[id]`, `/api/upwork/profiles/[id]/members`, `/api/upwork/profiles/[id]/members/[userId]`.
- `/upwork/profiles` list + `/upwork/profiles/[id]` detail with member management UI.
- Layout NAV: Upwork tab visible iff `useUpworkAccess().has_access`. Pure-bidder redirect from non-`/upwork` URLs → `/upwork`.

### Phase 11B (M77–M80b) — Jobs + Proposals + Connects ledger

Schema (`20260507000000_upwork_jobs_proposals_connects.sql`):
- `upwork_jobs` — team-scoped postings, unique `(team_id, upwork_job_id)` for cross-profile dedup. `parseUpworkJobId()` pulls the external id from the URL.
- `upwork_proposals` — one bid per `(profile_id, job_id)`. Status enum `drafted/sent/viewed/shortlisted/interview/declined/withdrawn/hired/no_response`. Bidder is the team member who hit Send.
- `upwork_connects_log` — append-only ledger with `purchase / grant / refund / spend / adjustment` types + `signed_amount` + `balance_after`. AFTER INSERT trigger keeps `upwork_profiles.connects_balance` in sync.

Service / API / UI:
- `lib/services/upwork-jobs.ts` — listJobs / getJob / createJob (auto-dedup by external id) / updateJob / setJobStatus / deleteJob.
- `lib/services/upwork-proposals.ts` — listForProfile / listForJobScoped (only proposals for profiles the caller can see) / createProposal (auto-writes Connects spend on `status='sent'`) / sendDraft / changeStatus / updateNotes.
- `lib/services/upwork-connects.ts` — listEntries / getBalance / recordEntry (manager-only; rejects negative-balance) / recordSpendForProposal (internal, called by proposal submit).
- `/api/upwork/jobs` + `/api/upwork/jobs/[id]`, `/api/upwork/proposals` + `/api/upwork/proposals/[id]`, `/api/upwork/profiles/[id]/proposals`, `/api/upwork/profiles/[id]/connects`.
- `/upwork/jobs` list + create form, `/upwork/jobs/[id]` detail with per-profile bid form (only profiles the user belongs to + that haven't bid yet appear in the picker), `/upwork/profiles/[id]/proposals` per-profile list with inline status select, `/upwork/profiles/[id]/connects` ledger with manager-only `+ Log entry` form.

### Phase 11C (M81–M84) — Conversations + Contracts + Milestones + Time logs

Schema (`20260508000000_upwork_conversations_contracts.sql`):
- `upwork_conversations` — thread between team and a client. Status enum `waiting_reply / replying / interviewing / negotiating / closed_won / closed_lost / stale`. Denormalized `last_message_at` + `last_message_from ('us' | 'them')` + `needs_reply` flag for fast list rendering. Optional FK to the originating proposal so bid → thread conversion is clean.
- `upwork_messages` — append-only thread log. Direction sent/received, `occurred_at` is the Upwork-side timestamp (not when our app captured it).
- `upwork_contracts` — signed engagement. Type `fixed | hourly` with separate `agreed_total_usd` / `agreed_rate_usd`. Status `active/paused/ended/disputed`. Origin links to proposal + conversation (both nullable for direct-hire flows).
- `upwork_contract_milestones` — fixed-price scoping with sequence, amount, status enum (`pending/funded/in_progress/submitted/paid/disputed/refunded`), per-status timestamps.
- `upwork_time_logs` — weekly hourly entries unique on `(contract, bidder, week_starting)`. `hourly_rate_usd` snapshotted at log time so retroactive rate changes don't rewrite history. `amount_usd` is a stored generated column. Status `logged → billed → paid → disputed`.

Service / API / UI:
- `lib/services/upwork-conversations.ts` — listForProfile / getDetail / createConversation / updateConversation / appendMessage. appendMessage auto-updates `last_message_at` + `last_message_from` + `needs_reply` (received → flag, sent → clear).
- `lib/services/upwork-contracts.ts` — listForProfile / getDetail (loads milestones for fixed, time_logs for hourly) / createContract (manager-only) / updateContract / addMilestone / updateMilestone / deleteMilestone / logHours / changeTimeLogStatus / deleteTimeLog. logHours upserts on `(contract, bidder, week)`; week is normalized to the Monday via `mondayOf()`. Refuses to overwrite billed/paid weeks.
- 9 new API routes under `/api/upwork/conversations`, `/api/upwork/contracts`, `/api/upwork/milestones`, `/api/upwork/time-logs`, plus per-profile listing routes.
- `/upwork/profiles/[id]/conversations`, `/upwork/conversations/[id]`, `/upwork/profiles/[id]/contracts`, `/upwork/contracts/[id]` (type-aware body — milestones for fixed, time logs for hourly).

### Phase 11D (M85–M87) — Analytics

Read-only aggregations. No new schema — all rollups in JS over existing tables (acceptable at the team's scale; would push to SQL views if a single profile's row count grows past ~10k).

- `lib/services/upwork-analytics.ts` — `getProfileDashboard` (funnel + connects + contracts + revenue snapshot per profile), `getOverview` (cross-profile revenue + per-profile breakdown), `getBidderLeaderboard` (per-bidder roll-up; manager-or-owner-only, scoped to profiles the caller manages — bidders get 403).
- `/api/upwork/profiles/[id]/dashboard`, `/api/upwork/overview`, `/api/upwork/leaderboard`.
- `/upwork` replaced its redirect-to-/profiles with a real overview page (totals row + 12-month revenue bar chart + per-profile breakdown table).
- `/upwork/leaderboard` — bidder leaderboard with reply/interview/hire rates + connects spent + hours logged + revenue attributed.
- `/upwork/profiles/[id]` got a new Dashboard card embedded between the quick-jump tiles and the Members table — funnel bars, Connects card with spend-per-hire metric, contracts summary, revenue card, window picker (30/90/365/all-time).

## Locked decisions

- **Owner is the only role that auto-bypasses Upwork gates.** The team-wide `manager` role grants outbound management only — they need an explicit `upwork_profile_members` row for any Upwork access. "Outbound manager" and "Upwork manager" are different concepts.
- **One bid per (profile, job).** A withdrawn bid is updated, not replaced. Re-bidding from the same profile means changing status, not inserting a 2nd row.
- **Connects ledger is the source of truth.** The `upwork_profiles.connects_balance` snapshot is updated by an AFTER INSERT trigger. Service layer writes also work; the trigger is defense-in-depth so manual SQL inserts (backfills) keep the snapshot accurate.
- **Bidder is the row author for proposals.** Even if a profile manager later edits the proposal status, `bidder_user_id` stays as whoever first hit Send. This is what the leaderboard attribution uses.
- **Time logs upsert per `(contract, bidder, week)`.** Hours REPLACE on re-log (the bidder enters their cumulative weekly total each save). Refuses to overwrite billed/paid weeks.
- **Milestones can only be deleted while pending.** Once funded the row stays; status reflects the outcome (paid / disputed / refunded). Protects against accidental data loss after escrow is in motion.
- **Analytics in JS, not SQL views.** Acceptable for current scale; if any profile crosses ~10k rows we'd revisit.
- **No Upwork API integration** in this phase — all data is manually entered. Future phase could automate via Upwork OAuth, but the API has known gaps that would need Playwright fallbacks.

## Carry-forward

- **Upwork API auto-pull.** Future phase could OAuth into Upwork to auto-import jobs / proposals / messages / contracts. Out of scope here; user wanted manual-entry first to verify the model.
- **Per-message attachments.** `upwork_messages.attachments_json` exists but the UI only renders body text. File-upload + inline rendering would extend it.
- **Cross-profile client roll-up.** `upwork_clients` is team-scoped already, but no UI surfaces "this client has hired across multiple of our profiles" yet. Drop-in for a future client-list page.
- **Contracts page filter on client.** Adding `?client_id=` to the contract list would let a single-client profitability view fall out for free.
