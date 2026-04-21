import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { analysisPrompt } from '@/lib/prompts'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing env.ANTHROPIC_API_KEY')
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

const SOLUTION_CATEGORIES = [
  'website_rebuild',
  'online_booking',
  'ai_chatbot',
  'workflow_automation',
  'ecommerce',
  'custom_software',
] as const

type SolutionCategory = typeof SOLUTION_CATEGORIES[number]

interface PainPoint {
  pain: string
  evidence: string
  solution_category: SolutionCategory
  effort: 'small' | 'medium' | 'large'
  impact: 'low' | 'medium' | 'high'
}

interface AnalysisResult {
  pain_points: PainPoint[]
  opportunity_score: number
  best_angle: string
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    pain_points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pain: { type: 'string' },
          evidence: { type: 'string' },
          solution_category: { type: 'string', enum: SOLUTION_CATEGORIES },
          effort: { type: 'string', enum: ['small', 'medium', 'large'] },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['pain', 'evidence', 'solution_category', 'effort', 'impact'],
        additionalProperties: false,
      },
    },
    opportunity_score: { type: 'integer' },
    best_angle: { type: 'string' },
  },
  required: ['pain_points', 'opportunity_score', 'best_angle'],
  additionalProperties: false,
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function analyzeProspect(prospectId: string): Promise<void> {
  const { data: prospect, error: prospectError } = await supabaseAdmin
    .from('prospects')
    .select('id, batch_id, name, categories_text, hours_json, rating, review_count, batches(city, category)')
    .eq('id', prospectId)
    .single()

  if (prospectError || !prospect) {
    throw new Error(`Prospect not found: ${prospectId}`)
  }

  const { data: enrichment, error: enrichmentError } = await supabaseAdmin
    .from('enrichments')
    .select('*')
    .eq('prospect_id', prospectId)
    .single()

  if (enrichmentError || !enrichment) {
    throw new Error(`Enrichment not found for prospect ${prospectId}`)
  }

  const batch: any = prospect.batches
  const city: string = batch?.city ?? 'unknown'
  const category: string = (prospect as any).categories_text ?? batch?.category ?? 'unknown'

  const signals = {
    tech_stack: enrichment.tech_stack_json,
    has_online_booking: enrichment.has_online_booking,
    has_ecommerce: enrichment.has_ecommerce,
    has_chat: enrichment.has_chat,
    has_contact_form: enrichment.has_contact_form,
    is_mobile_friendly: enrichment.is_mobile_friendly,
    ssl_valid: enrichment.ssl_valid,
    fetch_error: enrichment.fetch_error,
  }

  const prompt = analysisPrompt({
    name: prospect.name,
    category,
    city,
    rating: prospect.rating,
    review_count: prospect.review_count,
    hours_json: prospect.hours_json,
    signals_json: signals,
    homepage_text: enrichment.homepage_text_excerpt,
  })

  const result = await callHaikuWithRetry(prompt)

  const { error: insertError } = await supabaseAdmin.from('analyses').insert({
    prospect_id: prospectId,
    pain_points_json: result.pain_points,
    opportunity_score: result.opportunity_score,
    best_angle: result.best_angle,
    analyzed_at: new Date().toISOString(),
  })

  if (insertError) {
    throw new Error(`Failed to save analysis: ${insertError.message}`)
  }

  await supabaseAdmin.from('prospects').update({ status: 'analyzed' }).eq('id', prospectId)
}

async function callHaikuWithRetry(prompt: string): Promise<AnalysisResult> {
  try {
    return await callHaiku(prompt)
  } catch (err) {
    console.warn('Analyze: first attempt failed, retrying once:', err)
    return await callHaiku(prompt)
  }
}

async function callHaiku(prompt: string): Promise<AnalysisResult> {
  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    temperature: 0.3,
    output_config: {
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  } as any)

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const parsed = JSON.parse(text) as AnalysisResult
  validateAnalysisShape(parsed)
  return parsed
}

function validateAnalysisShape(x: AnalysisResult): void {
  if (!Array.isArray(x.pain_points)) throw new Error('pain_points not array')
  if (typeof x.opportunity_score !== 'number') throw new Error('opportunity_score not number')
  if (typeof x.best_angle !== 'string') throw new Error('best_angle not string')
  for (const p of x.pain_points) {
    if (!p.pain || !p.evidence || !p.solution_category || !p.effort || !p.impact) {
      throw new Error('pain_point missing required field')
    }
    if (!SOLUTION_CATEGORIES.includes(p.solution_category)) {
      throw new Error(`invalid solution_category: ${p.solution_category}`)
    }
  }
}
