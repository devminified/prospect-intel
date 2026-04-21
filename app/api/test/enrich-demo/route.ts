import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET() {
  try {
    // Test website scraping without database
    const testUrl = 'https://example.com'
    
    const response = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProspectIntelBot/1.0)',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return NextResponse.json({ 
        error: `Failed to fetch: ${response.status}`,
        url: testUrl 
      })
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    
    // Extract data like enrichProspect function
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    const hasMobileFriendly = $('meta[name="viewport"]').length > 0
    const hasContactForm = $('form').filter((i, el) => {
      const formHtml = $(el).html() || ''
      return formHtml.includes('email') || formHtml.includes('contact') || formHtml.includes('message')
    }).length > 0

    // Tech stack detection (same as enrich.ts)
    const signals = {
      cms: null as string | null,
      booking: null as string | null,
      ecommerce: null as string | null,
      chat: null as string | null,
    }

    if (html.includes('wp-content') || html.includes('wordpress')) {
      signals.cms = 'WordPress'
    } else if (html.includes('cdn.shopify.com')) {
      signals.cms = 'Shopify'
    } else if (html.includes('wix.com') || html.includes('wixsite')) {
      signals.cms = 'Wix'
    }

    if (html.includes('calendly.com')) {
      signals.booking = 'Calendly'
    } else if (html.includes('acuityscheduling.com')) {
      signals.booking = 'Acuity'
    }

    if (html.includes('cdn.shopify.com') || html.includes('myshopify.com')) {
      signals.ecommerce = 'Shopify'
    } else if (html.includes('woocommerce')) {
      signals.ecommerce = 'WooCommerce'
    }

    if (html.includes('widget.intercom.io')) {
      signals.chat = 'Intercom'
    } else if (html.includes('tawk.to')) {
      signals.chat = 'Tawk.to'
    }

    return NextResponse.json({
      success: true,
      url: testUrl,
      status: response.status,
      hasSSL: testUrl.startsWith('https://'),
      hasMobileFriendly,
      hasContactForm,
      signals,
      textLength: bodyText.length,
      textPreview: bodyText.substring(0, 200),
      message: 'Enrichment logic working! Ready to integrate with database.'
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Test failed', 
      details: error.message 
    }, { status: 500 })
  }
}