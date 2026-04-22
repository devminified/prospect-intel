/**
 * ExternalAPIError tags the failing provider so downstream error handling
 * (cron `last_error`, batch create responses, UI surfaces) can show the
 * user exactly which integration failed.
 *
 * Usage: throw new ExternalAPIError('Google Places', 'API key invalid', 403)
 * Message format stored / rendered: "[Google Places] API key invalid (HTTP 403)"
 */
export class ExternalAPIError extends Error {
  readonly provider: string
  readonly status?: number

  constructor(provider: string, message: string, status?: number) {
    const statusPart = status != null ? ` (HTTP ${status})` : ''
    super(`[${provider}] ${message}${statusPart}`)
    this.name = 'ExternalAPIError'
    this.provider = provider
    this.status = status
  }
}

/**
 * Safely extract an error message without leaking stack traces or large objects.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'unknown error'
}
