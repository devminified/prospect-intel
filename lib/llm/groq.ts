import { ExternalAPIError } from '@/lib/errors'

if (!process.env.GROQ_API_KEY) {
  throw new Error('Missing env.GROQ_API_KEY')
}

const API_KEY = process.env.GROQ_API_KEY
const PROVIDER = 'Groq'

const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

interface GroqOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Generates a plain-text completion via Groq. Cheaper than Sonnet/Haiku — used
 * for bulk summarization tasks where output quality matters less than cost.
 * Do NOT use for analysis/pitch generation (those stay on Anthropic).
 */
export async function generateGroqText(prompt: string, opts: GroqOptions = {}): Promise<string> {
  const res = await fetch(GROQ_CHAT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const snippet = extractSnippet(body)
    throw new ExternalAPIError(PROVIDER, `chat.completions failed: ${snippet}`, res.status)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    throw new ExternalAPIError(PROVIDER, 'response missing choices[0].message.content')
  }
  return text.trim()
}

function extractSnippet(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return parsed?.error?.message ?? parsed?.error ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200) || 'no body'
  }
}
