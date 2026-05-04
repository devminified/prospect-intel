-- M69 follow-up: drop the legacy single-owner partial unique index.
--
-- M69 shipped a trigger to enforce "≤ 2 owners per team", but the
-- pre-existing partial unique index `team_members_one_owner_idx`
-- (introduced in 20260503020000_teams_schema.sql) still hard-locked
-- the team to exactly 1 owner. The unique index fires before the
-- trigger so no 2nd-owner insert ever landed in production. Dropping
-- it here so the trigger is the sole source of truth.
drop index if exists team_members_one_owner_idx;
