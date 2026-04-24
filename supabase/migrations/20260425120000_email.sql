-- Connected email accounts (OAuth2 — currently Zoho only)
create table email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'zoho',
  email text not null,
  display_name text,
  zoho_account_id text,
  api_domain text,                    -- returned by Zoho OAuth, e.g. https://mail.zoho.com
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  daily_send_cap int not null default 30,
  sends_today int not null default 0,
  sends_reset_at date,
  last_send_at timestamptz,           -- for spacing enforcement
  created_at timestamptz not null default now(),
  unique (user_id, email)
);
alter table email_accounts enable row level security;
create policy "Users manage their own email_accounts" on email_accounts
  for all using (user_id = auth.uid());

-- One row per outbound send
create table sent_emails (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references pitches(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  account_id uuid not null references email_accounts(id) on delete cascade,
  message_id text,                    -- Zoho message-id (for reply threading)
  thread_id text,
  subject text,
  body_html text,
  to_email text not null,
  sent_at timestamptz not null default now(),
  bounced boolean not null default false,
  bounce_reason text
);
create index on sent_emails(pitch_id);
create index on sent_emails(contact_id);
create index on sent_emails(account_id, sent_at desc);
alter table sent_emails enable row level security;
create policy "Users access sent_emails from their accounts" on sent_emails
  for all using (
    account_id in (select id from email_accounts where user_id = auth.uid())
  );

-- Pixel opens (one row per fetch — MPP-aware dedupe flag)
create table email_opens (
  id uuid primary key default gen_random_uuid(),
  sent_email_id uuid not null references sent_emails(id) on delete cascade,
  opened_at timestamptz not null default now(),
  ip text,
  user_agent text,
  is_probably_mpp boolean not null default false
);
create index on email_opens(sent_email_id);
alter table email_opens enable row level security;
create policy "Users access email_opens from their sent emails" on email_opens
  for all using (
    sent_email_id in (
      select se.id from sent_emails se
      join email_accounts ea on ea.id = se.account_id
      where ea.user_id = auth.uid()
    )
  );

-- M24 placeholder — structure here so nothing churns when replies are wired
create table email_replies (
  id uuid primary key default gen_random_uuid(),
  sent_email_id uuid not null references sent_emails(id) on delete cascade,
  received_at timestamptz,
  snippet text,
  classification text,                -- Haiku tag: interested | not_interested | ooo | unsubscribe | question
  raw_message_id text,
  created_at timestamptz not null default now()
);
create index on email_replies(sent_email_id);
alter table email_replies enable row level security;
create policy "Users access email_replies from their sent emails" on email_replies
  for all using (
    sent_email_id in (
      select se.id from sent_emails se
      join email_accounts ea on ea.id = se.account_id
      where ea.user_id = auth.uid()
    )
  );

-- Global unsubscribe list — any email here is permanently excluded from sends
create table email_unsubs (
  id uuid primary key default gen_random_uuid(),
  contact_email text not null unique,
  unsubscribed_at timestamptz not null default now(),
  reason text
);
-- No RLS: writes come from the unsub route (service role), reads only via server-side send gate
