-- M92: Extend team_invites.role CHECK to allow 'bidder'.
--
-- M72 added 'bidder' to team_members.role's check constraint when the
-- Upwork module shipped, but missed the matching constraint on
-- team_invites — invites went straight from owner to redeemer without
-- needing the new role at the time. M88's preset flow now creates
-- pending invites with role='bidder' (for upwork_bidder + upwork_manager
-- presets), and those fail with team_invites_role_check.

alter table team_invites drop constraint if exists team_invites_role_check;
alter table team_invites add constraint team_invites_role_check
  check (role in ('manager', 'lead_gen', 'cold_caller', 'closer', 'bidder'));
