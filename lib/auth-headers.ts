import { supabase } from '@/lib/supabase/client'

/**
 * Returns the Authorization header for client-side fetch calls into our
 * own /api/* routes. Routes verify the JWT via supabaseAdmin.auth.getUser.
 *
 * Returns an empty Bearer string if the session has expired — the route
 * will reject with 401, surfacing as a toast via the global error handler.
 */
export async function authHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}
