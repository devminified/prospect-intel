-- M38: Free-form notes per prospect — call notes, follow-up context,
-- whatever the user wants to remember between sessions.
--
-- Single-user product for now, so RLS is simple: notes are accessible to
-- whoever owns the prospect via the batch ownership chain. updated_at is
-- set in the API on edits; created_at is auto.

create table prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index prospect_notes_prospect_idx on prospect_notes(prospect_id, created_at desc);

alter table prospect_notes enable row level security;

create policy "Users can manage notes on their own prospects" on prospect_notes
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = prospect_notes.prospect_id and b.user_id = auth.uid()
    )
  );
