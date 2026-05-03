import { supabaseAdmin } from '@/lib/supabase/server'
import { UnauthorizedError } from './errors'

/**
 * Validates a Bearer token from a request and returns the user id.
 * Throws UnauthorizedError if the header is missing/malformed or the
 * token doesn't resolve. Used by every API route at the top of its
 * handler — the only place auth lives once routes are refactored in M56.
 */
export async function requireUserFromHeader(
  authHeader: string | null
): Promise<{ userId: string; email: string | null }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError()
  }
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    throw new UnauthorizedError()
  }
  return { userId: data.user.id, email: data.user.email ?? null }
}
