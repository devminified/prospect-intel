/**
 * Known booking / scheduling platforms that show up in HTML as script URLs,
 * iframes, or booking links. Used to set `tech_stack_json.booking` during
 * enrichment. Order matters — the first match wins, so put the most specific
 * domains first.
 *
 * Expanded for Phase 3 to cover the med-spa, wellness, and local-SMB market
 * that the Phase 1/2 matchers missed (which caused the Wild and Beautiful
 * "recommended booking to a site with a Book Now button" pitch error).
 */
export const BOOKING_PLATFORMS: Array<{ label: string; pattern: RegExp }> = [
  // Phase 1 originals
  { label: 'Calendly', pattern: /calendly\.com/i },
  { label: 'Acuity', pattern: /acuityscheduling\.com/i },
  { label: 'OpenTable', pattern: /opentable\.com/i },
  { label: 'Resy', pattern: /resy\.com/i },
  { label: 'Square Appointments', pattern: /square\.site\/book|squareappointments/i },
  { label: 'Yelp Reservations', pattern: /yelp\.com\/reservations/i },

  // Phase 3: med spa / wellness / local SMB coverage
  { label: 'Vagaro', pattern: /(?:app\.)?vagaro\.com/i },
  { label: 'Boulevard', pattern: /(?:joinblvd|boulevard)\.(?:io|com)/i },
  { label: 'Mindbody', pattern: /mindbody(?:online)?\.com/i },
  { label: 'Zenoti', pattern: /(?:ext\.)?zenoti\.com/i },
  { label: 'GlossGenius', pattern: /glossgenius\.com/i },
  { label: 'Jane', pattern: /(?:jane\.app|janeapp\.com)/i },
  { label: 'Mangomint', pattern: /mangomint\.com/i },
  { label: 'Fresha', pattern: /fresha\.com/i },
  { label: 'Booker', pattern: /(?:my)?booker\.com/i },
  { label: 'Schedulicity', pattern: /schedulicity\.com/i },
  { label: 'Timely', pattern: /gettimely\.com/i },
  { label: 'Cliniko', pattern: /cliniko\.com/i },
  { label: 'SimplePractice', pattern: /simplepractice\.com/i },
  { label: 'Squarespace Scheduling', pattern: /squarespacescheduling\.com|acuityscheduling\.com\/schedule\.php/i },
  { label: 'SimplyBook', pattern: /simplybook\.me/i },
]

/**
 * Match any of the platform patterns against raw HTML. Returns the label of
 * the first platform detected, or null.
 */
export function detectBookingPlatform(html: string): string | null {
  for (const { label, pattern } of BOOKING_PLATFORMS) {
    if (pattern.test(html)) return label
  }
  return null
}

/**
 * Generic "book now" CTA catch-all. Matches HTML for any <a> or <button>
 * whose href or visible text strongly indicates a booking action. This is
 * the final fallback when no specific platform was detected — it catches
 * home-grown booking widgets, custom Squarespace/WordPress embeds, and links
 * pointing at unknown third-party schedulers.
 *
 * Returns true if the page appears to have a booking CTA regardless of
 * whether we recognize the backend platform.
 */
export function hasBookingCTA(html: string): boolean {
  // Link patterns pointing at book/schedule/appointment URLs
  const urlPattern = /<a[^>]+href=['"][^'"]*(book|appointment|schedule|reserve)[^'"]*['"][^>]*>/i
  // Visible text patterns — loose match for button/link text
  const textPattern = />\s*(book (?:now|today|online|an? appointment)|schedule (?:now|your|a consultation|an appointment)|reserve (?:now|your spot)|request an? appointment)\s*</i
  return urlPattern.test(html) || textPattern.test(html)
}
