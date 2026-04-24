-- Optional hard-filter ICP requirements. When set, prospects whose visibility
-- audit shows no signal for the required platform get status='filtered_out'
-- at the audit-done boundary in the cron processor, and no pitch is generated.
alter table icp_profile add column require_linkedin boolean not null default false;
alter table icp_profile add column require_instagram boolean not null default false;
alter table icp_profile add column require_facebook boolean not null default false;
alter table icp_profile add column require_business_phone boolean not null default false;

-- Human-readable reason surfaced on prospect detail when status='filtered_out'
-- (e.g. "ICP requires LinkedIn — no LinkedIn URL found on business or contacts").
alter table prospects add column filter_reason text;
