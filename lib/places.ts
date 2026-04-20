if (!process.env.GOOGLE_PLACES_API_KEY) {
  throw new Error('Missing env.GOOGLE_PLACES_API_KEY')
}

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

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

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('key', GOOGLE_PLACES_API_KEY)
  
  try {
    const response = await fetch(url.toString())
    
    if (!response.ok) {
      throw new Error(`Places API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }
    
    return data.results || []
  } catch (error) {
    console.error('Error searching places:', error)
    throw error
  }
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,business_status,opening_hours,types,geometry')
  url.searchParams.set('key', GOOGLE_PLACES_API_KEY)
  
  try {
    const response = await fetch(url.toString())
    
    if (!response.ok) {
      throw new Error(`Place Details API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (data.status !== 'OK') {
      if (data.status === 'NOT_FOUND') {
        return null
      }
      throw new Error(`Place Details API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }
    
    return data.result
  } catch (error) {
    console.error('Error getting place details:', error)
    throw error
  }
}