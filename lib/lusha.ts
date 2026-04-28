import { ExternalAPIError } from './errors'

const PROVIDER = 'Lusha'
const LUSHA_BASE = 'https://api.lusha.com'

export interface LushaPhone {
  number: string
  type: string | null
}

export interface LushaPersonResult {
  full_name: string | null
  phones: LushaPhone[]
}

export function lushaConfigured(): boolean {
  return !!process.env.LUSHA_API_KEY
}

/**
 * Look up a person's direct/mobile phone via Lusha v2/person.
 *
 * Sync API — no webhooks, no async credits-stuck-in-flight failure mode like
 * Apollo. One request, one response, credit charged on success.
 *
 * Match path priority:
 *   1. linkedinUrl alone (most reliable when present)
 *   2. firstName + lastName + companies[].domain
 *   3. firstName + lastName + companies[].name (fallback when website missing)
 *
 * For our SMB ICP, path 3 is the common case — many local businesses don't
 * have a publicly-discoverable website domain in Apollo's data, but we always
 * have the business name from Google Places.
 */
export async function lushaFindPerson(input: {
  firstName: string | null
  lastName: string | null
  domain: string | null
  companyName: string | null
  linkedinUrl: string | null
}): Promise<LushaPersonResult | null> {
  const apiKey = process.env.LUSHA_API_KEY
  if (!apiKey) {
    throw new Error(
      'Lusha not configured: set LUSHA_API_KEY in env. Sign up at https://www.lusha.com/'
    )
  }

  // Lusha v2/person is a BULK endpoint — even a single lookup goes in a
  // `contacts: [...]` array. firstName/lastName/companies/linkedinUrl all
  // live inside each contact element, not at top level.
  const matchEntry: Record<string, unknown> = { contactId: 'lookup' }
  if (input.linkedinUrl) {
    matchEntry.linkedinUrl = input.linkedinUrl
  } else if (input.firstName && input.lastName && (input.domain || input.companyName)) {
    matchEntry.firstName = input.firstName
    matchEntry.lastName = input.lastName
    const companies: Array<Record<string, string>> = []
    if (input.domain) companies.push({ domain: input.domain })
    if (input.companyName) companies.push({ name: input.companyName })
    matchEntry.companies = companies
  } else {
    const missing: string[] = []
    if (!input.linkedinUrl) missing.push('linkedinUrl')
    if (!input.firstName) missing.push('firstName')
    if (!input.lastName) missing.push('lastName')
    if (!input.domain && !input.companyName) missing.push('domain or companyName')
    throw new Error(
      `Lusha can't match this contact — needs LinkedIn URL OR (firstName + lastName + domain/companyName). Missing: ${missing.join(', ')}.`
    )
  }
  const body = { contacts: [matchEntry] }

  const res = await fetch(`${LUSHA_BASE}/v2/person`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_key: apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new ExternalAPIError(PROVIDER, `v2/person failed: ${snippet(errBody)}`, res.status)
  }

  const data = await res.json().catch(() => null)
  if (!data) return null

  // Bulk response shape (v2/person): { contacts: { <contactId>: { data, error } }, requestId, ... }
  // Permissive parsing — Lusha has historically reshuffled response keys, so
  // try a few well-known places before giving up.
  const contactsBlock = (data as any).contacts ?? null
  let person: any = null
  if (contactsBlock && typeof contactsBlock === 'object') {
    const entry = contactsBlock['lookup'] ?? Object.values(contactsBlock)[0]
    if (entry && (entry as any).error) {
      // Lusha returned a per-contact error (typically "no match"). Treat as null match.
      return null
    }
    person = (entry as any)?.data ?? entry ?? null
  }
  if (!person) {
    person = (data as any).data ?? null
  }
  if (!person) return null

  const rawPhones = Array.isArray(person.phoneNumbers) ? person.phoneNumbers : []
  const phones: LushaPhone[] = rawPhones
    .map((p: any) => ({
      number: typeof p?.number === 'string' ? p.number : null,
      type: typeof p?.type === 'string' ? p.type : null,
    }))
    .filter((p: LushaPhone) => !!p.number)

  return {
    full_name: person.fullName ?? null,
    phones,
  }
}

/**
 * Pick the most call-worthy phone from a Lusha result.
 * Priority: mobile/cell > direct dial > anything else.
 */
export function bestPhone(phones: LushaPhone[]): string | null {
  if (phones.length === 0) return null
  const mobile = phones.find((p) => /mobile|cell/i.test(p.type ?? ''))
  if (mobile) return mobile.number
  const direct = phones.find((p) => /direct|dial/i.test(p.type ?? ''))
  if (direct) return direct.number
  return phones[0].number
}

function snippet(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return parsed?.message ?? parsed?.error ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200) || 'no body'
  }
}
