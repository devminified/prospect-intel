-- Signature fields for the outbound email template. All nullable so
-- existing accounts keep working.
alter table email_accounts add column sender_title text;
alter table email_accounts add column sender_company text;
alter table email_accounts add column calendly_url text;
alter table email_accounts add column website_url text;
