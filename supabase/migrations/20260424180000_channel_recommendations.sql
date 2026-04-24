create table channel_recommendations (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  phone_fit_score int not null check (phone_fit_score >= 0 and phone_fit_score <= 100),
  email_fit_score int not null check (email_fit_score >= 0 and email_fit_score <= 100),
  recommended_channel text not null check (recommended_channel in ('phone', 'email', 'either')),
  reasoning text,
  phone_script text,
  generated_at timestamptz not null default now()
);

create index on channel_recommendations(prospect_id);

alter table channel_recommendations enable row level security;

create policy "Users can access channel_recommendations from their prospects" on channel_recommendations
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = channel_recommendations.prospect_id
    and b.user_id = auth.uid()
  ));
