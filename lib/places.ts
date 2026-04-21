if (!process.env.HERE_API_KEY) {
  throw new Error('Missing env.HERE_API_KEY')
}

const HERE_API_KEY = process.env.HERE_API_KEY

export interface PlaceSearchResult {
  place_id: string
  name: string
  formatted_address?: string
  business_status?: string
  rating?: number
  user_ratings_total?: number
  types?: string[]
  geometry?: {
    location: {
      lat: number
      lng: number
    }
  }
  opening_hours?: {
    open_now?: boolean
    periods?: any[]
  }
}

export interface PlaceDetails {
  place_id: string
  name: string
  formatted_address?: string
  formatted_phone_number?: string
  website?: string
  rating?: number
  user_ratings_total?: number
  business_status?: string
  opening_hours?: {
    open_now?: boolean
    periods?: any[]
    weekday_text?: string[]
  }
  types?: string[]
  geometry?: {
    location: {
      lat: number
      lng: number
    }
  }
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number }> {
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode')
  url.searchParams.set('q', city)
  url.searchParams.set('limit', '1')
  url.searchParams.set('apiKey', HERE_API_KEY)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`HERE geocode error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const first = data.items?.[0]
  if (!first?.position) {
    throw new Error(`Could not geocode city: ${city}`)
  }

  return { lat: first.position.lat, lng: first.position.lng }
}

export async function searchPlaces(
  category: string,
  city: string
): Promise<PlaceSearchResult[]> {
  const { lat, lng } = await geocodeCity(city)

  const url = new URL('https://discover.search.hereapi.com/v1/discover')
  url.searchParams.set('at', `${lat},${lng}`)
  url.searchParams.set('q', category)
  url.searchParams.set('limit', '20')
  url.searchParams.set('apiKey', HERE_API_KEY)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`HERE discover error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (!data.items) {
    return []
  }

  return data.items.map((item: any) => ({
    place_id: item.id || `${item.position?.lat},${item.position?.lng}`,
    name: item.title || 'Unknown Business',
    formatted_address: item.address?.label || '',
    rating: item.averageRating || undefined,
    user_ratings_total: item.reviewsCount || undefined,
    types: item.categories?.map((c: any) => c.name) || [],
    geometry: item.position
      ? { location: { lat: item.position.lat, lng: item.position.lng } }
      : undefined,
    opening_hours: item.openingHours || undefined,
  }))
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const url = new URL('https://lookup.search.hereapi.com/v1/lookup')
  url.searchParams.set('id', placeId)
  url.searchParams.set('apiKey', HERE_API_KEY)

  const response = await fetch(url.toString())
  if (!response.ok) {
    console.warn(`HERE lookup error for ${placeId}: ${response.status}`)
    return null
  }

  const data = await response.json()
  if (!data) {
    return null
  }

  return {
    place_id: data.id || placeId,
    name: data.title || 'Unknown Business',
    formatted_address: data.address?.label || '',
    formatted_phone_number: data.contacts?.[0]?.phone?.[0]?.value || undefined,
    website: data.contacts?.[0]?.www?.[0]?.value || undefined,
    rating: data.averageRating || undefined,
    user_ratings_total: data.reviewsCount || undefined,
    opening_hours: data.openingHours || undefined,
    types: data.categories?.map((c: any) => c.name) || [],
    geometry: data.position
      ? { location: { lat: data.position.lat, lng: data.position.lng } }
      : undefined,
  }
}
