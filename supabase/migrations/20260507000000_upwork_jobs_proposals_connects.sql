-- Phase 11B — Upwork jobs, proposals, and Connects ledger.
--
-- Three new tables that complete the "find a job → bid on it →
-- track outcome" loop, plus the Connects accounting that drives the
-- profile's spend budget.
--
--   upwork_jobs         — Upwork postings the team is tracking.
--                          Team-scoped (not profile-scoped) so two
--                          profiles can't unknowingly bid the same
--                          job — duplicate detection happens here.
--   upwork_proposals    — One bid by one profile on one job. Bidder
--                          is the team member who hit Send. Status
--                          tracks the Upwork-side lifecycle.
--   upwork_connects_log — Full ledger of Connects movements per
--                          profile: purchases, spends (on proposal
--                          submit), refunds (when proposal returns
--                          unused Connects), grants, manual
--                          adjustments. The profile's
--                          connects_balance snapshot is the running
--                          total — service-layer keeps both in sync.

-- ─── Jobs ───────────────────────────────────────────────────────────

create table upwork_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  -- Upwork's external job id (the part after the last `~` in the URL).
  -- Nullable because not every saved row has been parsed yet — the
  -- bidder might paste a URL we couldn't decode.
  upwork_job_id text,
  url text not null,
  title text not null,
  description text,
  posted_at timestamptz,
  -- Budget shape — fixed-price OR hourly. budget_min / budget_max
  -- apply to fixed; hourly_min / hourly_max apply to hourly.
  budget_type text not null default 'unknown'
    check (budget_type in ('fixed', 'hourly', 'unknown')),
  budget_min_usd numeric(10,2),
  budget_max_usd numeric(10,2),
  hourly_min_usd numeric(8,2),
  hourly_max_usd numeric(8,2),
  est_duration text,
  hours_per_week text,
  experience_level text
    check (experience_level is null
      or experience_level in ('entry', 'intermediate', 'expert')),
  category text,
  skills jsonb not null default '[]'::jsonb,
  country text,
  client_id uuid references upwork_clients(id) on delete set null,
  -- Internal tracking status — set by the team, not Upwork.
  status text not null default 'open'
    check (status in ('open', 'closed', 'hired_other', 'dead')),
  saved_by_user_id uuid references auth.users(id) on delete set null,
  notes text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  -- One row per (team, upwork_job_id) when the external id is known.
  -- Anonymous / unparsed posts can have multiple rows; that's fine
  -- until a real id gets filled in.
  unique (team_id, upwork_job_id)
);

create index upwork_jobs_team_status_idx
  on upwork_jobs(team_id, status, created_at desc);
create index upwork_jobs_client_idx on upwork_jobs(client_id) where client_id is not null;

alter table upwork_jobs enable row level security;
create policy "Team access upwork_jobs"
  on upwork_jobs
  for all
  using (is_team_member(team_id));

-- ─── Proposals ──────────────────────────────────────────────────────

create table upwork_proposals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references upwork_profiles(id) on delete cascade,
  job_id uuid not null references upwork_jobs(id) on delete cascade,
  bidder_user_id uuid not null references auth.users(id) on delete restrict,
  cover_letter text,
  bid_type text not null check (bid_type in ('fixed', 'hourly')),
  -- For fixed-price proposals: total bid. For hourly: the hourly rate.
  bid_amount_usd numeric(10,2),
  -- Optional milestones for fixed-price bids: jsonb array of
  -- { name: string, amount: number, due_at?: string }.
  proposed_milestones_json jsonb,
  -- Connects spent at submission. Recorded here AND mirrored as a
  -- 'spend' row in upwork_connects_log so the ledger is complete.
  connects_spent int not null default 0 check (connects_spent >= 0),
  -- Lifecycle status — looser than a strict state machine; service
  -- layer can refine but DB just enforces a known set.
  status text not null default 'sent'
    check (status in (
      'drafted', 'sent', 'viewed', 'shortlisted', 'interview',
      'declined', 'withdrawn', 'hired', 'no_response'
    )),
  status_changed_at timestamptz not null default now(),
  sent_at timestamptz,
  withdrawn_at timestamptz,
  hired_at timestamptz,
  declined_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  -- A profile bids on a job at most once. If the bid is withdrawn and
  -- the team wants to re-bid, they'd undo the withdraw rather than
  -- create a 2nd row. Avoids the dedupe headache.
  unique (profile_id, job_id)
);

create index upwork_proposals_profile_status_idx
  on upwork_proposals(profile_id, status, status_changed_at desc);
create index upwork_proposals_job_idx on upwork_proposals(job_id);
create index upwork_proposals_bidder_idx on upwork_proposals(bidder_user_id);

alter table upwork_proposals enable row level security;
create policy "Team access upwork_proposals"
  on upwork_proposals
  for all
  using (
    exists (
      select 1 from upwork_profiles p
      where p.id = profile_id and is_team_member(p.team_id)
    )
  );

-- ─── Connects ledger ────────────────────────────────────────────────

create table upwork_connects_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references upwork_profiles(id) on delete cascade,
  -- Movement type. Sign convention:
  --   purchase / grant / refund / adjustment+ → balance INCREASES
  --   spend / adjustment-                       → balance DECREASES
  -- We always store `amount` as a positive integer (Connects are
  -- whole-number on Upwork) and let `type` carry the sign — easier to
  -- reason about in queries + UI than signed amounts.
  type text not null
    check (type in ('purchase', 'grant', 'refund', 'spend', 'adjustment')),
  amount int not null check (amount > 0),
  -- For 'adjustment' rows specifically: this column tells the UI
  -- whether the adjustment added or subtracted Connects. For all other
  -- types the sign is implied by `type`.
  signed_amount int not null check (signed_amount = amount or signed_amount = -amount),
  balance_after int not null check (balance_after >= 0),
  related_proposal_id uuid references upwork_proposals(id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now(),
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index upwork_connects_log_profile_idx
  on upwork_connects_log(profile_id, occurred_at desc);
create index upwork_connects_log_proposal_idx
  on upwork_connects_log(related_proposal_id) where related_proposal_id is not null;

alter table upwork_connects_log enable row level security;
create policy "Team access upwork_connects_log"
  on upwork_connects_log
  for all
  using (
    exists (
      select 1 from upwork_profiles p
      where p.id = profile_id and is_team_member(p.team_id)
    )
  );

-- ─── Convenience: keep `upwork_profiles.connects_balance` in sync ──
--
-- The service layer is the primary writer (it does the SELECT-update
-- atomically inside its create/refund flows), but a trigger gives us
-- defense-in-depth + means manual SQL inserts (e.g. backfill scripts)
-- still keep the snapshot accurate. AFTER INSERT only — the ledger is
-- append-only by design (no UPDATE, no DELETE in normal flow), so we
-- don't need to handle those cases.

create or replace function upwork_sync_profile_balance()
returns trigger
language plpgsql
as $$
begin
  update upwork_profiles
    set connects_balance = new.balance_after
    where id = new.profile_id;
  return new;
end;
$$;

drop trigger if exists trg_upwork_sync_balance on upwork_connects_log;
create trigger trg_upwork_sync_balance
  after insert on upwork_connects_log
  for each row execute function upwork_sync_profile_balance();
