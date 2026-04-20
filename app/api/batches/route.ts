import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { searchPlaces, getPlaceDetails } from '@/lib/places'
import { enqueueJob } from '@/lib/queue'

interface CreateBatchRequest {
  city: string
  category: string
  count: number
}

export async function POST(request: NextRequest) {
  try {
    // Get the user from the session
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For now, we'll extract user ID from a simple token
    // In production, this should validate the JWT properly
    const token = authHeader.replace('Bearer ', '')
    
    // Parse request body
    const body: CreateBatchRequest = await request.json()
    const { city, category, count } = body

    // Validate input
    if (!city || !category || !count || count <= 0 || count > 50) {
      return NextResponse.json(
        { error: 'Invalid input. City, category required. Count must be 1-50.' },
        { status: 400 }
      )
    }

    // For MVP, we'll use a hardcoded user ID
    // TODO: Replace with proper JWT validation
    const userId = '00000000-0000-0000-0000-000000000000'

    // Create batch
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        user_id: userId,
        city,
        category,
        count_requested: count,
        status: 'processing',
      })
      .select()
      .single()

    if (batchError) {
      console.error('Error creating batch:', batchError)
      return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
    }

    // Search for places
    const searchQuery = `${category} in ${city}`
    let places

    try {
      places = await searchPlaces(searchQuery)
    } catch (error) {
      console.error('Error searching places:', error)
      
      // Mark batch as failed
      await supabaseAdmin
        .from('batches')
        .update({ status: 'failed' })
        .eq('id', batch.id)

      return NextResponse.json(
        { error: 'Failed to fetch places from Google' },
        { status: 500 }
      )
    }

    // Limit to requested count
    const limitedPlaces = places.slice(0, count)

    if (limitedPlaces.length === 0) {
      // Mark batch as done but with no results
      await supabaseAdmin
        .from('batches')
        .update({ 
          status: 'done',
          count_completed: 0
        })
        .eq('id', batch.id)

      return NextResponse.json({
        batch,
        message: 'No places found for the given criteria',
        prospects_created: 0
      })
    }

    // Process each place and create prospects
    const prospects = []
    for (const place of limitedPlaces) {
      try {
        // Get detailed information
        const details = await getPlaceDetails(place.place_id)
        
        // Create prospect record
        const { data: prospect, error: prospectError } = await supabaseAdmin
          .from('prospects')
          .insert({
            batch_id: batch.id,
            name: place.name,
            address: place.formatted_address || details?.formatted_address,
            phone: details?.formatted_phone_number,
            website: details?.website,
            google_place_id: place.place_id,
            rating: place.rating || details?.rating,
            review_count: place.user_ratings_total || details?.user_ratings_total,
            hours_json: details?.opening_hours || place.opening_hours,
            categories_text: (place.types || details?.types)?.join(', '),
            status: 'new',
          })
          .select()
          .single()

        if (prospectError) {
          console.error('Error creating prospect:', prospectError)
          continue
        }

        prospects.push(prospect)

        // Enqueue enrichment job
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

    // Update batch with completed count
    await supabaseAdmin
      .from('batches')
      .update({ 
        count_completed: prospects.length,
        status: prospects.length > 0 ? 'processing' : 'done'
      })
      .eq('id', batch.id)

    return NextResponse.json({
      batch: {
        ...batch,
        count_completed: prospects.length
      },
      prospects_created: prospects.length,
      message: `Created ${prospects.length} prospects and queued enrichment jobs`
    })

  } catch (error) {
    console.error('Error in POST /api/batches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}