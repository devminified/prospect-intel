import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { searchPlaces, filterDuplicatePlaces, filterByIcpFloors } from '@/lib/places'
import { enqueueJob } from '@/lib/queue'

interface CreateBatchRequest {
  city: string
  category: string
  count: number
  auto_enrich_top_n?: number
  pitch_score_threshold?: number | null
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = userData.user.id

    const body: CreateBatchRequest = await request.json()
    const { city, category, count } = body
    const autoEnrichTopN = Math.max(0, Math.min(50, Number(body.auto_enrich_top_n ?? 0)))
    const pitchScoreThreshold =
      body.pitch_score_threshold == null
        ? null
        : Math.max(0, Math.min(100, Number(body.pitch_score_threshold)))

    if (!city || !category || !count || count <= 0 || count > 50) {
      return NextResponse.json(
        { error: 'Invalid input. City, category required. Count must be 1-50.' },
        { status: 400 }
      )
    }

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        user_id: userId,
        city,
        category,
        count_requested: count,
        status: 'processing',
        auto_enrich_top_n: autoEnrichTopN,
        pitch_score_threshold: pitchScoreThreshold,
      })
      .select()
      .single()

    if (batchError) {
      console.error('Error creating batch:', batchError)
      return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
    }

    let places
    try {
      // Over-fetch via pagination so post-filter survivors hit the requested count.
      places = await searchPlaces(category, city, count)
    } catch (error: any) {
      console.error('Error searching places:', error)

      await supabaseAdmin
        .from('batches')
        .update({ status: 'failed' })
        .eq('id', batch.id)

      return NextResponse.json(
        { error: error?.message ?? 'Unknown error fetching places' },
        { status: 500 }
      )
    }

    // Hard ICP filter: drop anything below the user's quality floor BEFORE
    // we do anything else. No enrichment / analyze / audit budget gets spent
    // on prospects that can't satisfy ICP.
    const { data: icp } = await supabaseAdmin
      .from('icp_profile')
      .select('min_gmb_rating, min_review_count, require_business_phone')
      .eq('user_id', userId)
      .maybeSingle()
    const { fresh: icpFresh, skipped: filteredBelowIcp } = filterByIcpFloors(places, {
      min_gmb_rating: (icp as any)?.min_gmb_rating ?? null,
      min_review_count: (icp as any)?.min_review_count ?? null,
      require_phone: !!(icp as any)?.require_business_phone,
    })

    // Skip prospects already in the system (same place_id). Avoids re-paying
    // Google Places + the full pipeline on leads the user has seen before.
    const { fresh, skipped: duplicatesSkipped } = await filterDuplicatePlaces(icpFresh)
    const limitedPlaces = fresh.slice(0, count)

    // Persist the drop counts so the batch detail UI can surface them later.
    await supabaseAdmin
      .from('batches')
      .update({
        count_filtered_below_icp: filteredBelowIcp,
        count_duplicates_skipped: duplicatesSkipped,
      })
      .eq('id', batch.id)

    if (limitedPlaces.length === 0) {
      await supabaseAdmin
        .from('batches')
        .update({
          status: 'done',
          count_completed: 0,
        })
        .eq('id', batch.id)

      const reasons: string[] = []
      if (filteredBelowIcp > 0) reasons.push(`${filteredBelowIcp} below ICP floor`)
      if (duplicatesSkipped > 0) reasons.push(`${duplicatesSkipped} duplicates`)
      const tail = reasons.length ? ` (${reasons.join(', ')})` : ''
      return NextResponse.json({
        batch,
        message: places.length > 0
          ? `All ${places.length} matches were filtered out${tail}.`
          : 'No places found for the given criteria',
        prospects_created: 0,
        prospects_filtered_below_icp: filteredBelowIcp,
        duplicates_skipped: duplicatesSkipped,
      })
    }

    const prospects = []
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
          await enqueueJob(batch.id, prospect.id, 'enrich')
        } catch (queueError) {
          console.error('Error enqueueing enrichment job:', queueError)
        }
      } catch (error) {
        console.error('Error processing place:', place.place_id, error)
        // Continue with other places
      }
    }

    if (prospects.length === 0) {
      await supabaseAdmin
        .from('batches')
        .update({ status: 'done' })
        .eq('id', batch.id)
    }

    const tailParts: string[] = []
    if (filteredBelowIcp > 0) tailParts.push(`${filteredBelowIcp} filtered below ICP`)
    if (duplicatesSkipped > 0) tailParts.push(`${duplicatesSkipped} duplicates skipped`)
    const tail = tailParts.length ? ` (${tailParts.join(', ')})` : ''
    return NextResponse.json({
      batch,
      prospects_created: prospects.length,
      prospects_filtered_below_icp: filteredBelowIcp,
      duplicates_skipped: duplicatesSkipped,
      message: `Created ${prospects.length} prospects and queued enrichment jobs${tail}`,
    })

  } catch (error) {
    console.error('Error in POST /api/batches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}