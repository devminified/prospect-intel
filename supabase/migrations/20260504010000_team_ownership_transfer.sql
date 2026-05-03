-- M50: Atomic team ownership transfer.
--
-- The partial unique index `team_members_one_owner_idx` enforces exactly
-- one owner per team. Naive two-step (insert new owner, demote old) would
-- briefly violate the unique constraint. This function does both in a
-- single PL/pgSQL block which runs in an implicit transaction — between
-- the two UPDATEs there's no time when both rows are 'owner', so the
-- partial unique index never sees a conflict.

create or replace function transfer_team_ownership(
  p_team_id uuid,
  p_new_owner uuid
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  current_owner uuid;
begin
  select user_id into current_owner
  from team_members
  where team_id = p_team_id and role = 'owner';

  if current_owner is null then
    raise exception 'team has no owner';
  end if;
  if current_owner = p_new_owner then
    raise exception 'user is already the owner';
  end if;
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = p_new_owner
  ) then
    raise exception 'new owner must already be a team member';
  end if;

  -- Demote first (clears the partial unique index slot), then promote.
  update team_members set role = 'manager'
    where team_id = p_team_id and user_id = current_owner;
  update team_members set role = 'owner'
    where team_id = p_team_id and user_id = p_new_owner;
end;
$$;
