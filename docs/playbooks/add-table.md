# Playbook — add a new table

1. **Migration** with `create table …` + `create index` + `alter table … enable row level security` + a policy that chains to `auth.uid()` through whatever foreign key makes sense:
   ```sql
   create table <name> (
     id uuid primary key default gen_random_uuid(),
     prospect_id uuid not null references prospects(id) on delete cascade,
     -- ...
     created_at timestamptz not null default now()
   );
   create index on <name>(prospect_id);
   alter table <name> enable row level security;

   create policy "users see their own <name> rows"
   on <name> for select using (
     prospect_id in (
       select p.id from prospects p
       join batches b on b.id = p.batch_id
       where b.user_id = auth.uid()
     )
   );
   ```

2. **Test the RLS**: query the table with the user's JWT — confirm they only see their rows. Do this locally against the Supabase REST API with the anon key + bearer token BEFORE shipping.

3. **DB client**:
   - Server code writes via `supabaseAdmin` (service role bypasses RLS)
   - Browser code reads via `lib/supabase/client.ts` (anon — RLS-enforced)

4. **Types**: no generated types — we define narrow `interface Row { … }` at the top of each consumer file. Matches how we handle the rest of the codebase.

5. **Update `docs/ARCHITECTURE.md`** — add the table to the data-model summary section.

## Naming rules for columns

- snake_case for everything
- `*_json` for `jsonb`
- `*_at` for `timestamptz`
- `*_id` for foreign keys
- No `Enum` types — use `text` with a CHECK constraint if you want enforcement (lightweight, lets us add new states without a migration, matches how `jobs.job_type` grows)
