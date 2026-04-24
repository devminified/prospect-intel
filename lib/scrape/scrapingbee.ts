const PROVIDER = 'ScrapingBee'
const BASE = 'https://app.scrapingbee.com/api/v1/'

export interface ScrapedStructuredData {
  booking_platform: string | null
  book_url: string | null
  primary_cta: string | null
  services: string[]
  team_members: Array<{ name: string; title: string; bio_url?: string }>
}

/**
 * Pulls the fully-rendered HTML via ScrapingBee with JS execution. Used as a
 * fallback when direct fetch + Cheerio returns thin text (<500 chars) on
 * client-rendered sites (Wix, Squarespace, Shopify SPAs).
 *
 * Returns null on any failure — callers should treat this as best-effort and
 * keep the weaker direct-fetch result rather than abort enrichment.
 */
export async function renderPage(url: string, timeoutMs = 30000): Promise<string | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY
  if (!apiKey) return null
  const sb = new URL(BASE)
  sb.searchParams.set('api_key', apiKey)
  sb.searchParams.set('url', url)
  sb.searchParams.set('render_js', 'true')
  sb.searchParams.set('block_resources', 'false')
  try {
    const res = await fetch(sb.toString(), { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      console.warn(`[${PROVIDER}] render ${res.status} for ${url}`)
      return null
    }
    return await res.text()
  } catch (err: any) {
    console.warn(`[${PROVIDER}] render failed: ${err?.message ?? err}`)
    return null
  }
}

/**
 * Calls ScrapingBee's AI Extract endpoint, which renders the page with JS and
 * runs an LLM against the DOM to return structured JSON matching the schema
 * we describe. Costs ~25 credits per call (vs 5 for render-only) — worth it
 * because it captures information we'd otherwise miss: which booking platform
 * is embedded, team member names/titles, primary CTA text, listed services.
 *
 * Returns null on failure. Caller should degrade gracefully — an enrichment
 * without structured data is still valid.
 */
export async function extractTypedFields(url: string, timeoutMs = 45000): Promise<ScrapedStructuredData | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY
  if (!apiKey) return null

  const extractRules = {
    booking_platform: "The specific booking or scheduling platform the business uses on this website (e.g. 'Vagaro', 'Boulevard', 'Mindbody', 'Calendly', 'Acuity', 'Squarespace Scheduling', 'Shopify'). Return 'none' if the website has no online booking capability. Return 'unknown' if there is a Book Now button but the backend platform is not identifiable.",
    book_url: "The full URL of the primary booking link if one exists on the page. Return an empty string if no booking link is visible.",
    primary_cta: "The exact text of the most prominent call-to-action button or link on the homepage (e.g. 'Book Today', 'Schedule Consultation', 'Call Now', 'Shop Now'). Return an empty string if no clear CTA exists.",
    services: "Array of up to 10 services or treatments the business explicitly offers, as short strings. Empty array if none listed.",
    team_members: "Array of up to 10 team members visible on the page, each with {name, title, bio_url?} where name and title are strings and bio_url is optional. Empty array if no team listing is visible."
  }

  const sb = new URL(BASE)
  sb.searchParams.set('api_key', apiKey)
  sb.searchParams.set('url', url)
  sb.searchParams.set('ai_extract_rules', JSON.stringify(extractRules))
  sb.searchParams.set('render_js', 'true')

  try {
    const res = await fetch(sb.toString(), { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[${PROVIDER}] AI Extract ${res.status} for ${url}: ${body.slice(0, 200)}`)
      return null
    }
    const raw = await res.text()
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn(`[${PROVIDER}] AI Extract returned non-JSON for ${url}`)
      return null
    }
    return normalizeExtracted(parsed)
  } catch (err: any) {
    console.warn(`[${PROVIDER}] AI Extract failed: ${err?.message ?? err}`)
    return null
  }
}

function normalizeExtracted(raw: any): ScrapedStructuredData {
  const bp = typeof raw?.booking_platform === 'string' ? raw.booking_platform.trim() : ''
  const booking_platform = bp && bp.toLowerCase() !== 'none' ? bp : null
  const book_url = typeof raw?.book_url === 'string' && raw.book_url.startsWith('http') ? raw.book_url : null
  const primary_cta = typeof raw?.primary_cta === 'string' && raw.primary_cta.trim() ? raw.primary_cta.trim() : null
  const services = Array.isArray(raw?.services)
    ? raw.services.filter((s: any) => typeof s === 'string' && s.length > 0).slice(0, 10)
    : []
  const team_members = Array.isArray(raw?.team_members)
    ? raw.team_members
        .filter((t: any) => t && typeof t.name === 'string' && t.name.length > 0)
        .slice(0, 10)
        .map((t: any) => ({
          name: String(t.name).trim(),
          title: typeof t.title === 'string' ? t.title.trim() : '',
          ...(typeof t.bio_url === 'string' && t.bio_url.startsWith('http') ? { bio_url: t.bio_url } : {}),
        }))
    : []
  return { booking_platform, book_url, primary_cta, services, team_members }
}

export { PROVIDER as SCRAPINGBEE_PROVIDER }
