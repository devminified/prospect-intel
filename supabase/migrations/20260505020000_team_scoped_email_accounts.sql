-- M70: Team-scope the email_accounts table.
--
-- Until now each owner/manager had their own (user_id, email) row in
-- email_accounts, which meant if owner A connected Zoho, owner B saw
-- "no account connected" — defeating the shared-team model.
--
-- New shape: one row per (team_id, provider). Whoever connected first
-- is recorded in user_id (now functionally "connected_by" — kept the
-- column name to avoid widespread churn). Any team member can read the
-- row via the existing is_team_member() RLS policy. Owners + managers
-- can disconnect; the OAuth callback upserts on (team_id, provider).
--
-- Migration of existing rows: nothing required for production today
-- because the M68 lead-cleanup ran AFTER the previous Zoho row was
-- created, so there's at most one email_accounts row per provider per
-- team already. If there were ever duplicates we'd need a dedup step
-- here — adding a defensive cleanup to be safe.

-- 1) Drop the legacy per-user unique key.
alter table email_accounts drop constraint if exists email_accounts_user_id_email_key;

-- 2) Defensive dedup before adding the team-scoped key — keep the most
--    recent row per (team_id, provider).
delete from email_accounts a
using email_accounts b
where a.team_id = b.team_id
  and a.provider = b.provider
  and a.created_at < b.created_at;

-- 3) Add the team-scoped unique key.
alter table email_accounts
  add constraint email_accounts_team_provider_key
  unique (team_id, provider);

-- 4) Comment for future readers.
comment on column email_accounts.user_id is
  'The team member who connected the account. Functionally "connected_by"; kept as user_id for FK + cascade simplicity.';
