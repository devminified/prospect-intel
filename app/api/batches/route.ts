import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { searchPlaces, filterDuplicatePlaces } from '@/lib/places'
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
      places = await searchPlaces(category, city)
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

    // Skip prospects already in the system (same place_id). Avoids re-paying
    // Google Places + the full pipeline on leads the user has seen before.
    const { fresh, skipped: duplicatesSkipped } = await filterDuplicatePlaces(places)
    const limitedPlaces = fresh.slice(0, count)

    if (limitedPlaces.length === 0) {
      // Mark batch as done but with no results
      await supabaseAdmin
        .from('batches')
        .update({
          status: 'done',
          count_completed: 0,
        })
        .eq('id', batch.id)

      return NextResponse.json({
        batch,
        message: duplicatesSkipped > 0
          ? `All ${places.length} matches already exist in your system.`
          : 'No places found for the given criteria',
        prospects_created: 0,
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

    const dupMsg = duplicatesSkipped > 0 ? ` (${duplicatesSkipped} duplicates skipped)` : ''
    return NextResponse.json({
      batch,
      prospects_created: prospects.length,
      duplicates_skipped: duplicatesSkipped,
      message: `Created ${prospects.length} prospects and queued enrichment jobs${dupMsg}`,
    })

  } catch (error) {
    console.error('Error in POST /api/batches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}