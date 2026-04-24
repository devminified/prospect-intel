import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { channelRecommendationPrompt } from '@/lib/prompts'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing env.ANTHROPIC_API_KEY')
}

const SONNET_MODEL = 'claude-sonnet-4-6'

interface ChannelRecommendation {
  phone_fit_score: number
  email_fit_score: number
  recommended_channel: 'phone' | 'email' | 'either'
  reasoning: string
  phone_script: string
}

// Note: Anthropic's structured-output JSON schema does not accept minimum/maximum
// on integer types (will return 400). Range is enforced at parse time in callSonnet.
const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    phone_fit_score: { type: 'integer' },
    email_fit_score: { type: 'integer' },
    recommended_channel: { type: 'string', enum: ['phone', 'email', 'either'] },
    reasoning: { type: 'string' },
    phone_script: { type: 'string' },
  },
  required: ['phone_fit_score', 'email_fit_score', 'recommended_channel', 'reasoning', 'phone_script'],
  additionalProperties: false,
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function recommendChannel(prospectId: string): Promise<void> {
  const { data: prospect, error: pErr } = await supabaseAdmin
    .from('prospects')
    .select('id, name, phone, categories_text, batches(city, category)')
    .eq('id', prospectId)
    .single()
  if (pErr || !prospect) throw new Error(`Prospect not found: ${prospectId}`)

  const [analysisRes, enrichmentRes, auditRes, contactsRes] = await Promise.all([
    supabaseAdmin.from('analyses').select('opportunity_score, best_angle, pain_points_json').eq('prospect_id', prospectId).maybeSingle(),
    supabaseAdmin.from('enrichments').select('has_online_booking, tech_stack_json, scraped_data_json').eq('prospect_id', prospectId).maybeSingle(),
    supabaseAdmin.from('visibility_audits').select('visibility_summary').eq('prospect_id', prospectId).maybeSingle(),
    supabaseAdmin.from('contacts').select('full_name, title, seniority, email, email_confidence, is_primary').eq('prospect_id', prospectId),
  ])

  const analysis = analysisRes.data as any
  const enrichment = enrichmentRes.data as any
  const audit = auditRes.data as any
  const contacts = (contactsRes.data ?? []) as any[]

  const batch: any = prospect.batches
  const city: string = batch?.city ?? 'unknown'
  const category: string = (prospect as any).categories_text ?? batch?.category ?? 'business'

  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null
  const firstName = primary?.full_name ? String(primary.full_name).split(/\s+/)[0] : null
  const hasVerifiedEmail = contacts.some((c) => c.email && c.email_confidence === 'verified')

  const techStack = enrichment?.tech_stack_json ?? {}
  const scraped = enrichment?.scraped_data_json ?? null
  const hasBooking = Boolean(enrichment?.has_online_booking)
  let bookingStatus: string
  if (hasBooking) {
    const platform = techStack?.booking ?? scraped?.booking_platform ?? 'unknown'
    bookingStatus = platform && platform !== 'unknown'
      ? `has online booking via ${platform}`
      : 'has Book Now button, backend platform unknown'
  } else {
    bookingStatus = 'no booking on site at all'
  }

  const painPoints = (analysis?.pain_points_json ?? []) as Array<{ pain: string }>
  const primaryPain = painPoints[0]?.pain ?? null

  const prompt = channelRecommendationPrompt({
    name: prospect.name,
    category,
    city,
    opportunity_score: analysis?.opportunity_score ?? null,
    best_angle: analysis?.best_angle ?? null,
    primary_pain: primaryPain,
    primary_contact: primary
      ? {
          first_name: firstName,
          title: primary.title ?? null,
          seniority: primary.seniority ?? null,
        }
      : null,
    contacts_count: contacts.length,
    has_business_phone: Boolean((prospect as any).phone),
    has_verified_email: hasVerifiedEmail,
    visibility_summary: audit?.visibility_summary ?? null,
    booking_status: bookingStatus,
  })

  const result = await callSonnet(prompt)

  const { error: upsertError } = await supabaseAdmin
    .from('channel_recommendations')
    .upsert(
      {
        prospect_id: prospectId,
        phone_fit_score: result.phone_fit_score,
        email_fit_score: result.email_fit_score,
        recommended_channel: result.recommended_channel,
        reasoning: result.reasoning,
        phone_script: result.phone_script,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'prospect_id' }
    )

  if (upsertError) throw new Error(`Failed to save recommendation: ${upsertError.message}`)
}

async function callSonnet(prompt: string): Promise<ChannelRecommendation> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    temperature: 0.5,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: RECOMMENDATION_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  } as any)

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const parsed = JSON.parse(text) as ChannelRecommendation
  if (parsed.phone_fit_score < 0 || parsed.phone_fit_score > 100) {
    throw new Error(`phone_fit_score out of range: ${parsed.phone_fit_score}`)
  }
  if (parsed.email_fit_score < 0 || parsed.email_fit_score > 100) {
    throw new Error(`email_fit_score out of range: ${parsed.email_fit_score}`)
  }
  return parsed
}
