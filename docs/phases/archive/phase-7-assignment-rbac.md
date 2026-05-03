# Phase 7 — Lead assignment + team operational maturity (M49–M51)

**Status:** Shipped 2026-05-04.

**What it is:** Phase 6 made multi-team work; Phase 7 made it usable for an actual operating team. Per-lead assignment so members aren't all looking at the same firehose, member removal + ownership transfer to close out the Phase 6 deferred list, and an RBAC sweep on the remaining write routes.

## Milestones

### M49 — Per-lead assignment + filters
- Migration adds `prospects.assigned_to` (uuid → auth.users, on delete set null) + `assigned_at` timestamp.
- `PATCH /api/prospects/:id` accepts `assigned_to`. RBAC:
  - Self-assignment open to any team member.
  - Assigning others requires owner/manager.
  - Target user must be a member of the prospect's team.
- Prospect detail header gains a third Select (assignee dropdown). Optimistic update + revert on failure. Activity timeline shows current assignee event.
- `/leads` filter row gains an Assignee dropdown (`Any` / `My leads` / `Unassigned` / per-member). Saved views remember it. Reset clears it.

### M50 — Member removal + ownership transfer + role changes
- Migration adds `transfer_team_ownership(team_id, new_owner)` PL/pgSQL function. Single-transaction demote-then-promote so the partial unique "one owner" index never sees two owners.
- `PATCH /api/team/members/:user_id` — change non-owner role. Owner can promote to manager; manager can demote but not promote. Self-edits blocked.
- `DELETE /api/team/members/:user_id` — owner-only. Blocks self-removal and owner-removal (must transfer first). Cascade behavior: drops their `email_accounts` rows for this team (only that user has the Zoho tokens), prospects.assigned_to falls back to NULL via the FK on delete set null clause from M49.
- `POST /api/team/transfer-ownership` — owner-only, calls the SQL function. Demoted owner becomes manager.
- `/settings/team` members table grows an Actions column visible only to the owner: a role Select per non-owner member, plus 'Make owner' and 'Remove' buttons. Each guarded by confirm() with an explanation of side-effects.

### M51 — RBAC sweep on remaining write routes
- New `lib/team.ts::getProspectTeamAccess(userId, prospectId)` helper — verifies membership AND returns the role in a single call. Replaces the stale `batches.user_id` ownership checks left over from the pre-team era.
- Five routes updated:
  - `POST /api/prospects/:id/discover-contacts` → `canCreateBatch` (Apollo quota spend).
  - `POST /api/prospects/:id/regenerate-pitch` → `canSendEmail` (Sonnet credits for email copy).
  - `POST /api/prospects/:id/contacts/:contactId/find-direct-line` → `canCreateBatch` (Lusha credit spend).
  - `POST /api/prospects/:id/contacts/:contactId/use-business-phone` → `canEditContact` (free, but a write).
  - `PATCH /api/prospects/:id/contacts/:contactId` → `canEditContact`.

## Updated role matrix

| Action                          | Owner | Manager | Lead Gen | Cold Caller | Closer |
|---------------------------------|:-----:|:-------:|:--------:|:-----------:|:------:|
| Read everything                  | ✓     | ✓       | ✓        | ✓           | ✓      |
| Add notes / followups            | ✓     | ✓       | ✓        | ✓           | ✓      |
| Self-assign leads                | ✓     | ✓       | ✓        | ✓           | ✓      |
| Assign other members             | ✓     | ✓       | —        | —           | —      |
| Create batch / plan              | ✓     | ✓       | ✓        | —           | —      |
| Edit ICP                         | ✓     | ✓       | ✓        | —           | —      |
| Discover contacts (Apollo)       | ✓     | ✓       | ✓        | —           | —      |
| Reveal direct line (Lusha)       | ✓     | ✓       | ✓        | —           | —      |
| Edit contact phone/linkedin/name | ✓     | ✓       | —        | ✓           | ✓      |
| Use business phone               | ✓     | ✓       | —        | ✓           | ✓      |
| Set outreach_status              | ✓     | ✓       | —        | ✓           | ✓      |
| Send cold email                  | ✓     | ✓       | —        | —           | ✓      |
| Regenerate pitch copy            | ✓     | ✓       | —        | —           | ✓      |
| Invite members                   | ✓     | ✓       | —        | —           | —      |
| Remove members                   | ✓     | —       | —        | —           | —      |
| Change non-owner roles           | ✓ (any) | ✓ (demote only) | — | — | — |
| Transfer ownership               | ✓     | —       | —        | —           | —      |
| Rename team                      | ✓     | —       | —        | —           | —      |

## Key decisions

- **Stale `batches.user_id` ownership checks** in pre-team routes were silently allowing the original creator only — non-owner team members would 403. M51 replaces them with `getProspectTeamAccess` which traces team membership correctly.
- **Email accounts hard-deleted** on member removal (only that user has Zoho tokens; row would be unusable). If they rejoin, OAuth reconnect.
- **Removed members' assignments** fall back to "Unassigned" automatically via the FK clause from M49.
- **Self-removal blocked for the owner** — must transfer ownership first, then the new owner removes the previous one.
- **Role promote/demote split:** owner can do either; manager can only demote (preserves the "owner is the only one who can give power" invariant).

## Migrations

- `20260504000000_prospect_assignment.sql` — M49.
- `20260504010000_team_ownership_transfer.sql` — M50.

## Explicitly deferred

- Drag-and-drop kanban (was 7D in the original Phase 7 proposal — skipped per scope decision).
- Per-prospect assignment history (only current state is tracked).
- Soft-delete or audit log on member removal (today it's a hard delete).
- "Leave team" self-service action for non-owners.
- Auto-redistribute one removed member's leads across active members instead of dumping to Unassigned.
- Per-team email_account ownership transfer instead of hard delete.
