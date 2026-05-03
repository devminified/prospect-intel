import { supabaseAdmin } from './supabase/server'

/**
 * Resolves the active team_id for a given user.
 *
 * For the M45 single-team-per-user world this returns the one team the
 * user belongs to. If they belong to multiple, the owner team is
 * preferred; otherwise the first by joined_at.
 *
 * If the user has no team yet — typical for a brand-new auth signup
 * before the M47 invite flow has provisioned them — we auto-create a
 * personal "My Team" and make them the owner. This keeps the app
 * usable for fresh sign-ins and is harmless: solo users can rename
 * their team in the M46 settings UI, and invited users will instead
 * land via the invite redemption path that adds them to an existing
 * team before any insert runs.
 */
export async function resolveUserTeamId(userId: string): Promise<string> {
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
  if (data?.team_id) return data.team_id

  return await createPersonalTeam(userId)
}

/**
 * Confirms the user is a member of the team that owns the prospect.
 * Returns the team_id + the user's role on success, or null if the
 * prospect doesn't exist / belongs to a different team / user isn't a
 * member. Used by API routes that bypass RLS via supabaseAdmin and
 * still need to enforce team-scoped access.
 */
export async function getProspectTeamAccess(
  userId: string,
  prospectId: string
): Promise<{ teamId: string; role: string } | null> {
  const { data: prospect } = await supabaseAdmin
    .from('prospects')
    .select('batches!inner(team_id)')
    .eq('id', prospectId)
    .maybeSingle()
  const teamId = (prospect as any)?.batches?.team_id
  if (!teamId) return null

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!membership) return null

  return { teamId, role: membership.role }
}

async function createPersonalTeam(userId: string): Promise<string> {
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .insert({ name: 'My Team' })
    .select('id')
    .single()
  if (teamErr || !team) {
    throw new Error(`create team failed: ${teamErr?.message ?? 'unknown'}`)
  }
  const { error: memberErr } = await supabaseAdmin
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, role: 'owner' })
  if (memberErr) {
    throw new Error(`team member insert failed: ${memberErr.message}`)
  }
  return team.id
}
