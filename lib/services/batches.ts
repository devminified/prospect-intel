import { supabaseAdmin } from '@/lib/supabase/server'
import { searchPlaces, filterByIcpFloors, filterDuplicatePlaces } from '@/lib/places'
import { enqueueJob } from '@/lib/queue'
import * as dbBatches from '@/lib/db/batches'
import * as dbIcp from '@/lib/db/icp'
import { BatchCreateInputSchema } from '@/lib/types'
import type { Role } from '@/lib/types'
import { canCreateBatch, roleForbiddenMessage } from '@/lib/rbac'
import { requireTeamAccess } from './access'
import { ForbiddenError, ValidationError } from './errors'

interface CreateBatchResult {
  batch: unknown
  prospects_created: number
  prospects_filtered_below_icp: number
  duplicates_skipped: number
  message: string
}

/**
 * Create a batch end-to-end:
 *   1. Auth + RBAC (canCreateBatch).
 *   2. Insert batch row with status='processing'.
 *   3. Search Google Places (over-fetches via pagination so post-filter
 *      survivors hit the requested count).
 *   4. Hard ICP filter (rating / reviews / business_status / phone).
 *   5. Dedup against existing prospects by place_id.
 *   6. Insert prospects + enqueue enrich jobs for each survivor.
 *   7. Persist count_filtered_below_icp + count_duplicates_skipped on
 *      the batch row so the detail UI can explain the drop.
 *
 * Failures during the Places search mark the batch 'failed' and surface
 * the vendor error. Per-prospect insert failures are logged and skipped
 * — one bad row doesn't kill the whole batch.
 */
export async function create(userId: string, raw: unknown): Promise<CreateBatchResult> {
  const { teamId, role } = await requireTeamAccess(userId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'create a batch'))
  }

  const parsed = BatchCreateInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid batch input', parsed.error.issues)
  }
  const input = parsed.data
  const autoEnrichTopN = Math.max(0, Math.min(50, input.auto_enrich_top_n ?? 0))
  const pitchScoreThreshold =
    input.pitch_score_threshold == null ? null : Math.max(0, Math.min(100, input.pitch_score_threshold))

  const batch = await dbBatches.create({
    userId,
    teamId,
    city: input.city,
    category: input.category,
    count: input.count,
    autoEnrichTopN,
    pitchScoreThreshold,
  })

  let places
  try {
    places = await searchPlaces(input.category, input.city, input.count)
  } catch (err: any) {
    await dbBatches.setStatus(batch.id, 'failed')
    throw new Error(err?.message ?? 'Unknown error fetching places')
  }

  const floors = await dbIcp.getBatchFloors(userId)
  const { fresh: icpFresh, skipped: filteredBelowIcp } = filterByIcpFloors(places, {
    min_gmb_rating: floors.min_gmb_rating,
    min_review_count: floors.min_review_count,
    require_phone: floors.require_business_phone,
  })

  const { fresh, skipped: duplicatesSkipped } = await filterDuplicatePlaces(icpFresh)
  const limitedPlaces = fresh.slice(0, input.count)

  await dbBatches.setFilterCounts(batch.id, {
    filteredBelowIcp,
    duplicatesSkipped,
  })

  if (limitedPlaces.length === 0) {
    await dbBatches.setStatusAndCompleted(batch.id, 'done', 0)
    const reasons: string[] = []
    if (filteredBelowIcp > 0) reasons.push(`${filteredBelowIcp} below ICP floor`)
    if (duplicatesSkipped > 0) reasons.push(`${duplicatesSkipped} duplicates`)
    const tail = reasons.length ? ` (${reasons.join(', ')})` : ''
    return {
      batch,
      message:
        places.length > 0
          ? `All ${places.length} matches were filtered out${tail}.`
          : 'No places found for the given criteria',
      prospects_created: 0,
      prospects_filtered_below_icp: filteredBelowIcp,
      duplicates_skipped: duplicatesSkipped,
    }
  }

  const prospects: unknown[] = []
  for (const place of limitedPlaces) {
    try {
      const { data: prospect, error: prospectError } = await supabaseAdmin
        .from('prospects')
        .insert({
          batch_id: batch.id,
          name: place.name,
          address: place.formatted_address,
          phone: place.phone,
          website: place.website,
          place_id: place.place_id,
          rating: place.rating,
          review_count: place.user_ratings_total,
          hours_json: place.opening_hours,
          categories_text: place.types?.join(', '),
          status: 'new',
        })
        .select()
        .single()

      if (prospectError) {
        console.error('Error creating prospect:', prospectError)
        continue
      }
      prospects.push(prospect)

      try {
        await enqueueJob(batch.id, (prospect as any).id, 'enrich')
      } catch (queueError) {
        console.error('Error enqueueing enrichment job:', queueError)
      }
    } catch (error) {
      console.error('Error processing place:', place.place_id, error)
    }
  }

  if (prospects.length === 0) {
    await dbBatches.setStatus(batch.id, 'done')
  }

  const tailParts: string[] = []
  if (filteredBelowIcp > 0) tailParts.push(`${filteredBelowIcp} filtered below ICP`)
  if (duplicatesSkipped > 0) tailParts.push(`${duplicatesSkipped} duplicates skipped`)
  const tail = tailParts.length ? ` (${tailParts.join(', ')})` : ''
  return {
    batch,
    prospects_created: prospects.length,
    prospects_filtered_below_icp: filteredBelowIcp,
    duplicates_skipped: duplicatesSkipped,
    message: `Created ${prospects.length} prospects and queued enrichment jobs${tail}`,
  }
}
