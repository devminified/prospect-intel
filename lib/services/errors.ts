/**
 * Domain errors. Services throw these; routes catch them in a single
 * helper and map to HTTP status codes. Keeps services free of any
 * NextResponse / Response coupling.
 */

export class DomainError extends Error {
  /** HTTP status code the route layer should return. */
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = this.constructor.name
    this.status = status
  }
}

export class ValidationError extends DomainError {
  /** Zod-formatted issues, when the source was a Zod parse. */
  issues?: unknown
  constructor(message: string, issues?: unknown) {
    super(message, 400)
    this.issues = issues
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, 401)
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, 403)
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message, 404)
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409)
  }
}

/**
 * Maps an unknown thrown value to { status, body } the route layer can
 * serialize. Logs the original error so we keep visibility on
 * unexpected failures.
 */
export function errorToResponse(err: unknown): { status: number; body: { error: string; issues?: unknown } } {
  if (err instanceof DomainError) {
    const body: { error: string; issues?: unknown } = { error: err.message }
    if (err instanceof ValidationError && err.issues) body.issues = err.issues
    return { status: err.status, body }
  }
  const message = err instanceof Error ? err.message : String(err)
  console.error('[unexpected]', err)
  return { status: 500, body: { error: message || 'Internal server error' } }
}
