-- Phase 11A — Upwork CRM foundation.
--
-- Adds a parallel module alongside the outbound-leads side. The two
-- modules share the team boundary (one Devminified team owns both)
-- but isolate access via per-profile membership: a "bidder" role
-- holder on the team has zero outbound access; their Upwork access
-- comes from rows in upwork_profile_members keyed on (profile, user).
--
-- Tables:
--   upwork_profiles         — one row per Upwork freelancer/agency
--                              account the team operates from
--   upwork_profile_members  — per-profile (manager | bidder) membership
--   upwork_clients          — team-scoped Upwork buyer dedupe so two
--                              profiles don't unknowingly bid the same
--                              client
--
-- RLS: same `is_team_member(team_id)` envelope used elsewhere — the
-- service layer adds the per-profile gate on top.

-- ─── Profiles ───────────────────────────────────────────────────────

create table upwork_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  -- Slug for the URL, unique per team. Doesn't need to match the Upwork
  -- handle exactly — this is for our routing only.
  slug text not null,
  description text,
  -- Public Upwork profile URL (https://www.upwork.com/freelancers/...)
  profile_url text,
  -- Whether the profile is on Upwork as an individual freelancer or an
  -- agency. Affects how Connects + contracts are accounted for.
  account_type text not null default 'individual'
    check (account_type in ('individual', 'agency')),
  hourly_rate_usd numeric(8,2),
  -- Cached Connects balance — written by the service layer when bidders
  -- log spends. The connects-ledger table (Phase 11B) is the source of
  -- truth; this is a fast-read snapshot for the dashboard.
  connects_balance int not null default 0,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, slug)
);

create index upwork_profiles_team_idx on upwork_profiles(team_id) where status <> 'archived';

alter table upwork_profiles enable row level security;
create policy "Team access upwork_profiles"
  on upwork_profiles
  for all
  using (is_team_member(team_id));

-- ─── Per-profile membership (RBAC core) ─────────────────────────────

create table upwork_profile_members (
  profile_id uuid not null references upwork_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('manager', 'bidder')),
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users(id) on delete set null,
  primary key (profile_id, user_id)
);

create index upwork_profile_members_user_idx on upwork_profile_members(user_id);

-- A profile must have at most one manager (defense-in-depth — service
-- layer also checks this). Bidders are uncapped.
create unique index upwork_profile_one_manager_idx
  on upwork_profile_members(profile_id)
  where role = 'manager';

-- RLS: a row is visible to anyone who can see the parent profile (so
-- team members can see who's on each profile). Mutations are gated at
-- the service layer.
alter table upwork_profile_members enable row level security;
create policy "Team access upwork_profile_members"
  on upwork_profile_members
  for all
  using (
    exists (
      select 1 from upwork_profiles p
      where p.id = profile_id and is_team_member(p.team_id)
    )
  );

-- ─── Clients (team-wide for cross-profile dedup) ────────────────────

create table upwork_clients (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  -- Upwork's external client id. Some Upwork posts don't expose this
  -- pre-bid (anonymous postings); nullable so we can still log a row.
  upwork_client_id text,
  display_name text not null,
  country text,
  payment_verified boolean,
  total_spent_usd numeric(12,2),
  hire_rate numeric(4,3), -- 0.000 .. 1.000
  avg_hourly_paid_usd numeric(8,2),
  jobs_posted int,
  member_since date,
  -- Internal status set by the team — useful for blacklisting low-value
  -- or known-flaky clients across all profiles.
  status text not null default 'active'
    check (status in ('active', 'do_not_pursue', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  -- One row per (team, external client). When upwork_client_id is null
  -- (anonymous posting), the team can have multiple "Anonymous client"
  -- rows — that's fine until a real id is filled in.
  unique (team_id, upwork_client_id)
);

create index upwork_clients_team_idx on upwork_clients(team_id);

alter table upwork_clients enable row level security;
create policy "Team access upwork_clients"
  on upwork_clients
  for all
  using (is_team_member(team_id));

-- ─── New 'bidder' team role ─────────────────────────────────────────
--
-- The check constraint on team_members.role currently allows
-- (owner | manager | lead_gen | cold_caller | closer). Add 'bidder'
-- so a pure-Upwork-only team member can be invited without granting
-- any outbound permissions.
--
-- The constraint name from the M45 schema migration:
--   team_members_role_check (created in 20260503020000_teams_schema.sql)

alter table team_members drop constraint if exists team_members_role_check;
alter table team_members add constraint team_members_role_check
  check (role in ('owner', 'manager', 'lead_gen', 'cold_caller', 'closer', 'bidder'));
