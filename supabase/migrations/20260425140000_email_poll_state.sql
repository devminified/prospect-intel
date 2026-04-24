-- M24: reply polling state
alter table email_accounts add column last_poll_at timestamptz;
alter table email_accounts add column inbox_folder_id text;

-- Prevent duplicate email_replies rows when Zoho returns the same message
-- across consecutive poll runs
create unique index email_replies_raw_message_id_uniq
  on email_replies(raw_message_id)
  where raw_message_id is not null;
