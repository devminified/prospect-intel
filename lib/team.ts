import { supabaseAdmin } from './supabase/server'

/**
 * Sentinel returned when a user has no team membership. Callers in the
 * service layer translate this into a `ForbiddenError`; cron callers
 * skip the user; the auth layout redirects to /no-team.
 *
 * The app does NOT auto-provision teams. The only paths into a team are
 * (1) being the bootstrapped owner of the Devminified team, or (2)
 * redeeming an invite via /invite/[token]. Self-signup at /signup is
 * gated behind a valid invite token; without a token the form rejects.
 */
export const NO_TEAM = Symbol('NO_TEAM')
export type ResolvedTeam = string | typeof NO_TEAM

export async function resolveUserTeamId(userId: string): Promise<ResolvedTeam> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id, role, joined_at')
    .eq('user_id', userId)
    .order('role', { ascending: false }) // 'owner' > 'manager' alphabetically; close enough as a tiebreaker
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`team lookup failed: ${error.message}`)
  }
  return data?.team_id ?? NO_TEAM
}
