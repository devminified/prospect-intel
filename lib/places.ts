import { ExternalAPIError } from './errors'

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
