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
}

export function pitchPrompt(i: PitchPromptInput): string {
  return `Write a cold email to a small business owner. It must feel written
by a human who actually looked at their business.

BUSINESS: ${i.name} (${i.category}, ${i.city})
PAIN TO LEAD WITH: ${i.best_angle}
EVIDENCE: ${i.evidence}
SOLUTION CATEGORY: ${i.solution_category}

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

Return ONLY valid JSON matching the required schema.`
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
