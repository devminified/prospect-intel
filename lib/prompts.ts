export interface VisibilityPromptInput {
  name: string
  category: string
  city: string
  gmb_rating: number | null
  gmb_review_count: number | null
  gmb_photo_count: number | null
  gmb_review_highlights: string[]
  social_links: Record<string, string | null>
  instagram_followers: number | null
  facebook_followers: number | null
  serp_rank_main: number | null
  serp_rank_brand: number | null
  meta_ads_count: number | null
  press_mentions_count: number | null
}

export function visibilitySummaryPrompt(i: VisibilityPromptInput): string {
  const social = Object.entries(i.social_links)
    .filter(([, url]) => url)
    .map(([k, url]) => `${k}: ${url}`)
    .join(', ') || 'none detected'
  const highlights = i.gmb_review_highlights.length
    ? i.gmb_review_highlights.slice(0, 3).map((h) => `"${h}"`).join(' / ')
    : 'none available'
  const rating = i.gmb_rating != null ? `${i.gmb_rating}` : 'unknown'
  const reviewCount = i.gmb_review_count ?? 0
  const photoCount = i.gmb_photo_count ?? 0
  const rankMain = i.serp_rank_main != null ? `#${i.serp_rank_main}` : 'not in top 20'
  const rankBrand = i.serp_rank_brand != null ? `#${i.serp_rank_brand}` : 'not ranking'
  const adsCount = i.meta_ads_count != null ? i.meta_ads_count : 'unknown'
  const pressCount = i.press_mentions_count ?? 0

  return `Summarize this small business's digital footprint in 2-3 sentences. Be factual.
Do not editorialize, do not mention strengths vs weaknesses. State what's there.

BUSINESS: ${i.name} (${i.category}, ${i.city})

GMB: rating ${rating} (${reviewCount} reviews, ${photoCount} photos)
TOP REVIEW EXCERPTS: ${highlights}
SOCIAL: ${social}
FOLLOWERS: IG ${i.instagram_followers ?? 'unknown'}, FB ${i.facebook_followers ?? 'unknown'}
SEARCH: rank ${rankMain} for "${i.category} in ${i.city}", rank ${rankBrand} for own brand
ADS: ${adsCount} Meta ads currently running
PRESS: ${pressCount} news mentions in the last 90 days

Return plain text, no formatting, no preamble.`
}

export interface PitchPromptInput {
  name: string
  category: string
  city: string
  best_angle: string
  evidence: string
  solution_category: string
  primary_cta: string          // e.g. "FREE Consultation" button / "Book Now" / "no visible CTA"
  booking_status: string       // "has online booking via Zenoti" / "has Book Now button, backend unknown" / "no booking on site at all"
}

export function pitchPrompt(i: PitchPromptInput): string {
  return `Write a cold email to a small business owner. It must feel written
by a human who actually looked at their business.

BUSINESS: ${i.name} (${i.category}, ${i.city})
PAIN TO LEAD WITH: ${i.best_angle}
EVIDENCE: ${i.evidence}
SOLUTION CATEGORY: ${i.solution_category}
PRIMARY CTA ON SITE: ${i.primary_cta}
BOOKING STATUS: ${i.booking_status}

STRUCTURE (4 sentences max)
1. Specific observation of the issue (friendly, not accusatory)
2. The hidden cost of this issue (lost revenue or wasted time)
3. A realistic solution with a concrete timeline or outcome
4. Soft CTA, e.g., "Worth a quick 10-min call this week?"

RULES
- Under 80 words total.
- Subject line under 6 words, curiosity-based, mentions the business.
- NEVER say "I help businesses like yours" or similar templated openers.
- NEVER use "synergy", "leverage", "cutting-edge", "solutions provider".
- Reference the specific evidence, not the generic category.
- No jargon.
- CRITICAL: if BOOKING STATUS starts with "has online booking" or "has Book Now button",
  the business already HAS online booking. Do NOT suggest adding online booking. Pick a
  different pain to lead with instead (AI chatbot for after-hours inquiries, ecommerce
  for product/membership sales, workflow automation for intake/reminders/follow-ups,
  website rebuild). If the SOLUTION CATEGORY input says online_booking but BOOKING STATUS
  shows booking is already present, override it and use a different angle.
- If PRIMARY CTA is present and specific, you may reference it by name
  (e.g. "noticed your 'FREE Consultation' button…"). If it's generic or missing, ignore it.

Return ONLY valid JSON matching the required schema.`
}

export interface PlannerPromptInput {
  today_iso: string                // e.g. "2026-04-24"
  today_month_name: string         // "April"
  icp: {
    services: string[]
    avg_deal_size: number | null
    daily_capacity: number
    preferred_cities: string[]
    excluded_cities: string[]
    min_gmb_rating: number | null
    min_review_count: number | null
    target_categories: string[]
  }
  seasonality: Array<{
    category: string
    peak_months: number[]
    reason: string
    in_peak: boolean
  }>
  recent_batches: Array<{ city: string; category: string; prospects_created: number; created_at: string }>
}

export function plannerPrompt(i: PlannerPromptInput): string {
  const icp = i.icp
  const cap = icp.daily_capacity > 0 ? String(icp.daily_capacity) : 'unlimited'
  const preferred = icp.preferred_cities.length ? icp.preferred_cities.join(', ') : '(none specified — pick from real US metros)'
  const excluded = icp.excluded_cities.length ? icp.excluded_cities.join(', ') : 'none'
  const dealSize = icp.avg_deal_size != null ? `$${icp.avg_deal_size}` : 'unspecified'

  return `You are the lead-planning advisor for a dev + AI automation agency.
Today is ${i.today_iso} (${i.today_month_name}). Produce 3-5 prospect-discovery
batches to run TODAY, ranked by what has the best chance of converting given
the agency's ICP and category seasonality.

AGENCY ICP
- Services offered: ${icp.services.join(', ') || 'unspecified'}
- Average deal size: ${dealSize}
- Daily lead capacity (HARD CAP — total counts across items must be ≤ this): ${cap}
- Preferred cities: ${preferred}
- Excluded cities: ${excluded}
- Minimum GMB rating prospects must have: ${icp.min_gmb_rating ?? 'unspecified'}
- Minimum review count: ${icp.min_review_count ?? 'unspecified'}
- Target categories pool: ${icp.target_categories.join(', ') || 'unspecified'}

SEASONALITY FOR THIS MONTH
${i.seasonality.map((s) => `- ${s.category} [${s.in_peak ? 'IN PEAK' : 'off peak'}]: ${s.reason}`).join('\n') || '(no seasonality data for target categories)'}

RECENT BATCHES RUN (last 30 days, for avoiding immediate duplicates)
${i.recent_batches.length ? i.recent_batches.map((b) => `- ${b.category} in ${b.city} (${b.prospects_created} prospects, ${b.created_at.slice(0, 10)})`).join('\n') : '(no recent batches)'}

RULES
- Pick categories ONLY from the target_categories pool. Do not invent new ones.
- Pick cities ONLY from preferred_cities, or omit if none were provided (then use defensible US metros that fit the category).
- NEVER pick a city listed in excluded_cities.
- Prefer categories that are IN PEAK this month over off-peak ones. If a peak-category isn't in target_categories, skip it.
- Spread counts across 3-5 items when daily_capacity allows. Single-item plans only when capacity is small.
- Total of all item counts MUST be ≤ daily_capacity when daily_capacity > 0.
- Avoid re-running the exact same (category, city) combination within 30 days unless seasonality strongly justifies it.
- Each item needs a concrete reasoning string (1-2 sentences) that cites seasonality AND agency fit. Do not write generic "is a good category" reasoning.

Return ONLY valid JSON matching the required schema. No preamble, no markdown.`
}

export interface AnalysisPromptInput {
  name: string
  category: string
  city: string
  rating: number | null | undefined
  review_count: number | null | undefined
  hours_json: unknown
  signals_json: unknown
  homepage_text: string | null | undefined
}

export function analysisPrompt(i: AnalysisPromptInput): string {
  const rating = i.rating != null ? String(i.rating) : 'unknown'
  const reviewCount = i.review_count != null ? String(i.review_count) : 'unknown'
  const hours = i.hours_json ? JSON.stringify(i.hours_json) : 'unknown'
  const signals = JSON.stringify(i.signals_json ?? {}, null, 2)
  const homepage = (i.homepage_text ?? '').slice(0, 3000) || 'unavailable'

  return `You analyze a small business to find specific tech/automation gaps
a dev + AI automation agency can solve. Be concrete, not generic.

BUSINESS
- Name: ${i.name}
- Category: ${i.category}
- City: ${i.city}
- Rating: ${rating} (${reviewCount} reviews)
- Hours: ${hours}

WEBSITE SIGNALS (JSON)
${signals}

HOMEPAGE TEXT (first 3000 chars)
${homepage}

Return ONLY valid JSON matching the required schema.

RULES
- Max 3 pain points. Quality over quantity.
- Every pain needs CONCRETE evidence from the data above.
- If no real opportunity exists, score under 30 and return a minimal list.
- Never invent facts not present in the data.`
}
