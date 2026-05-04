import { ExternalAPIError } from '../errors'

/**
 * Thin Apollo.io HTTP layer. Exposes ONLY the network calls plus the wire
 * types they return. Higher-level orchestration (writing to the contacts
 * table, picking the primary contact, mapping email confidence) lives in
 * `lib/contacts/` so this module stays as small and replaceable as
 * possible.
 *
 * If we ever swap Apollo for another vendor, only this folder should need
 * to change.
 */

if (!process.env.APOLLO_API_KEY) {
  throw new Error('Missing env.APOLLO_API_KEY')
}

const API_KEY = process.env.APOLLO_API_KEY
const PROVIDER = 'Apollo'
const APOLLO_BASE = 'https://api.apollo.io/api/v1'

const MAX_CONTACTS = 10

export interface ApolloPerson {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  seniority?: string
  departments?: string[]
  email?: string | null
  email_status?: string
  linkedin_url?: string
  organization?: { name?: string; website_url?: string }
}

export interface ApolloMatchResult {
  email?: string | null
  email_status?: string
}

export async function apolloPeopleSearch(domain: string): Promise<ApolloPerson[]> {
  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'director', 'manager'],
      page: 1,
      per_page: MAX_CONTACTS,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const snippet = extractSnippet(body)
    throw new ExternalAPIError(PROVIDER, `peopleSearch failed: ${snippet}`, res.status)
  }
  const data = await res.json()
  const people = Array.isArray(data?.people) ? data.people : []
  const contacts = Array.isArray(data?.contacts) ? data.contacts : []
  return [...people, ...contacts]
}

export async function apolloPeopleMatch(personId: string): Promise<ApolloMatchResult | null> {
  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      id: personId,
      reveal_personal_emails: false,
      reveal_phone_number: false,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new ExternalAPIError(PROVIDER, `peopleMatch failed: ${extractSnippet(errBody)}`, res.status)
  }
  const data = await res.json()
  const person = data?.person
  if (!person) return null
  return {
    email: person.email ?? null,
    email_status: person.email_status,
  }
}

/** Apollo's per-search row cap. Exported for callers that want to slice further. */
export const APOLLO_MAX_CONTACTS = MAX_CONTACTS

function extractSnippet(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return parsed?.error ?? parsed?.message ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200) || 'no body'
  }
}
