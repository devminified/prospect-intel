create table contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  full_name text,
  title text,
  seniority text,            -- owner | founder | c_suite | vp | director | manager | other
  department text,
  email text,
  email_confidence text,     -- verified | guessed | unverified
  phone text,
  linkedin_url text,
  apollo_person_id text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index on contacts(prospect_id, is_primary);

alter table contacts enable row level security;

create policy "Users can access contacts from their prospects" on contacts
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = contacts.prospect_id
    and b.user_id = auth.uid()
  ));
