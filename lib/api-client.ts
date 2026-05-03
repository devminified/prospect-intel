import { authHeaders } from './auth-headers'

/**
 * Centralized client-side fetch wrapper. Every TanStack Query function
 * goes through one of these — no more hand-rolled `fetch + parse + throw`
 * blocks scattered across query modules.
 *
 * Adds the Bearer token automatically (via authHeaders), serializes
 * JSON bodies, parses JSON responses, and throws ApiError with the
 * server's `{ error }` message + HTTP status on failure.
 *
 * Stays on native fetch — no axios. The error shape is small and the
 * surface area we need is tiny; a dep would just be tax.
 */

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status)
  }
  // Some routes return 200 with no body; handle that gracefully.
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  return parse<T>(await fetch(path, { headers }))
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = body == null ? await authHeaders() : { 'Content-Type': 'application/json', ...(await authHeaders()) }
  return parse<T>(
    await fetch(path, {
      method: 'POST',
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    })
  )
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
  return parse<T>(
    await fetch(path, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
  )
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  return parse<T>(await fetch(path, { method: 'DELETE', headers }))
}
