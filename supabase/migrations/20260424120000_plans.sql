-- Phase 4A (M20): Daily Lead Planner module.

create table icp_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  services text[] not null default '{}',
  avg_deal_size int,
  daily_capacity int not null default 0,          -- 0 = no cap
  preferred_cities text[] not null default '{}',
  excluded_cities text[] not null default '{}',
  min_gmb_rating numeric,
  min_review_count int,
  target_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table icp_profile enable row level security;
create policy "Users read/write own ICP" on icp_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table lead_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  status text not null default 'draft',           -- draft | executed | skipped
  rationale_json jsonb,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);
create index on lead_plans(user_id, plan_date desc);
alter table lead_plans enable row level security;
create policy "Users read/write own plans" on lead_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table lead_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references lead_plans(id) on delete cascade,
  city text not null,
  category text not null,
  count int not null,
  reasoning text,
  priority int not null default 0,                 -- 1 = highest
  estimated_cost_usd numeric,
  batch_id uuid references batches(id) on delete set null,
  executed_at timestamptz
);
create index on lead_plan_items(plan_id, priority);

alter table lead_plan_items enable row level security;
create policy "Users read/write items on their plans" on lead_plan_items
  for all using (exists (
    select 1 from lead_plans p where p.id = lead_plan_items.plan_id and p.user_id = auth.uid()
  ));
