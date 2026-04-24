# Playbook — add a new external API integration

1. **Env var** added to `.env.local.example` (empty value) AND pushed to Vercel:
   ```bash
   vercel env add <NEW_API_KEY> production
   vercel env add <NEW_API_KEY> preview
   vercel env add <NEW_API_KEY> development
   ```

2. **Lib file**: `lib/<category>/<provider>.ts` if vendor (e.g. `lib/scrape/scrapingbee.ts`), else `lib/<noun>.ts` (e.g. `lib/contacts.ts`). Export functions, not classes.

3. **Error tagging**: every non-2xx response throws `ExternalAPIError` from `lib/errors.ts`:
   ```ts
   import { ExternalAPIError } from '@/lib/errors'
   if (!res.ok) {
     const body = await res.text()
     throw new ExternalAPIError('Apollo', `people/match returned ${res.status}: ${body}`, res.status)
   }
   ```
   The UI + `jobs.last_error` surface `[Apollo] …` prefix.

4. **Timeouts**: every `fetch` gets `signal: AbortSignal.timeout(ms)`. Serverless has a 60s hard ceiling on Vercel Pro.
   ```ts
   const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
   ```

5. **Graceful degradation**: audit-style fan-out uses `Promise.allSettled` when one signal failing shouldn't kill the whole job. Hard-fail only for critical-path stages.

6. **Never log the key.** If debugging whether a key is set, print its length (`key?.length`) not its value.

7. **Cost note in `docs/phases/CURRENT.md`** — add this provider to the budget table with expected monthly spend at current volume.
