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
 * Lusha matches against (firstName + lastName + companyDomain) OR linkedinUrl.
 * Domain match is the more reliable path for SMB targets where decision-makers
 * may not have public LinkedIn profiles.
 */
export async function lushaFindPerson(input: {
  firstName: string | null
  lastName: string | null
  domain: string | null
  linkedinUrl: string | null
}): Promise<LushaPersonResult | null> {
  const apiKey = process.env.LUSHA_API_KEY
  if (!apiKey) {
    throw new Error(
      'Lusha not configured: set LUSHA_API_KEY in env. Sign up at https://www.lusha.com/'
    )
  }

  // Build the smallest possible match payload Lusha accepts. Prefer the
  // LinkedIn path when we have it; fall back to firstName+lastName+domain.
  const body: Record<string, unknown> = {}
  if (input.linkedinUrl) {
    body.linkedinUrl = input.linkedinUrl
  } else {
    if (!input.firstName || !input.lastName || !input.domain) {
      throw new Error(
        'Lusha needs either linkedinUrl OR (firstName + lastName + domain) — contact lacks all three'
      )
    }
    body.firstName = input.firstName
    body.lastName = input.lastName
    body.companies = [{ domain: input.domain }]
  }

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
  const person = (data as any)?.data ?? data
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
