-- batches: one row per user-triggered search
create table batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  city text not null,
  category text not null,
  count_requested int not null,
  count_completed int not null default 0,
  status text not null default 'pending', -- pending | processing | done | failed
  created_at timestamptz not null default now()
);

-- prospects: one row per business found
create table prospects (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  website text,
  email text,
  google_place_id text unique,
  rating numeric,
  review_count int,
  hours_json jsonb,
  categories_text text,
  status text not null default 'new',
  -- new | enriched | analyzed | ready | contacted | replied | rejected
  created_at timestamptz not null default now()
);

-- enrichments: one row per prospect, filled after website fetch
create table enrichments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  tech_stack_json jsonb,
  has_online_booking boolean,
  has_ecommerce boolean,
  has_chat boolean,
  has_contact_form boolean,
  is_mobile_friendly boolean,
  ssl_valid boolean,
  homepage_text_excerpt text,
  fetch_error text,
  fetched_at timestamptz
);

-- analyses: Claude's pain-point output
create table analyses (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  pain_points_json jsonb,
  opportunity_score int,
  best_angle text,
  analyzed_at timestamptz
);

-- pitches: the generated email
create table pitches (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  subject text,
  body text,
  edited_body text,
  status text not null default 'draft', -- draft | approved | sent | replied
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz
);

-- jobs: the simple queue
create table jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  job_type text not null, -- enrich | analyze | pitch
  status text not null default 'pending', -- pending | running | done | failed
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on jobs(status, created_at);
create index on prospects(batch_id, status);

-- Enable Row Level Security on all tables
alter table batches enable row level security;
alter table prospects enable row level security;
alter table enrichments enable row level security;
alter table analyses enable row level security;
alter table pitches enable row level security;
alter table jobs enable row level security;

-- RLS Policies: Users can only access their own data
create policy "Users can access their own batches" on batches
  for all using (auth.uid() = user_id);

create policy "Users can access prospects from their batches" on prospects
  for all using (exists (
    select 1 from batches 
    where batches.id = prospects.batch_id 
    and batches.user_id = auth.uid()
  ));

create policy "Users can access enrichments from their prospects" on enrichments
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = enrichments.prospect_id 
    and b.user_id = auth.uid()
  ));

create policy "Users can access analyses from their prospects" on analyses
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = analyses.prospect_id 
    and b.user_id = auth.uid()
  ));

create policy "Users can access pitches from their prospects" on pitches
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = pitches.prospect_id 
    and b.user_id = auth.uid()
  ));

create policy "Users can access jobs from their batches" on jobs
  for all using (exists (
    select 1 from batches 
    where batches.id = jobs.batch_id 
    and batches.user_id = auth.uid()
  ));