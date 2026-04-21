import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { pitchPrompt } from '@/lib/prompts'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing env.ANTHROPIC_API_KEY')
}

const SONNET_MODEL = 'claude-sonnet-4-6'

interface PitchResult {
  subject: string
  body: string
}

const PITCH_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
  additionalProperties: false,
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generatePitch(prospectId: string): Promise<void> {
  const { data: prospect, error: prospectError } = await supabaseAdmin
    .from('prospects')
    .select('id, name, categories_text, batches(city, category)')
    .eq('id', prospectId)
    .single()

  if (prospectError || !prospect) {
    throw new Error(`Prospect not found: ${prospectId}`)
  }

  const { data: analysis, error: analysisError } = await supabaseAdmin
    .from('analyses')
    .select('pain_points_json, best_angle')
    .eq('prospect_id', prospectId)
    .single()

  if (analysisError || !analysis) {
    throw new Error(`Analysis not found for prospect ${prospectId}`)
  }

  const painPoints = (analysis.pain_points_json ?? []) as Array<{
    pain: string
    evidence: string
    solution_category: string
  }>

  if (painPoints.length === 0) {
    throw new Error(`No pain points to pitch for prospect ${prospectId}`)
  }

  const leadPain = painPoints[0]
  const batch: any = prospect.batches
  const city: string = batch?.city ?? 'unknown'
  const category: string = (prospect as any).categories_text ?? batch?.category ?? 'business'

  const prompt = pitchPrompt({
    name: prospect.name,
    category,
    city,
    best_angle: analysis.best_angle ?? leadPain.pain,
    evidence: leadPain.evidence,
    solution_category: leadPain.solution_category,
  })

  const pitch = await callSonnet(prompt)

  warnIfOverBudget(prospect.name, pitch)

  const { error: insertError } = await supabaseAdmin.from('pitches').insert({
    prospect_id: prospectId,
    subject: pitch.subject,
    body: pitch.body,
    status: 'draft',
  })

  if (insertError) {
    throw new Error(`Failed to save pitch: ${insertError.message}`)
  }

  await supabaseAdmin.from('prospects').update({ status: 'ready' }).eq('id', prospectId)
}

async function callSonnet(prompt: string): Promise<PitchResult> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    temperature: 0.7,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: PITCH_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  } as any)

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const parsed = JSON.parse(text) as PitchResult
  if (!parsed.subject || !parsed.body) {
    throw new Error('pitch missing subject or body')
  }
  return parsed
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function warnIfOverBudget(name: string, pitch: PitchResult): void {
  const subjectWords = wordCount(pitch.subject)
  const bodyWords = wordCount(pitch.body)
  if (subjectWords > 6) {
    console.warn(`Pitch for ${name}: subject has ${subjectWords} words (>6)`)
  }
  if (bodyWords > 80) {
    console.warn(`Pitch for ${name}: body has ${bodyWords} words (>80)`)
  }
}
