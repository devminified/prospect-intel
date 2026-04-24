# Playbook — add a new pipeline stage

Examples we've done: enrich, analyze, audit_visibility, pitch, discover_contacts. The recipe:

1. **Migration** (if it needs its own table): `supabase/migrations/<ts>_<name>.sql` with RLS policy that chains `prospects.batch_id → batches.user_id`. See `20260423000000_visibility_audits.sql` as a template.

2. **Lib module**: `lib/<stage>.ts` with a single exported function:
   ```ts
   export async function <stage>Prospect(prospectId: string): Promise<void>
   ```
   Reads prospect row → does work → writes result row. No chaining here.

3. **Prompt** (if LLM-backed): add `<stage>Prompt(input)` to `lib/prompts.ts`. Never inline.

4. **Cron wiring** in `app/api/cron/process/route.ts`:
   - Add the new string to the `JobType` union.
   - Add `case '<stage>': return <stage>Prospect(job.prospect_id)` in the dispatcher.
   - Add the chain entry in `enqueueNext()` if it runs auto (not all do — `discover_contacts` is opt-in).

5. **Test endpoint**: `app/api/test/<stage>-one/route.ts`, `CRON_SECRET`-gated. Copy the shape from `audit-one/route.ts`.

6. **UI panel** (if user should see it): add a section to `app/(dashboard)/prospects/[id]/page.tsx`, load the new row in the existing `Promise.all` block in `load()`. Use shadcn Card + CardHeader + CardContent.

7. **Update `docs/ARCHITECTURE.md`** — the pipeline-stages diagram and the folder tree.
