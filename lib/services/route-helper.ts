import { NextRequest, NextResponse } from 'next/server'
import { requireUserFromHeader } from './auth'
import { errorToResponse } from './errors'

export interface AuthContext {
  userId: string
  email: string | null
}

/**
 * Wraps an authed route handler. Pulls the Bearer token, calls the
 * inner function with { userId, email }, JSON-serializes whatever it
 * returns, and maps any thrown DomainError to its HTTP status.
 *
 * Inner function returns:
 *   - undefined / void   → 200 with `{ ok: true }`
 *   - any other value    → 200 with that value as the body
 *
 * Examples in routes:
 *
 *   export const POST = (req: NextRequest, ctx: { params: ... }) =>
 *     withAuth(req, async ({ userId }) => {
 *       const { id } = await ctx.params
 *       return await notesService.add(userId, id, await req.json())
 *     })
 */
export async function withAuth(
  request: NextRequest,
  fn: (ctx: AuthContext) => Promise<unknown>
): Promise<NextResponse> {
  try {
    const ctx = await requireUserFromHeader(request.headers.get('authorization'))
    const result = await fn(ctx)
    return NextResponse.json(result === undefined ? { ok: true } : result)
  } catch (err) {
    const { status, body } = errorToResponse(err)
    return NextResponse.json(body, { status })
  }
}

/** Safely parse a JSON body — returns `{}` on missing/malformed body. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
