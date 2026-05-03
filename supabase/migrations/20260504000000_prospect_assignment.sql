-- M49: Per-lead assignment.
--
-- A team member can be assigned to a prospect. RBAC at the route layer
-- limits who can assign whom (any member can assign themselves; only
-- owner/manager can assign other members).
--
-- assigned_at is denormalized so the activity timeline can show
-- "assigned to X 3h ago" without a separate audit table. If history
-- becomes valuable, a future prospect_assignments table can replace
-- this — for MVP we only care about the current state.
--
-- on delete set null: when a team member is removed (M50) any leads
-- they owned automatically fall back to "Unassigned" rather than
-- holding a dangling FK.

alter table prospects add column assigned_to uuid references auth.users(id) on delete set null;
alter table prospects add column assigned_at timestamptz;

create index prospects_assigned_to_idx
  on prospects(assigned_to)
  where assigned_to is not null;
