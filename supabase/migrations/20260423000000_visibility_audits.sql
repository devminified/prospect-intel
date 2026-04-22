create table visibility_audits (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references prospects(id) on delete cascade,
  gmb_rating numeric,
  gmb_review_count int,
  gmb_review_highlights_json jsonb,
  gmb_photo_count int,
  social_links_json jsonb,
  instagram_followers int,
  facebook_followers int,
  serp_rank_main int,
  serp_rank_brand int,
  meta_ads_running boolean,
  meta_ads_count int,
  meta_ads_sample_json jsonb,
  press_mentions_count int,
  press_mentions_sample_json jsonb,
  visibility_summary text,
  audited_at timestamptz
);

alter table visibility_audits enable row level security;

create policy "Users can access visibility_audits from their prospects" on visibility_audits
  for all using (exists (
    select 1 from prospects p
    join batches b on b.id = p.batch_id
    where p.id = visibility_audits.prospect_id
    and b.user_id = auth.uid()
  ));
