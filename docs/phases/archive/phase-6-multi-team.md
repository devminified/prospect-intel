# Phase 6 — Multi-team management (M42–M48)

**Status:** Shipped 2026-05-03.

**What it is:** Single-user → multi-team. Owner / Manager / Lead Generator / Cold Caller / Closer roles, with per-role action gating at the API layer. Existing solo data was auto-migrated into a "Devminified" team so nothing in Phases 1–5 broke.

## Milestones

### M42 — Schema (additive)
Three new tables: `teams`, `team_members` (composite PK with role enum, partial unique index enforcing one owner per team at the DB level), `team_invites` (with `token`, `expires_at` default +7 days, `accepted_at`). Read-only RLS — writes flow through service-role API routes.

### M43 — Backfill `team_id`
Added `team_id uuid references teams(id) NOT NULL` to four user-keyed tables: `batches`, `icp_profile`, `lead_plans`, `email_accounts`. PL/pgSQL block creates a "Devminified" team per distinct user, makes them owner, sets team_id on every existing row. Idempotent on re-run.

### M44 — RLS rewrite (highest-risk)
Dropped 18 user_id-based policies. New `is_team_member(uuid)` SECURITY DEFINER helper. Every team-scoped table gates via team membership chain (direct, one-hop via batches, two-hop via prospects → batches, or via email_accounts). RLS only checks team membership; finer-grained permission checks live at the API route layer.

### M45 — Route-layer `team_id` injection
M44 made every existing INSERT into the four direct tables fail (NOT NULL constraint with no team_id supplied). Six insert sites updated to call `resolveUserTeamId(userId)` from `lib/team.ts` and include team_id in the payload. Auto-provisions a "My Team" personal team for fresh-signup users.

### M46+M47 — Team UI + invite flow
- `GET/PATCH /api/team` — current team + members + pending invites; owner-only rename.
- `POST/DELETE /api/team/invites` — owner/manager-only; generates 32-byte hex token, dispatches Supabase auth magic-link with redeem URL as redirectTo, returns the URL for manual share fallback.
- `POST /api/team/invites/redeem` — validates token (not expired / not redeemed / email matches signed-in user), inserts team_member, marks accepted. Idempotent.
- `/settings/team` page — three cards (name, members, invite). Roles surface as colored chips. Pending invites table with revoke. Copy redeem URL with one click.
- `/invite/[token]` page outside the dashboard layout group. Three states: not signed in (redirect to `/login?next=/invite/...`), signed in (accept button + signout escape), success/error.
- "Team" added to top nav.

### M48 — RBAC enforcement
`lib/rbac.ts` with `getUserRole(userId, teamId)` and `can*` helpers. Four high-impact gates wired:
- `POST /api/batches` → `canCreateBatch` (owner / manager / lead_gen).
- `PATCH /api/icp` → `canEditIcp` (same).
- `POST /api/pitches/[id]/send` → `canSendEmail` (owner / manager / closer).
- `PATCH /api/prospects/[id]` outreach_status branch → `canSetOutreachStatus` (owner / manager / cold_caller / closer).

Other write routes default to "any member" for now. Refine incrementally as friction surfaces.

## Role matrix

| Action                    | Owner | Manager | Lead Gen | Cold Caller | Closer |
|---------------------------|:-----:|:-------:|:--------:|:-----------:|:------:|
| Read everything            | ✓     | ✓       | ✓        | ✓           | ✓      |
| Add notes / followups      | ✓     | ✓       | ✓        | ✓           | ✓      |
| Create batch / plan        | ✓     | ✓       | ✓        | —           | —      |
| Edit ICP                   | ✓     | ✓       | ✓        | —           | —      |
| Set outreach_status        | ✓     | ✓       | —        | ✓           | ✓      |
| Send cold email            | ✓     | ✓       | —        | —           | ✓      |
| Invite/remove members      | ✓     | ✓       | —        | —           | —      |
| Rename team                | ✓     | —       | —        | —           | —      |

## Key decisions (carry forward)

- **RLS for read isolation; route layer for action gating.** Cleaner error UX (route can return "your role does not permit X" with explanation; RLS would just return 0 rows or 403 with no context).
- **Legacy `user_id` columns retained** on the four direct tables. Some routes still reference them. A future cleanup migration can drop them once every read site is verified team-scoped.
- **Auto-provision "My Team" for fresh signups** in `resolveUserTeamId`. Keeps the app self-bootstrapping. Solo users can rename in `/settings/team`.
- **Magic-link invite via Supabase auth admin** with redirect to `/invite/[token]`. If SMTP is dodgy, the invite still exists — copy URL and share manually.
- **Owner can't be invited.** `team_invites.role` CHECK constraint excludes 'owner'. Owners are set at team creation only. Transfer-of-ownership is deliberately out of scope.
- **No deal pipeline / billing in this phase.** Confirmed out of scope by user.

## Migrations

- `20260503020000_teams_schema.sql` — M42.
- `20260503030000_team_id_backfill.sql` — M43.
- `20260503040000_team_rls_rewrite.sql` — M44.

## Explicitly deferred

- Removing members from a team (UI + route).
- Transferring ownership.
- Per-team billing.
- Per-team email_account ownership transfer when a member leaves.
- Tightening RBAC on the rest of the routes (channel recommendation, contact mutations, etc.) — currently any member can do these.
- `icp_profile` has a per-user PK still; future cleanup can migrate to one ICP per team if friction warrants.
- Deal pipeline with values + close dates.
