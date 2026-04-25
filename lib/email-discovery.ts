/**
 * Best-effort business email discovery from a homepage HTML blob.
 * Pure functions — no I/O. Caller (lib/enrich.ts) supplies HTML + website URL.
 *
 * Strategy:
 *   1. Pull every email out of the HTML (mailto: links + plaintext regex)
 *   2. Strip vendor-platform emails (Squarespace/Wix/Calendly form noise)
 *   3. Prefer emails that match the business's own registrable domain
 *   4. Among matches, rank by localpart: owner > hello > contact > info > admin > rest
 *   5. Fall back to non-domain-matched emails (e.g. medspaowner@gmail.com on a
 *      Wix-hosted site that doesn't have its own MX) only if domain match fails
 *
 * Returned `email_confidence`:
 *   - 'verified' when the email's registrable domain matches the business website
 *   - 'guessed'  when we found an email but the domain doesn't match
 *   - null       when we found nothing usable
 */

// Domains that host SMB websites or contact-form/marketing tools — emails on
// these domains are platform/system addresses, not the business itself.
const VENDOR_DOMAINS = new Set<string>([
  'squarespace.com',
  'squarespace-cdn.com',
  'wix.com',
  'wixsite.com',
  'wixpress.com',
  'godaddy.com',
  'duda.co',
  'duda.com',
  'webflow.io',
  'webflow.com',
  'mailchimp.com',
  'list-manage.com',
  'campaignmonitor.com',
  'createsend.com',
  'typeform.com',
  'jotform.com',
  'calendly.com',
  'acuityscheduling.com',
  'sentry.io',
  'sentry-next.wixpress.com',
  'pagerduty.com',
  'example.com',
  'localhost',
  // Image / CDN hosts that sometimes have email-like strings in img src
  'cloudfront.net',
  'amazonaws.com',
])

const PREFERRED_LOCALPARTS = [
  'owner',
  'founder',
  'ceo',
  'hello',
  'hi',
  'contact',
  'team',
  'info',
  'admin',
  'support',
]

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g
const MAILTO_REGEX = /mailto:([^"'?#&\s>]+)/gi

export interface DiscoveredEmail {
  email: string | null
  email_source: 'website_scrape' | null
  email_confidence: 'verified' | 'guessed' | null
}

export function extractEmailsFromHtml(html: string): string[] {
  if (!html) return []
  const found = new Set<string>()

  let m: RegExpExecArray | null
  // mailto: links — most reliable
  while ((m = MAILTO_REGEX.exec(html)) !== null) {
    const decoded = safeDecode(m[1])
    if (looksLikeEmail(decoded)) found.add(decoded.toLowerCase())
  }
  // Reset state for the second regex
  MAILTO_REGEX.lastIndex = 0

  // Plain-text emails
  while ((m = EMAIL_REGEX.exec(html)) !== null) {
    const e = m[0].toLowerCase()
    if (looksLikeEmail(e)) found.add(e)
  }
  EMAIL_REGEX.lastIndex = 0

  return Array.from(found)
}

export function pickBestEmail(emails: string[], businessWebsite: string | null): DiscoveredEmail {
  const usable = emails.filter((e) => !isVendorEmail(e) && !isImageMistake(e))
  if (usable.length === 0) {
    return { email: null, email_source: null, email_confidence: null }
  }

  const businessHost = extractRegistrableDomain(businessWebsite)
  const domainMatched = businessHost
    ? usable.filter((e) => extractRegistrableDomain(emailDomain(e)) === businessHost)
    : []

  const pool = domainMatched.length > 0 ? domainMatched : usable
  pool.sort((a, b) => rankEmail(a) - rankEmail(b))

  return {
    email: pool[0],
    email_source: 'website_scrape',
    email_confidence: domainMatched.length > 0 ? 'verified' : 'guessed',
  }
}

// ──────────── helpers ────────────

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.trim())
  } catch {
    return s.trim()
  }
}

function looksLikeEmail(s: string): boolean {
  if (!s || !s.includes('@')) return false
  // Reject obvious noise like image filenames, hashes
  if (/[<>"'\s]/.test(s)) return false
  if (s.length > 254) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

function emailDomain(email: string): string {
  return email.split('@')[1] ?? ''
}

function extractRegistrableDomain(input: string | null): string | null {
  if (!input) return null
  let host: string
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`)
    host = url.hostname.toLowerCase()
  } catch {
    host = input.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
  host = host.replace(/^www\./, '')
  // Naive registrable-domain pick: last two labels. Good enough for .com, .net,
  // .io, .ai etc. Misses ccTLDs like .co.uk but that's edge for our SMB sample.
  const parts = host.split('.')
  if (parts.length <= 2) return host
  return parts.slice(-2).join('.')
}

function isVendorEmail(email: string): boolean {
  const reg = extractRegistrableDomain(emailDomain(email))
  return !!reg && VENDOR_DOMAINS.has(reg)
}

// Strings like 'foo@2x.png' caught by the loose regex — common on retina images
function isImageMistake(email: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(email) || /@[12]x$/.test(email)
}

function rankEmail(email: string): number {
  const local = (email.split('@')[0] ?? '').toLowerCase()
  for (let i = 0; i < PREFERRED_LOCALPARTS.length; i++) {
    const p = PREFERRED_LOCALPARTS[i]
    if (local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}_`) || local.startsWith(`${p}-`)) {
      return i
    }
  }
  // Personal-name-style emails (jane.smith@…) come after generic but before
  // platform/system-flavored ones (postmaster, no-reply)
  if (/^(noreply|no-reply|donotreply|postmaster|mailer-daemon)$/.test(local)) return 999
  if (/^[a-z]+\.[a-z]+$/.test(local) || /^[a-z]+@/.test(email)) return PREFERRED_LOCALPARTS.length + 1
  return PREFERRED_LOCALPARTS.length + 5
}
