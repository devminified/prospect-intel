-- M44: Flip RLS from user_id ownership to team membership.
--
-- Highest-risk milestone in Phase 6 — one wrong policy and a team
-- member sees another team's data. All read+write access for team-
-- scoped tables now traces through team_members.
--
-- Role-based action gating (e.g. "only owner/manager can DELETE
-- batch") happens in the API route layer in M46, NOT in RLS. RLS
-- here only checks team membership; finer-grained permission
-- checks live where the request handler can also produce a useful
-- error message.
--
-- After this migration, the legacy user_id columns on batches /
-- icp_profile / lead_plans / email_accounts are still present but
-- no longer authoritative for RLS. We keep them for now so existing
-- API routes that read them don't break before the route-layer
-- refactor in M45.

-- Helper: is the current user a member of the given team? Used by
-- every policy below. SECURITY DEFINER so the helper can read
-- team_members without triggering its own select policy (avoids
-- subtle recursion under nested policy checks).
create or replace function is_team_member(p_team_id uuid) returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

-- Drop old policies. Unconditional — these all came from earlier
-- migrations and are being replaced wholesale.
drop policy if exists "Users can access their own batches" on batches;
drop policy if exists "Users can access prospects from their batches" on prospects;
drop policy if exists "Users can access enrichments from their prospects" on enrichments;
drop policy if exists "Users can access analyses from their prospects" on analyses;
drop policy if exists "Users can access pitches from their prospects" on pitches;
drop policy if exists "Users can access jobs from their batches" on jobs;
drop policy if exists "Users can access contacts from their prospects" on contacts;
drop policy if exists "Users can access visibility_audits from their prospects" on visibility_audits;
drop policy if exists "Users can access channel_recommendations from their prospects" on channel_recommendations;
drop policy if exists "Users read/write own ICP" on icp_profile;
drop policy if exists "Users read/write own plans" on lead_plans;
drop policy if exists "Users read/write items on their plans" on lead_plan_items;
drop policy if exists "Users manage their own email_accounts" on email_accounts;
drop policy if exists "Users access sent_emails from their accounts" on sent_emails;
drop policy if exists "Users access email_opens from their sent emails" on email_opens;
drop policy if exists "Users access email_replies from their sent emails" on email_replies;
drop policy if exists "Users can manage notes on their own prospects" on prospect_notes;
drop policy if exists "Users can manage followups on their own prospects" on prospect_followups;

-- Direct-team tables.
create policy "Team access batches" on batches
  for all using (is_team_member(team_id));

create policy "Team access icp_profile" on icp_profile
  for all using (is_team_member(team_id));

create policy "Team access lead_plans" on lead_plans
  for all using (is_team_member(team_id));

create policy "Team access email_accounts" on email_accounts
  for all using (is_team_member(team_id));

-- Indirect via batches.
create policy "Team access prospects" on prospects
  for all using (
    exists (select 1 from batches b where b.id = prospects.batch_id and is_team_member(b.team_id))
  );

create policy "Team access jobs" on jobs
  for all using (
    exists (select 1 from batches b where b.id = jobs.batch_id and is_team_member(b.team_id))
  );

-- Indirect via prospects → batches.
create policy "Team access enrichments" on enrichments
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = enrichments.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access analyses" on analyses
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = analyses.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access pitches" on pitches
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = pitches.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access contacts" on contacts
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = contacts.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access visibility_audits" on visibility_audits
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = visibility_audits.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access channel_recommendations" on channel_recommendations
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = channel_recommendations.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access prospect_notes" on prospect_notes
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = prospect_notes.prospect_id and is_team_member(b.team_id)
    )
  );

create policy "Team access prospect_followups" on prospect_followups
  for all using (
    exists (
      select 1 from prospects p
      join batches b on b.id = p.batch_id
      where p.id = prospect_followups.prospect_id and is_team_member(b.team_id)
    )
  );

-- Indirect via lead_plans.
create policy "Team access lead_plan_items" on lead_plan_items
  for all using (
    exists (
      select 1 from lead_plans p
      where p.id = lead_plan_items.plan_id and is_team_member(p.team_id)
    )
  );

-- Indirect via email_accounts.
create policy "Team access sent_emails" on sent_emails
  for all using (
    exists (
      select 1 from email_accounts ea
      where ea.id = sent_emails.account_id and is_team_member(ea.team_id)
    )
  );

create policy "Team access email_opens" on email_opens
  for all using (
    exists (
      select 1 from sent_emails se
      join email_accounts ea on ea.id = se.account_id
      where se.id = email_opens.sent_email_id and is_team_member(ea.team_id)
    )
  );

create policy "Team access email_replies" on email_replies
  for all using (
    exists (
      select 1 from sent_emails se
      join email_accounts ea on ea.id = se.account_id
      where se.id = email_replies.sent_email_id and is_team_member(ea.team_id)
    )
  );
