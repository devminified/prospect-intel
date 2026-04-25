-- Self-open tracking: opens from the sender's own browser (e.g. opening the
-- Sent folder in Zoho, viewing the email locally) get flagged so they don't
-- inflate the real-open count.
alter table email_opens add column is_probably_self boolean not null default false;

-- IPs we know belong to the sender. Updated via the dashboard heartbeat route
-- on every authenticated session so newly-arrived opens can be matched.
-- Capped at 10 most-recent in the helper.
alter table email_accounts add column known_self_ips text[] not null default '{}';
