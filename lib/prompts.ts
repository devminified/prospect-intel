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
