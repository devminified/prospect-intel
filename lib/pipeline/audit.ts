import { supabaseAdmin } from '@/lib/supabase/server'
import { generateGroqText } from '@/lib/llm/groq'
import { visibilitySummaryPrompt } from '@/lib/prompts'
import { errorMessage } from '@/lib/errors'

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_KEY
const META_TOKEN = process.env.META_ACCESS_TOKEN

const PLACE_DETAILS_FIELDS = [
  'id',
  'displayName',
  'rating',
  'userRatingCount',
  'photos',
  'reviews.text',
  'reviews.rating',
].join(',')

interface GmbSignals {
  rating: number | null
  review_count: number | null
  photo_count: number | null
  review_highlights: string[]
}

interface SocialSignals {
  links: Record<string, string | null>
  facebook_page_id: string | null
}

interface SerpSignals {
  rank_main: number | null
  rank_brand: number | null
}

interface MetaAdSignals {
  running: boolean | null
  count: number | null
  sample: any[]
}


export async function auditVisibility(prospectId: string): Promise<void> {
  const { data: prospect, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, name, website, place_id, rating, review_count, batches(city, category)')
    .eq('id', prospectId)
    .single()
  if (pErr || !prospect) throw new Error(`Prospect not found: ${prospectId}`)

  const batch: any = prospect.batches
  const city: string = batch?.city ?? 'unknown'
  const category: string = batch?.category ?? 'business'

  // Phase 3 (M18): Google News search dropped — queries on business names
  // returned noisy generic articles ("Do Beautiful Birds Have an Evolutionary
  // Advantage?" on a med spa audit). Not worth the SerpApi quota. press_*
  // fields stay in the schema but are always null going forward.
  const [gmbSettled, socialSettled, serpSettled] = await Promise.allSettled([
    fetchGmbSignals(prospect.place_id, prospect.rating, prospect.review_count),
    fetchSocialSignals(prospect.website),
    fetchSerpSignals(prospect.name, category, city, prospect.website),
  ])

  const gmb = settled(gmbSettled, 'GMB') ?? {
    rating: prospect.rating,
    review_count: prospect.review_count,
    photo_count: null,
    review_highlights: [],
  }
  const social = settled(socialSettled, 'social') ?? { links: {}, facebook_page_id: null }
  const serp = settled(serpSettled, 'SerpApi') ?? { rank_main: null, rank_brand: null }

  const ads = social.facebook_page_id
    ? await fetchMetaAds(prospect.name, social.facebook_page_id).catch((err) => {
        console.warn('[MetaAds]', errorMessage(err))
        return { running: null, count: null, sample: [] }
      })
    : { running: null, count: null, sample: [] }

  const row: Record<string, any> = {
    prospect_id: prospectId,
    gmb_rating: gmb.rating,
    gmb_review_count: gmb.review_count,
    gmb_review_highlights_json: gmb.review_highlights,
    gmb_photo_count: gmb.photo_count,
    social_links_json: social.links,
    instagram_followers: null, // requires Meta app with IG Graph access — skipped for MVP
    facebook_followers: null,
    serp_rank_main: serp.rank_main,
    serp_rank_brand: serp.rank_brand,
    meta_ads_running: ads.running,
    meta_ads_count: ads.count,
    meta_ads_sample_json: ads.sample,
    press_mentions_count: null,
    press_mentions_sample_json: null,
    visibility_summary: null,
    audited_at: new Date().toISOString(),
  }

  try {
    const summary = await generateGroqText(
      visibilitySummaryPrompt({
        name: prospect.name,
        category,
        city,
        gmb_rating: row.gmb_rating,
        gmb_review_count: row.gmb_review_count,
        gmb_photo_count: row.gmb_photo_count,
        gmb_review_highlights: gmb.review_highlights,
        social_links: row.social_links_json,
        instagram_followers: row.instagram_followers,
        facebook_followers: row.facebook_followers,
        serp_rank_main: row.serp_rank_main,
        serp_rank_brand: row.serp_rank_brand,
        meta_ads_count: row.meta_ads_count,
        press_mentions_count: row.press_mentions_count,
      }),
      { maxTokens: 300 }
    )
    row.visibility_summary = summary
  } catch (err) {
    console.warn('[Groq] summary failed:', errorMessage(err))
  }

  const { error: insertErr } = await supabaseAdmin.from('visibility_audits').insert(row)
  if (insertErr) throw new Error(`Failed to save audit: ${insertErr.message}`)
}

function settled<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === 'fulfilled') return result.value
  console.warn(`[${label}]`, errorMessage(result.reason))
  return null
}

// ─── GMB via Google Places Place Details ────────────────────────────────────

async function fetchGmbSignals(
  placeId: string | null,
  fallbackRating: number | null,
  fallbackReviewCount: number | null
): Promise<GmbSignals> {
  if (!placeId || !GOOGLE_KEY) {
    return { rating: fallbackRating, review_count: fallbackReviewCount, photo_count: null, review_highlights: [] }
  }
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': PLACE_DETAILS_FIELDS,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Place Details ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const reviews = Array.isArray(data?.reviews) ? data.reviews : []
  const highlights: string[] = reviews
    .slice(0, 5)
    .map((r: any) => r?.text?.text)
    .filter((t: any) => typeof t === 'string' && t.length > 20)
    .map((t: string) => t.slice(0, 200))
  return {
    rating: typeof data?.rating === 'number' ? data.rating : fallbackRating,
    review_count: typeof data?.userRatingCount === 'number' ? data.userRatingCount : fallbackReviewCount,
    photo_count: Array.isArray(data?.photos) ? data.photos.length : null,
    review_highlights: highlights,
  }
}

// ─── Social link discovery from homepage ────────────────────────────────────

const SOCIAL_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: 'instagram', regex: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.\-]+\/?/gi },
  { key: 'facebook', regex: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.\-]+\/?/gi },
  { key: 'tiktok', regex: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.\-]+/gi },
  { key: 'linkedin', regex: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.\-]+\/?/gi },
  { key: 'x', regex: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_\-]+\/?/gi },
  { key: 'youtube', regex: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[A-Za-z0-9_.\-]+/gi },
]

async function fetchSocialSignals(website: string | null): Promise<SocialSignals> {
  if (!website) return { links: {}, facebook_page_id: null }
  const url = website.startsWith('http') ? website : `https://${website}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProspectIntelBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { links: {}, facebook_page_id: null }
    const html = await res.text()
    const links: Record<string, string | null> = {}
    for (const { key, regex } of SOCIAL_PATTERNS) {
      const match = html.match(regex)
      if (match && match.length > 0) {
        links[key] = match[0].replace(/\/$/, '')
      }
    }
    let facebook_page_id: string | null = null
    if (links.facebook) {
      const m = links.facebook.match(/facebook\.com\/([A-Za-z0-9_.\-]+)/i)
      if (m && !['pages', 'profile.php', 'people'].includes(m[1])) facebook_page_id = m[1]
    }
    return { links, facebook_page_id }
  } catch (err) {
    console.warn('[social]', errorMessage(err))
    return { links: {}, facebook_page_id: null }
  }
}

// ─── SerpApi rank ───────────────────────────────────────────────────────────

async function fetchSerpSignals(
  name: string,
  category: string,
  city: string,
  website: string | null
): Promise<SerpSignals> {
  if (!SERPAPI_KEY) return { rank_main: null, rank_brand: null }
  const domain = website ? extractDomain(website) : null

  const [rankMain, rankBrand] = await Promise.all([
    domain ? serpRank(`${category} in ${city}`, domain) : Promise.resolve(null),
    domain ? serpRank(name, domain) : Promise.resolve(null),
  ])
  return { rank_main: rankMain, rank_brand: rankBrand }
}

async function serpRank(query: string, domain: string): Promise<number | null> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '20')
  url.searchParams.set('api_key', SERPAPI_KEY as string)
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    console.warn('[SerpApi]', `rank query "${query}" failed ${res.status}`)
    return null
  }
  const data = await res.json()
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : []
  for (const r of organic) {
    if (typeof r?.link === 'string' && r.link.includes(domain)) {
      return typeof r.position === 'number' ? r.position : null
    }
  }
  return null
}

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// ─── Meta Ad Library ────────────────────────────────────────────────────────

async function fetchMetaAds(name: string, _pageId: string): Promise<MetaAdSignals> {
  if (!META_TOKEN) return { running: null, count: null, sample: [] }
  const url = new URL('https://graph.facebook.com/v18.0/ads_archive')
  url.searchParams.set('access_token', META_TOKEN)
  url.searchParams.set('ad_type', 'ALL')
  url.searchParams.set('ad_reached_countries', JSON.stringify(['US']))
  url.searchParams.set('search_terms', name)
  url.searchParams.set('ad_active_status', 'ACTIVE')
  url.searchParams.set('fields', 'id,ad_creative_bodies,ad_delivery_start_time,page_name')
  url.searchParams.set('limit', '5')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Meta Ad Library ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const ads = Array.isArray(data?.data) ? data.data : []
  return {
    running: ads.length > 0,
    count: ads.length,
    sample: ads.slice(0, 3),
  }
}

