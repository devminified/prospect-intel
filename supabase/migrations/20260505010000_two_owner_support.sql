
--
-- Up to now the team model assumed exactly one owner; transfers were atomic
-- swaps via the transfer_team_ownership() function (M50). The product is
-- now run by 2 humans on the Devminified team and they want shared
-- privileges — both can rename the team, accept invites, manage members,
-- disconnect Zoho, etc. Cap is intentional at 2 to avoid unbounded
-- ownership sprawl.
--
-- Enforcement: a row-level trigger on team_members rejects any
-- INSERT/UPDATE that would push the owner count above 2 for that team.
-- Service-layer also gates this (defense in depth + nicer error messages),
-- but the trigger guarantees no broken state if something bypasses the
-- service layer.

create or replace function enforce_max_two_owners()
returns trigger
language plpgsql
as $$
declare
  owner_count int;
begin
  if new.role <> 'owner' then
    return new;
  end if;

  -- For UPDATE that didn't change the role, no need to recount.
  if tg_op = 'UPDATE' and old.role = 'owner' then
    return new;
  end if;

  select count(*) into owner_count
  from team_members
  where team_id = new.team_id and role = 'owner';

  if owner_count >= 2 then
    raise exception 'team already has the maximum of 2 owners'
      using errcode = '23514'; -- check_violation
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_max_two_owners on team_members;
create trigger trg_enforce_max_two_owners
  before insert or update of role on team_members
  for each row execute function enforce_max_two_owners();
