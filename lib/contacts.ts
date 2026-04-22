import { supabaseAdmin } from '@/lib/supabase/server'
import { ExternalAPIError } from './errors'

if (!process.env.APOLLO_API_KEY) {
  throw new Error('Missing env.APOLLO_API_KEY')
}

const API_KEY = process.env.APOLLO_API_KEY
const PROVIDER = 'Apollo'
const APOLLO_BASE = 'https://api.apollo.io/api/v1'

const MAX_CONTACTS = 10

/**
 * Fine-grained ranking used to pick the PRIMARY contact for outreach.
 * Prefers revenue-/marketing-facing roles over back-office roles, since this
 * is an agency selling marketing/automation services. Lower number = higher priority.
 */
function pitchPriority(title: string | null | undefined): number {
  if (!title) return 99
  const t = title.toLowerCase()
  if (/\b(founder|co.?founder)\b/.test(t)) return 1
  if (/\b(owner|proprietor)\b/.test(t)) return 2
  if (/(^|\W)(ceo|chief executive)\b/.test(t)) return 3
  if (/(^|\W)president\b/.test(t) && !/vice/.test(t)) return 4
  if (/\b(cmo|cro|cco)\b|chief (marketing|revenue|commercial|growth)/.test(t)) return 5
  if (/\bvp\b|\bvice president\b/.test(t) && /(marketing|sales|revenue|growth|business)/.test(t)) return 6
  if (/\b(cfo|coo|cto)\b|chief (financial|operating|operations|technology)/.test(t)) return 7
  if (/\bvp\b|\bvice president\b/.test(t)) return 8
  if (/\bdirector\b/.test(t) && /(marketing|sales|revenue|growth|business|brand)/.test(t)) return 9
  if (/\bdirector\b/.test(t)) return 10
  if (/\bmanager\b/.test(t) && /(marketing|sales|revenue|growth|brand)/.test(t)) return 11
  if (/\bmanager\b/.test(t)) return 12
  return 50
}

function inferSeniority(title: string | null | undefined): string {
  if (!title) return 'other'
  const t = title.toLowerCase()
  if (/\b(founder|co.?founder)\b/.test(t)) return 'founder'
  if (/\b(owner|proprietor)\b/.test(t)) return 'owner'
  if (/\bvp\b|\bvice president\b/.test(t)) return 'vp'
  if (/(^|\W)(ceo|cfo|coo|cto|cmo|cro)\b|\bchief\b/.test(t)) return 'c_suite'
  if (/(^|\W)president\b/.test(t)) return 'c_suite'
  if (/\bdirector\b/.test(t)) return 'director'
  if (/\bmanager\b/.test(t)) return 'manager'
  return 'other'
}

interface ApolloPerson {
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

interface ContactInsert {
  prospect_id: string
  full_name: string | null
  title: string | null
  seniority: string | null
  department: string | null
  email: string | null
  email_confidence: string | null
  phone: string | null
  linkedin_url: string | null
  apollo_person_id: string | null
  is_primary: boolean
}

export async function findContacts(prospectId: string): Promise<void> {
  const { data: prospect, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, website, name')
    .eq('id', prospectId)
    .single()

  if (pErr || !prospect) {
    throw new Error(`Prospect not found: ${prospectId}`)
  }

  const domain = extractDomain(prospect.website)
  if (!domain) {
    // Nothing to search against. Leave a single placeholder row so pitch step
    // doesn't block waiting for contacts and the UI shows the reason.
    await supabaseAdmin.from('contacts').insert({
      prospect_id: prospectId,
      full_name: null,
      title: null,
      seniority: null,
      department: null,
      email: null,
      email_confidence: null,
      phone: null,
      linkedin_url: null,
      apollo_person_id: null,
      is_primary: false,
    })
    return
  }

  const people = await apolloPeopleSearch(domain)
  if (people.length === 0) return

  const rows: ContactInsert[] = people.slice(0, MAX_CONTACTS).map((p) => ({
    prospect_id: prospectId,
    full_name: p.name ?? joinName(p.first_name, p.last_name),
    title: p.title ?? null,
    seniority: p.seniority ?? inferSeniority(p.title),
    department: p.departments?.[0] ?? null,
    email: p.email ?? null,
    email_confidence: p.email ? mapConfidence(p.email_status) : null,
    phone: null,
    linkedin_url: p.linkedin_url ?? null,
    apollo_person_id: p.id ?? null,
    is_primary: false,
  }))

  rows.sort((a, b) => pitchPriority(a.title) - pitchPriority(b.title))
  if (rows.length > 0) rows[0].is_primary = true

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('contacts')
    .insert(rows)
    .select('id, is_primary, apollo_person_id, email')

  if (insertErr) {
    throw new Error(`Failed to save contacts: ${insertErr.message}`)
  }

  const primary = (inserted ?? []).find((c: any) => c.is_primary)
  if (primary && primary.apollo_person_id && !primary.email) {
    const revealed = await apolloPeopleMatch(primary.apollo_person_id)
    if (revealed?.email) {
      await supabaseAdmin
        .from('contacts')
        .update({
          email: revealed.email,
          email_confidence: mapConfidence(revealed.email_status),
          phone: revealed.phone ?? null,
        })
        .eq('id', primary.id)
    }
  }
}

async function apolloPeopleSearch(domain: string): Promise<ApolloPerson[]> {
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

interface ApolloMatchResult {
  email?: string | null
  email_status?: string
  phone?: string | null
}

async function apolloPeopleMatch(personId: string): Promise<ApolloMatchResult | null> {
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
    const body = await res.text().catch(() => '')
    console.warn(`[Apollo] match for ${personId} failed: ${extractSnippet(body)} (HTTP ${res.status})`)
    return null
  }
  const data = await res.json()
  const person = data?.person
  if (!person) return null
  return {
    email: person.email ?? null,
    email_status: person.email_status,
    phone: person.phone_number ?? null,
  }
}

function extractDomain(website: string | null): string | null {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function joinName(first?: string, last?: string): string | null {
  const parts = [first, last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function mapConfidence(status?: string): string | null {
  if (!status) return null
  if (status === 'verified') return 'verified'
  if (status === 'guessed' || status === 'likely') return 'guessed'
  return 'unverified'
}

function extractSnippet(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return parsed?.error ?? parsed?.message ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200) || 'no body'
  }
}
