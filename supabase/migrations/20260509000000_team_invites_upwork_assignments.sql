-- M88: Combined-manager invites + Upwork-only invites in one shot.
--
-- Until now `team_invites` carried only (email, team-wide role). To
-- invite an Upwork-only bidder or a "combined manager" (outbound
-- manager + Upwork manager on every profile), the owner had to do two
-- separate steps: invite, wait for redemption, then add upwork_profile_
-- members rows manually. This migration lets the invite carry a list
-- of profile assignments that fan out automatically on redeem.
--
-- Shape: array of { profile_id: uuid, role: 'manager' | 'bidder' }.
-- Empty array = pure outbound invite (current behavior). Service-
-- layer validates membership of profiles in the same team.

alter table team_invites
  add column upwork_assignments_json jsonb not null default '[]'::jsonb;

comment on column team_invites.upwork_assignments_json is
  'Optional Upwork profile assignments to fan out on redemption. Each entry: { profile_id: uuid, role: ''manager'' | ''bidder'' }. Snapshotted at invite-create — profiles added later are NOT auto-included.';
