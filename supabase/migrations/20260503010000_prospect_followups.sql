-- M39: Per-prospect follow-up reminders.
--
-- Path A from the Phase 5 design — store the date/note locally, generate
-- ICS download client-side so the event lands in whatever calendar the
-- user keeps (Google / Apple / Outlook). Avoids OAuth two-way sync
-- complexity entirely.
--
-- One prospect can have many active follow-ups in flight (sequential
-- touchpoints). Done items keep their row for audit + activity timeline.

create table prospect_followups (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz not null,
  note text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Per-prospect detail page sorts active followups by due_at, dones at bottom.
create index prospect_followups_prospect_idx
  on prospect_followups(prospect_id, done, due_at);

-- Future global "due today" / "overdue" queries hit user-level rows directly.
create index prospect_followups_user_due_idx
  on prospect_followups(user_id, done, due_at);

alter table prospect_followups enable row level security;

create policy "Users can manage followups on their own prospects" on prospect_followups
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = prospect_followups.prospect_id and b.user_id = auth.uid()
    )
  );
