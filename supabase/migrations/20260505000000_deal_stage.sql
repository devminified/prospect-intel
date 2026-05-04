-- M64: Deal stage on prospects (Phase 10A — pipeline kanban).
--
-- Adds a real CRM funnel dimension distinct from the existing
-- `outreach_status` (last-call outcome) and `status` (cron pipeline
-- stage). The user moves prospects through these stages by dragging
-- cards on /leads kanban.
--
-- Stages:
--   lead       — default; in the funnel but no outreach yet
--   contacted  — first touch sent (email or call)
--   qualified  — confirmed fit + interest from prospect side
--   meeting    — call/demo booked
--   proposal   — quote / SOW sent
--   won        — closed-won terminal
--   lost       — closed-lost terminal
--
-- Free-form text (not a Postgres enum) so new stages can be added
-- without a migration — UI gates the values to the canonical set.
-- Same pattern as outreach_status (M36) for the same reason.

alter table prospects add column deal_stage text not null default 'lead';
alter table prospects add column deal_stage_changed_at timestamptz;

-- Backfill — best-effort mapping from existing signals so the kanban
-- doesn't show every shipped prospect in the 'lead' column on first
-- render. Order matters (later checks win):
--   * has_sent  → contacted
--   * outreach_status = qualified → qualified
--   * outreach_status in (not_interested, do_not_contact) → lost
update prospects set deal_stage = 'contacted'
  where exists (
    select 1
    from pitches p
    join sent_emails s on s.pitch_id = p.id
    where p.prospect_id = prospects.id
  );

update prospects set deal_stage = 'qualified'
  where outreach_status = 'qualified';

update prospects set deal_stage = 'lost'
  where outreach_status in ('not_interested', 'do_not_contact');

-- Same backfill for the timestamp — use the latest signal we have so
-- the activity feed doesn't show every backfilled stage as "now".
update prospects set deal_stage_changed_at = coalesce(
  (select max(s.sent_at)
     from pitches p
     join sent_emails s on s.pitch_id = p.id
     where p.prospect_id = prospects.id),
  created_at
)
where deal_stage <> 'lead';

-- Index supports the kanban "by stage" query and the dashboard tile
-- counts per stage.
create index prospects_deal_stage_idx on prospects(deal_stage);
