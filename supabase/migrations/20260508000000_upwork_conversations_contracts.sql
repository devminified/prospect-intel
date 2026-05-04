-- Phase 11C — Upwork conversations + contracts.
--
-- Closes the bidder loop: once a proposal gets a reply, the team
-- tracks the back-and-forth as a Conversation, and once a contract
-- is signed, it becomes a Contract with either fixed-price milestones
-- or hourly time logs.
--
-- Tables:
--   upwork_conversations         — thread between team and a client
--   upwork_messages              — append-only message log per thread
--   upwork_contracts             — signed Upwork engagement
--   upwork_contract_milestones   — fixed-price milestone tracker
--   upwork_time_logs             — weekly hourly logs
--
-- All five RLS-gate via the parent profile's team membership.

-- ─── Conversations ─────────────────────────────────────────────────

create table upwork_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references upwork_profiles(id) on delete cascade,
  -- The proposal that started this thread, if any. Sometimes a client
  -- DMs the freelancer directly without a prior application; that
  -- pattern is supported by leaving proposal_id null.
  proposal_id uuid references upwork_proposals(id) on delete set null,
  client_id uuid references upwork_clients(id) on delete set null,
  -- Display title — usually the job title. Cached so we don't have to
  -- traverse proposal → job for every list render.
  title text,
  status text not null default 'waiting_reply'
    check (status in (
      'waiting_reply',  -- we sent the proposal, no reply yet
      'replying',        -- back-and-forth is active
      'interviewing',    -- video/voice scheduled or done
      'negotiating',     -- terms being hashed out
      'closed_won',      -- client agreed to hire
      'closed_lost',     -- explicit no
      'stale'            -- no reply for too long; archived but recoverable
    )),
  status_changed_at timestamptz not null default now(),
  last_message_at timestamptz,
  -- Direction of the most recent message — "us" means we sent, "them"
  -- means we received. Used to flag "they responded, ball's in our
  -- court" without joining the messages table on every list query.
  last_message_from text check (last_message_from in ('us', 'them')),
  -- Manual flag — bidder marks the thread as needing attention. Cleared
  -- when the bidder posts a reply or marks read.
  needs_reply boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index upwork_conversations_profile_status_idx
  on upwork_conversations(profile_id, status, last_message_at desc);
create index upwork_conversations_proposal_idx
  on upwork_conversations(proposal_id) where proposal_id is not null;

alter table upwork_conversations enable row level security;
create policy "Team access upwork_conversations"
  on upwork_conversations
  for all
  using (
    exists (
      select 1 from upwork_profiles p
      where p.id = profile_id and is_team_member(p.team_id)
    )
  );

-- ─── Messages ──────────────────────────────────────────────────────

create table upwork_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references upwork_conversations(id) on delete cascade,
  direction text not null check (direction in ('sent', 'received')),
  body text not null,
  -- Who recorded this message in our system. For 'sent' this is the
  -- bidder who sent it on Upwork. For 'received' this is the team
  -- member who pasted the client's reply into our app. Nullable so
  -- automated import flows can leave it blank.
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  -- The actual Upwork-side timestamp (when the client received/sent).
  -- Defaults to now() — the user can override during paste-in.
  occurred_at timestamptz not null default now(),
  attachments_json jsonb,
  created_at timestamptz not null default now()
);

create index upwork_messages_conversation_idx
  on upwork_messages(conversation_id, occurred_at);

alter table upwork_messages enable row level security;
create policy "Team access upwork_messages"
  on upwork_messages
  for all
  using (
    exists (
      select 1
      from upwork_conversations c
      join upwork_profiles p on p.id = c.profile_id
      where c.id = conversation_id and is_team_member(p.team_id)
    )
  );

-- ─── Contracts ─────────────────────────────────────────────────────

create table upwork_contracts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references upwork_profiles(id) on delete cascade,
  -- Origin links — proposal and conversation are how we got here.
  -- Nullable because contracts can be created manually without going
  -- through the bid loop (direct hire, returning client, etc.).
  proposal_id uuid references upwork_proposals(id) on delete set null,
  conversation_id uuid references upwork_conversations(id) on delete set null,
  client_id uuid references upwork_clients(id) on delete set null,
  -- Upwork's external contract id (visible in their UI as #12345).
  -- Optional — bidder fills it in if they look it up.
  upwork_contract_id text,
  title text not null,
  contract_type text not null check (contract_type in ('fixed', 'hourly')),
  -- For fixed: agreed_total_usd is the SOW total. For hourly: agreed_rate_usd
  -- is the per-hour rate. Both nullable to accept partial setup.
  agreed_total_usd numeric(12,2),
  agreed_rate_usd numeric(8,2),
  status text not null default 'active'
    check (status in ('active', 'paused', 'ended', 'disputed')),
  end_reason text
    check (end_reason is null
      or end_reason in ('completed', 'cancelled', 'disputed', 'refunded')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index upwork_contracts_profile_status_idx
  on upwork_contracts(profile_id, status, started_at desc);
create index upwork_contracts_client_idx on upwork_contracts(client_id) where client_id is not null;

alter table upwork_contracts enable row level security;
create policy "Team access upwork_contracts"
  on upwork_contracts
  for all
  using (
    exists (
      select 1 from upwork_profiles p
      where p.id = profile_id and is_team_member(p.team_id)
    )
  );

-- ─── Contract milestones (fixed-price contracts) ───────────────────

create table upwork_contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references upwork_contracts(id) on delete cascade,
  -- 1-based ordering — service layer renumbers on insert/delete.
  sequence int not null,
  name text not null,
  amount_usd numeric(10,2) not null check (amount_usd >= 0),
  status text not null default 'pending'
    check (status in (
      'pending',       -- not yet funded by client
      'funded',        -- client deposited escrow
      'in_progress',   -- bidder working on it
      'submitted',     -- bidder submitted, awaiting review
      'paid',          -- released from escrow to bidder
      'disputed',      -- in Upwork dispute
      'refunded'       -- escrow returned to client
    )),
  due_at timestamptz,
  funded_at timestamptz,
  submitted_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (contract_id, sequence)
);

create index upwork_milestones_contract_idx
  on upwork_contract_milestones(contract_id, sequence);

alter table upwork_contract_milestones enable row level security;
create policy "Team access upwork_contract_milestones"
  on upwork_contract_milestones
  for all
  using (
    exists (
      select 1
      from upwork_contracts c
      join upwork_profiles p on p.id = c.profile_id
      where c.id = contract_id and is_team_member(p.team_id)
    )
  );

-- ─── Time logs (hourly contracts) ──────────────────────────────────

create table upwork_time_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references upwork_contracts(id) on delete cascade,
  bidder_user_id uuid not null references auth.users(id) on delete restrict,
  -- Upwork bills weekly — `week_starting` is the Monday of the work
  -- week. Stored as a date so it's stable across timezones.
  week_starting date not null,
  hours numeric(6,2) not null check (hours > 0),
  -- Snapshot of the rate at log time, so retroactive rate changes
  -- don't rewrite history. Defaults to the contract's agreed_rate_usd
  -- when the row is inserted via the service.
  hourly_rate_usd numeric(8,2) not null check (hourly_rate_usd >= 0),
  -- Persisted for query speed even though it's hours * rate. The
  -- service writes both atomically.
  amount_usd numeric(10,2) generated always as (hours * hourly_rate_usd) stored,
  status text not null default 'logged'
    check (status in (
      'logged',     -- entered by the bidder, not yet billed on Upwork
      'billed',     -- Upwork sent the invoice for this period
      'paid',       -- Upwork released the funds
      'disputed'    -- client disputed the hours
    )),
  notes text,
  billed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  -- One row per (contract, bidder, week) — bidders accumulate hours
  -- per week, so the row is updated rather than appended.
  unique (contract_id, bidder_user_id, week_starting)
);

create index upwork_time_logs_contract_week_idx
  on upwork_time_logs(contract_id, week_starting desc);
create index upwork_time_logs_bidder_idx
  on upwork_time_logs(bidder_user_id, week_starting desc);

alter table upwork_time_logs enable row level security;
create policy "Team access upwork_time_logs"
  on upwork_time_logs
  for all
  using (
    exists (
      select 1
      from upwork_contracts c
      join upwork_profiles p on p.id = c.profile_id
      where c.id = contract_id and is_team_member(p.team_id)
    )
  );
