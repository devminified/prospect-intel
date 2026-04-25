import { ExternalAPIError } from './errors'
import { supabaseAdmin } from './supabase/server'

if (!process.env.GOOGLE_PLACES_API_KEY) {
  throw new Error('Missing env.GOOGLE_PLACES_API_KEY')
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const PROVIDER = 'Google Places'

const TEXT_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.regularOpeningHours',
  'places.types',
  'places.location',
].join(',')

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'websiteUri',
  'nationalPhoneNumber',
  'rating',
  'userRatingCount',
  'businessStatus',
  'regularOpeningHours',
  'types',
  'location',
].join(',')

export interface PlaceSearchResult {
  place_id: string
  name: string
  formatted_address?: string
  business_status?: string
  rating?: number
  user_ratings_total?: number
  types?: string[]
  geometry?: { location: { lat: number; lng: number } }
  opening_hours?: { weekday_text?: string[] }
  website?: string
  phone?: string
}

export interface PlaceDetails extends PlaceSearchResult {
  formatted_phone_number?: string
}

export async function searchPlaces(
  category: string,
  city: string
): Promise<PlaceSearchResult[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': TEXT_SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: `${category} in ${city}`,
      pageSize: 20,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const snippet = extractSnippet(body)
    throw new ExternalAPIError(PROVIDER, `textSearch failed: ${snippet}`, response.status)
  }

  const data = await response.json()
  const places = Array.isArray(data?.places) ? data.places : []
  return places.map(mapPlace)
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': DETAIL_FIELDS,
    },
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const snippet = extractSnippet(body)
    throw new ExternalAPIError(PROVIDER, `placeDetails failed: ${snippet}`, response.status)
  }

  const place = await response.json()
  return mapPlace(place) as PlaceDetails
}

function mapPlace(p: any): PlaceSearchResult {
  return {
    place_id: p.id,
    name: p.displayName?.text ?? 'Unknown',
    formatted_address: p.formattedAddress,
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    user_ratings_total: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
    business_status: p.businessStatus,
    types: Array.isArray(p.types) ? p.types : undefined,
    opening_hours: p.regularOpeningHours
      ? { weekday_text: p.regularOpeningHours.weekdayDescriptions }
      : undefined,
    geometry: p.location
      ? { location: { lat: p.location.latitude, lng: p.location.longitude } }
      : undefined,
  }
}

function extractSnippet(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return parsed?.error?.message ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200) || 'no body'
  }
}

/**
 * Hard ICP filter applied to raw Google Places results BEFORE inserting any
 * prospect row. Drops anything that violates the user's quantitative ICP
 * floors so we don't waste enrichment + analyze + audit + pitch budget on
 * leads that can never satisfy their criteria.
 *
 *   - rating < min_gmb_rating              → drop
 *   - rating == null AND min set           → drop (unknown quality fails strict)
 *   - user_ratings_total < min_review_count → drop
 *   - business_status !== 'OPERATIONAL'    → drop (closed permanently/temporarily)
 *
 * Returns the surviving set plus a count of how many were dropped so the
 * caller can persist it on the batch row and explain low yields later.
 */
export interface IcpFloors {
  min_gmb_rating: number | null
  min_review_count: number | null
}

export function filterByIcpFloors(
  places: PlaceSearchResult[],
  floors: IcpFloors
): { fresh: PlaceSearchResult[]; skipped: number } {
  const minRating = floors.min_gmb_rating
  const minReviews = floors.min_review_count

  let skipped = 0
  const fresh: PlaceSearchResult[] = []

  for (const p of places) {
    if (p.business_status && p.business_status !== 'OPERATIONAL') {
      skipped++
      continue
    }
    if (minRating != null) {
      if (p.rating == null || p.rating < minRating) {
        skipped++
        continue
      }
    }
    if (minReviews != null) {
      if ((p.user_ratings_total ?? 0) < minReviews) {
        skipped++
        continue
      }
    }
    fresh.push(p)
  }

  return { fresh, skipped }
}

/**
 * Given Google Places search results, filter out any place_id that already
 * exists as a prospect in the DB. Returns the fresh subset plus a count of
 * skipped duplicates so the caller can surface it to the user.
 *
 * Useful when re-running "med spas in Austin" after you already ran it — the
 * second batch shouldn't re-pay Google Places + the pipeline on prospects you
 * already analyzed and pitched.
 *
 * Note: prospects.place_id is globally unique at the DB level, so this
 * pre-filter mirrors what would happen at insert time — but catches it early
 * so the caller can return an accurate prospects_created count.
 */
export async function filterDuplicatePlaces(
  places: PlaceSearchResult[]
): Promise<{ fresh: PlaceSearchResult[]; skipped: number }> {
  if (places.length === 0) return { fresh: [], skipped: 0 }

  const ids = places.map((p) => p.place_id).filter(Boolean)
  if (ids.length === 0) return { fresh: places, skipped: 0 }

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('place_id')
    .in('place_id', ids)

  if (error) {
    // Be permissive on lookup failure — the DB unique constraint will catch
    // dupes at insert time. Just log and continue.
    console.warn('filterDuplicatePlaces lookup failed:', error.message)
    return { fresh: places, skipped: 0 }
  }

  const existing = new Set((data ?? []).map((r: any) => r.place_id as string))
  const fresh = places.filter((p) => !existing.has(p.place_id))
  return { fresh, skipped: places.length - fresh.length }
}
