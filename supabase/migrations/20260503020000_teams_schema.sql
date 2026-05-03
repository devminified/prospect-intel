-- M42: Phase 6 multi-team schema — additive only.
--
-- This migration adds the three tables that anchor team membership.
-- It does NOT yet add team_id to existing tables (batches, icp_profile,
-- etc.) — that's M43. It does NOT yet rewrite the existing RLS that
-- gates everything via batches.user_id — that's M44.
--
-- After M42 runs, the app continues to work exactly as before. The
-- new tables are dormant until M43 wires them in.
--
-- Roles:
--   owner        — exactly one per team, set at creation, billing + full access.
--   manager      — invite/remove members, see all leads, full data access.
--   lead_gen     — runs batches/plans, finds leads. No email send, no outreach_status.
--   cold_caller  — phone outreach (set outreach_status, notes, follow-ups). No email send.
--   closer       — sends emails, handles replies, qualifies leads. No ICP/batch deletion.
--
-- All roles can read everything in the team and add notes/follow-ups.
-- Granular RBAC enforcement happens in M46 at the API route layer.

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'lead_gen', 'cold_caller', 'closer')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Each team has exactly one owner. Enforce via partial unique index so
-- attempts to insert a second owner row fail at the DB rather than racing
-- in app code.
create unique index team_members_one_owner_idx
  on team_members(team_id) where role = 'owner';

create index team_members_user_idx on team_members(user_id);
create index team_members_team_role_idx on team_members(team_id, role);

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'lead_gen', 'cold_caller', 'closer')),
  -- 'owner' can't be invited — there's only ever one, set at team creation.
  invited_by uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index team_invites_team_idx on team_invites(team_id);
create unique index team_invites_pending_email_idx
  on team_invites(team_id, email) where accepted_at is null;

alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_invites enable row level security;

-- Read-side policies. Writes are routed through API routes using the
-- service role for M42 — granular write policies arrive in M44.

create policy "Users see teams they belong to" on teams
  for select using (
    exists (
      select 1 from team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  );

create policy "Users see other members of their teams" on team_members
  for select using (
    exists (
      select 1 from team_members me
      where me.team_id = team_members.team_id and me.user_id = auth.uid()
    )
  );

create policy "Users see invites for their teams" on team_invites
  for select using (
    exists (
      select 1 from team_members tm
      where tm.team_id = team_invites.team_id and tm.user_id = auth.uid()
    )
  );
