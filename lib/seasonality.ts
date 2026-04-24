/**
 * Hardcoded category-level seasonality used by the Phase 4A planner.
 *
 * Months are 1-indexed (Jan=1 .. Dec=12). peak_months is the short list of
 * months when demand for that category's services typically spikes, which
 * translates to higher owner willingness to spend on marketing/tech upgrades.
 *
 * Keep this tight — the planner uses it as evidence, so each row should
 * have a one-sentence rationale the LLM can lift into user-facing copy.
 * Edit by PR when experience teaches you a category was mis-scored.
 */
export interface Seasonality {
  category: string
  peak_months: number[]
  reason: string
}

export const CATEGORY_SEASONALITY: Seasonality[] = [
  { category: 'med spas', peak_months: [4, 5, 10, 11], reason: 'Pre-summer prep (Apr/May) and pre-holiday gifting (Oct/Nov) drive botox, filler, and body-contour demand.' },
  { category: 'dental practices', peak_months: [1, 8, 9, 12], reason: 'Jan (insurance reset), Aug-Sep (back-to-school), Dec (use-it-or-lose-it benefits).' },
  { category: 'dentists', peak_months: [1, 8, 9, 12], reason: 'Jan (insurance reset), Aug-Sep (back-to-school), Dec (use-it-or-lose-it benefits).' },
  { category: 'orthodontists', peak_months: [5, 6, 7, 8], reason: 'Summer break is prime treatment-start window for kids and teens.' },
  { category: 'chiropractors', peak_months: [1, 9], reason: 'New-year wellness resolutions and post-summer injury recovery.' },
  { category: 'physical therapy', peak_months: [1, 9], reason: 'New-year fitness resolutions and fall sports injury uptick.' },
  { category: 'optometrists', peak_months: [8, 9, 12], reason: 'Back-to-school vision checks and end-of-year benefits usage.' },
  { category: 'dermatologists', peak_months: [3, 4, 5, 10], reason: 'Spring (pre-summer sun damage prep) and fall (indoor treatments season).' },
  { category: 'tax preparation', peak_months: [1, 2, 3, 4], reason: 'Q1 tax season is the entire business year; owners have cash and urgency.' },
  { category: 'accountants', peak_months: [1, 2, 3, 4, 9, 10], reason: 'Tax season and quarterly close windows.' },
  { category: 'cpa firms', peak_months: [1, 2, 3, 4, 9, 10], reason: 'Tax season and quarterly close windows.' },
  { category: 'law firms', peak_months: [1, 9], reason: 'New-year case volumes and post-summer litigation uptick.' },
  { category: 'family law attorneys', peak_months: [1, 2, 9], reason: 'January divorce filings spike; back-to-school child-custody conflicts.' },
  { category: 'personal injury attorneys', peak_months: [5, 6, 7, 8], reason: 'Summer driving and recreation injury claims peak.' },
  { category: 'real estate agencies', peak_months: [4, 5, 6, 7, 8], reason: 'Traditional home-buying season; listings and tours drive agent marketing spend.' },
  { category: 'real estate agents', peak_months: [4, 5, 6, 7, 8], reason: 'Traditional home-buying season.' },
  { category: 'mortgage brokers', peak_months: [4, 5, 6, 7, 8], reason: 'Follows real estate seasonality.' },
  { category: 'property management', peak_months: [6, 7, 8], reason: 'Summer lease-turnover season.' },
  { category: 'landscaping', peak_months: [3, 4, 5, 9], reason: 'Spring cleanup (Mar-May) and fall yard prep (Sep).' },
  { category: 'lawn care', peak_months: [3, 4, 5, 9], reason: 'Spring and fall yard prep.' },
  { category: 'HVAC', peak_months: [5, 6, 7, 11, 12], reason: 'Summer AC peak (May-Jul) and winter heat peak (Nov-Dec).' },
  { category: 'plumbers', peak_months: [1, 2, 6, 7, 12], reason: 'Winter pipe-freeze emergencies and summer irrigation/outdoor plumbing.' },
  { category: 'roofing contractors', peak_months: [3, 4, 5, 8, 9], reason: 'Post-winter storm-damage season and pre-winter repair season.' },
  { category: 'pest control', peak_months: [3, 4, 5, 6, 7, 8], reason: 'Termite swarms in spring; ants/mosquitoes through summer.' },
  { category: 'wedding planners', peak_months: [1, 2, 8], reason: 'Engagement season (Dec-Feb) drives inbound; planning usually 12-18 months out.' },
  { category: 'wedding photographers', peak_months: [1, 2, 3, 4], reason: 'Booked early for summer and fall wedding season.' },
  { category: 'caterers', peak_months: [1, 2, 3, 10, 11], reason: 'Wedding booking window (early year) and holiday corporate events (late year).' },
  { category: 'event planners', peak_months: [1, 2, 9, 10], reason: 'Corporate Q1 planning and fall event season prep.' },
  { category: 'fitness studios', peak_months: [1, 9], reason: 'New-year resolutions and post-summer back-to-routine.' },
  { category: 'gyms', peak_months: [1, 9], reason: 'New-year resolutions and post-summer.' },
  { category: 'personal trainers', peak_months: [1, 4, 5, 9], reason: 'New-year, pre-summer prep, and back-to-routine windows.' },
  { category: 'yoga studios', peak_months: [1, 9], reason: 'New-year wellness + fall back-to-routine.' },
  { category: 'pilates studios', peak_months: [1, 9], reason: 'New-year wellness + fall back-to-routine.' },
  { category: 'salons', peak_months: [3, 4, 5, 11, 12], reason: 'Pre-summer and pre-holiday grooming cycles.' },
  { category: 'hair salons', peak_months: [3, 4, 5, 11, 12], reason: 'Pre-summer and pre-holiday grooming.' },
  { category: 'nail salons', peak_months: [4, 5, 11, 12], reason: 'Spring/summer sandal season and holiday events.' },
  { category: 'barber shops', peak_months: [5, 6, 11, 12], reason: 'Wedding/graduation season and holiday cuts.' },
  { category: 'bridal shops', peak_months: [1, 2, 3], reason: 'Engagement season drives early-year store traffic.' },
  { category: 'coffee shops', peak_months: [9, 10, 11], reason: 'Pumpkin-spice-through-winter seasonal menu drives new-customer opportunity.' },
  { category: 'restaurants', peak_months: [2, 5, 11, 12], reason: 'Valentine\'s, Mother\'s Day, Thanksgiving, holiday dining spikes.' },
  { category: 'catering companies', peak_months: [5, 10, 11, 12], reason: 'Wedding + corporate holiday events.' },
  { category: 'photographers', peak_months: [4, 5, 9, 10], reason: 'Spring/fall portrait and wedding seasons.' },
  { category: 'pet groomers', peak_months: [4, 5, 6, 11, 12], reason: 'Summer shedding season and pre-holiday pet portraits/visits.' },
  { category: 'veterinarians', peak_months: [4, 5, 9, 10], reason: 'Pre-summer preventive care (fleas/heartworm) and fall checkups.' },
  { category: 'interior designers', peak_months: [1, 2, 9], reason: 'Post-holiday refresh and pre-holiday entertaining prep.' },
  { category: 'home builders', peak_months: [3, 4, 5], reason: 'Spring groundbreaking aligns with financing approvals.' },
  { category: 'moving companies', peak_months: [5, 6, 7, 8], reason: 'Summer relocation season.' },
  { category: 'private schools', peak_months: [10, 11, 12, 1, 2], reason: 'Admissions cycle for next academic year.' },
  { category: 'tutoring services', peak_months: [8, 9, 1], reason: 'Back-to-school and second-semester pickups.' },
  { category: 'daycares', peak_months: [6, 7, 8], reason: 'Summer signup wave for fall enrollment.' },
  { category: 'bookstores', peak_months: [11, 12], reason: 'Holiday gift-giving dominates retail book sales.' },
]

/**
 * Resolve a fuzzy match from user-entered category string against the
 * calendar. Returns the matching row, or null.
 */
export function lookupSeasonality(category: string): Seasonality | null {
  const k = category.trim().toLowerCase()
  return (
    CATEGORY_SEASONALITY.find((s) => s.category === k) ??
    CATEGORY_SEASONALITY.find((s) => k.includes(s.category) || s.category.includes(k)) ??
    null
  )
}

/**
 * Render the calendar for the planner prompt: only categories relevant to the
 * user's target_categories, annotated with "in peak" or "off peak" for today.
 */
export function calendarForCategories(targetCategories: string[], month: number): Array<Seasonality & { in_peak: boolean }> {
  const normalized = targetCategories.map((c) => c.trim().toLowerCase())
  const matches: Array<Seasonality & { in_peak: boolean }> = []
  for (const c of normalized) {
    const s = lookupSeasonality(c)
    if (s && !matches.some((m) => m.category === s.category)) {
      matches.push({ ...s, in_peak: s.peak_months.includes(month) })
    }
  }
  return matches
}
