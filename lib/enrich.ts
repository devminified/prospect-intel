import * as cheerio from 'cheerio'
import { supabaseAdmin } from '@/lib/supabase/server'

interface TechStack {
  has_website: boolean
  website_status: number | null
  cms: string | null
  booking: string | null
  ecommerce: string | null
  chat: string | null
}

interface EnrichmentRow {
  prospect_id: string
  tech_stack_json: TechStack | { has_website: false }
  has_online_booking: boolean
  has_ecommerce: boolean
  has_chat: boolean
  has_contact_form: boolean
  is_mobile_friendly: boolean
  ssl_valid: boolean
  homepage_text_excerpt: string | null
  fetch_error: string | null
  fetched_at: string
}

const FETCH_TIMEOUT_MS = 8000
const HOMEPAGE_EXCERPT_CHARS = 3000

export async function enrichProspect(prospectId: string): Promise<void> {
  const { data: prospect, error: prospectError } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single()

  if (prospectError || !prospect) {
    throw new Error(`Prospect not found: ${prospectId}`)
  }

  const now = new Date().toISOString()

  if (!prospect.website) {
    await writeEnrichment({
      prospect_id: prospectId,
      tech_stack_json: { has_website: false },
      has_online_booking: false,
      has_ecommerce: false,
      has_chat: false,
      has_contact_form: false,
      is_mobile_friendly: false,
      ssl_valid: false,
      homepage_text_excerpt: null,
      fetch_error: 'No website URL',
      fetched_at: now,
    })
    await markProspectEnriched(prospectId, prospect.batch_id)
    return
  }

  const rawUrl = prospect.website
  const withoutScheme = rawUrl.replace(/^https?:\/\//, '')
  const httpsUrl = `https://${withoutScheme}`
  const httpUrl = `http://${withoutScheme}`

  let html: string | null = null
  let status: number | null = null
  let fetchError: string | null = null
  let sslValid = false
  let finalUrl: string | null = null

  const httpsResult = await tryFetch(httpsUrl)
  if (httpsResult.ok) {
    html = httpsResult.html
    status = httpsResult.status
    sslValid = true
    finalUrl = httpsUrl
  } else {
    const httpResult = await tryFetch(httpUrl)
    if (httpResult.ok) {
      html = httpResult.html
      status = httpResult.status
      sslValid = false
      finalUrl = httpUrl
    } else {
      status = httpsResult.status ?? httpResult.status
      fetchError = httpsResult.error ?? httpResult.error ?? 'fetch failed'
    }
  }
  void finalUrl

  const techStack: TechStack = {
    has_website: true,
    website_status: status,
    cms: null,
    booking: null,
    ecommerce: null,
    chat: null,
  }

  let homepageText: string | null = null
  let hasContactForm = false
  let isMobileFriendly = false

  if (html) {
    const $ = cheerio.load(html)

    $('script, style, noscript').remove()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    homepageText = bodyText.slice(0, HOMEPAGE_EXCERPT_CHARS)

    isMobileFriendly = $('meta[name="viewport"]').length > 0

    hasContactForm = $('form').filter((_i: number, el: any) => {
      const formHtml = $(el).html() || ''
      return /email|contact|message/i.test(formHtml)
    }).length > 0

    const lower = html.toLowerCase()

    if (lower.includes('wp-content') || lower.includes('wordpress')) {
      techStack.cms = 'WordPress'
    } else if (lower.includes('cdn.shopify.com')) {
      techStack.cms = 'Shopify'
    } else if (lower.includes('wix.com') || lower.includes('wixsite')) {
      techStack.cms = 'Wix'
    } else if (lower.includes('squarespace.com') || lower.includes('sqsp.net')) {
      techStack.cms = 'Squarespace'
    } else if (lower.includes('webflow.com') || lower.includes('webflow.io')) {
      techStack.cms = 'Webflow'
    }

    if (lower.includes('calendly.com')) {
      techStack.booking = 'Calendly'
    } else if (lower.includes('acuityscheduling.com')) {
      techStack.booking = 'Acuity'
    } else if (lower.includes('opentable.com')) {
      techStack.booking = 'OpenTable'
    } else if (lower.includes('resy.com')) {
      techStack.booking = 'Resy'
    } else if (lower.includes('square.site/book') || lower.includes('squareappointments')) {
      techStack.booking = 'Square Appointments'
    } else if (lower.includes('yelp.com/reservations')) {
      techStack.booking = 'Yelp Reservations'
    }

    if (lower.includes('cdn.shopify.com') || lower.includes('myshopify.com')) {
      techStack.ecommerce = 'Shopify'
    } else if (lower.includes('woocommerce')) {
      techStack.ecommerce = 'WooCommerce'
    } else if (lower.includes('square.site') || lower.includes('squareup.com')) {
      techStack.ecommerce = 'Square'
    } else if (lower.includes('bigcommerce.com')) {
      techStack.ecommerce = 'BigCommerce'
    } else if (lower.includes('ecwid.com')) {
      techStack.ecommerce = 'Ecwid'
    }

    if (lower.includes('widget.intercom.io') || lower.includes('intercom.io')) {
      techStack.chat = 'Intercom'
    } else if (lower.includes('drift.com') || lower.includes('driftt.com')) {
      techStack.chat = 'Drift'
    } else if (lower.includes('tawk.to')) {
      techStack.chat = 'Tawk.to'
    } else if (lower.includes('zendesk.com') || lower.includes('zdassets.com')) {
      techStack.chat = 'Zendesk'
    } else if (lower.includes('livechat.com') || lower.includes('livechatinc.com')) {
      techStack.chat = 'LiveChat'
    } else if (lower.includes('crisp.chat')) {
      techStack.chat = 'Crisp'
    }
  }

  await writeEnrichment({
    prospect_id: prospectId,
    tech_stack_json: techStack,
    has_online_booking: !!techStack.booking,
    has_ecommerce: !!techStack.ecommerce,
    has_chat: !!techStack.chat,
    has_contact_form: hasContactForm,
    is_mobile_friendly: isMobileFriendly,
    ssl_valid: sslValid,
    homepage_text_excerpt: homepageText,
    fetch_error: fetchError,
    fetched_at: now,
  })

  await markProspectEnriched(prospectId, prospect.batch_id)
}

interface FetchOutcome {
  ok: boolean
  html: string | null
  status: number | null
  error: string | null
}

async function tryFetch(url: string): Promise<FetchOutcome> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProspectIntelBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!response.ok) {
      return { ok: false, html: null, status: response.status, error: `HTTP ${response.status}` }
    }
    const html = await response.text()
    return { ok: true, html, status: response.status, error: null }
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? 'fetch failed')
    return { ok: false, html: null, status: null, error: msg }
  }
}

async function writeEnrichment(row: EnrichmentRow): Promise<void> {
  const { error } = await supabaseAdmin.from('enrichments').insert(row)
  if (error) {
    throw new Error(`Failed to save enrichment: ${error.message}`)
  }
}

async function markProspectEnriched(prospectId: string, _batchId: string): Promise<void> {
  await supabaseAdmin.from('prospects').update({ status: 'enriched' }).eq('id', prospectId)
}
