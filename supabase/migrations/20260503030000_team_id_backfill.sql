-- M43: Backfill team_id onto all user-keyed tables.
--
-- For each distinct user_id found across batches / icp_profile /
-- lead_plans / email_accounts, this migration:
--   1. Creates a team named "Devminified" (user can rename in M46 UI).
--   2. Adds the user as the team's owner.
--   3. Sets team_id on every row that user owns across the four tables.
--
-- Idempotent: re-running this is a no-op for users who already own a
-- team. Useful if the migration is partially applied and we need to
-- resume.
--
-- After this runs, team_id is NOT NULL on all four tables. The legacy
-- user_id columns are kept for now — M44 will flip RLS to use team
-- membership, then a future cleanup can drop user_id where redundant.

alter table batches add column team_id uuid references teams(id);
alter table icp_profile add column team_id uuid references teams(id);
alter table lead_plans add column team_id uuid references teams(id);
alter table email_accounts add column team_id uuid references teams(id);

do $$
declare
  u_id uuid;
  t_id uuid;
begin
  for u_id in
    select distinct user_id from (
      select user_id from batches where user_id is not null
      union
      select user_id from icp_profile where user_id is not null
      union
      select user_id from lead_plans where user_id is not null
      union
      select user_id from email_accounts where user_id is not null
    ) all_users
  loop
    -- Resolve or create the user's owner team. This branch is what makes
    -- the migration idempotent on re-run.
    select team_id into t_id from team_members
      where user_id = u_id and role = 'owner'
      limit 1;

    if t_id is null then
      insert into teams (name) values ('Devminified') returning id into t_id;
      insert into team_members (team_id, user_id, role)
        values (t_id, u_id, 'owner');
    end if;

    update batches        set team_id = t_id where user_id = u_id and team_id is null;
    update icp_profile    set team_id = t_id where user_id = u_id and team_id is null;
    update lead_plans     set team_id = t_id where user_id = u_id and team_id is null;
    update email_accounts set team_id = t_id where user_id = u_id and team_id is null;
  end loop;
end $$;

-- Lock in the constraint so future inserts can't skip team_id. Anything
-- still null here is an orphan — fail loudly so we notice and fix it,
-- rather than letting orphan rows leak through RLS in M44.
alter table batches        alter column team_id set not null;
alter table icp_profile    alter column team_id set not null;
alter table lead_plans     alter column team_id set not null;
alter table email_accounts alter column team_id set not null;

create index batches_team_idx        on batches(team_id);
create index icp_profile_team_idx    on icp_profile(team_id);
create index lead_plans_team_idx     on lead_plans(team_id);
create index email_accounts_team_idx on email_accounts(team_id);
