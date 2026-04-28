-- M36: Manual outreach state tracking — viewed timestamp + outreach status.
--
-- Two new columns on prospects, both nullable, both manually maintained
-- by user actions (not pipeline cron).
--
-- last_viewed_at  — fired by the prospect detail page on mount; used by the
--                   batch list to dim/bold rows so the user can see at a
--                   glance which prospects they've already inspected.
--
-- outreach_status — manual annotation orthogonal to the automatic `status`
--                   pipeline (new/enriched/analyzed/ready/contacted/etc).
--                   Captures call/email outcomes the user records after the
--                   fact: voicemail / no_answer / call_ended / follow_up /
--                   qualified / not_interested / do_not_contact / calling.
--                   Free-form text so we don't need migrations to add new
--                   values; UI surfaces a fixed set but DB accepts any.

alter table prospects add column last_viewed_at timestamptz;
alter table prospects add column outreach_status text;

-- Index supports filter queries on the batch list ("show me only no-answer
-- + voicemail") without table scans once volume grows.
create index prospects_outreach_status_idx
  on prospects(outreach_status)
  where outreach_status is not null;
