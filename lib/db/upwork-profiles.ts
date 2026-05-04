import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  UpworkProfile,
  UpworkProfileMember,
  UpworkProfileMemberWithEmail,
  UpworkProfileRole,
  UpworkProfileStatus,
} from '@/lib/types'

/**
 * Typed Supabase queries for the Upwork profile + member tables. No
 * business logic here — service layer owns the rules.
 */

export async function listForTeam(teamId: string): Promise<UpworkProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profiles')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`db.upwork.profiles.listForTeam: ${error.message}`)
  return (data as UpworkProfile[]) ?? []
}

export async function getById(profileId: string): Promise<UpworkProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.profiles.getById: ${error.message}`)
  return (data as UpworkProfile | null) ?? null
}

export async function getBySlug(teamId: string, slug: string): Promise<UpworkProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profiles')
    .select('*')
    .eq('team_id', teamId)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.profiles.getBySlug: ${error.message}`)
  return (data as UpworkProfile | null) ?? null
}

export async function insert(input: {
  team_id: string
  name: string
  slug: string
  description: string | null
  profile_url: string | null
  account_type: 'individual' | 'agency'
  hourly_rate_usd: number | null
}): Promise<UpworkProfile> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profiles')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`db.upwork.profiles.insert: ${error?.message ?? 'no row'}`)
  }
  return data as UpworkProfile
}

export async function update(
  profileId: string,
  patch: Partial<{
    name: string
    description: string | null
    profile_url: string | null
    account_type: 'individual' | 'agency'
    hourly_rate_usd: number | null
    status: UpworkProfileStatus
    connects_balance: number
    archived_at: string | null
  }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_profiles')
    .update(patch)
    .eq('id', profileId)
  if (error) throw new Error(`db.upwork.profiles.update: ${error.message}`)
}

// ─── Members ──────────────────────────────────────────────────────

export async function listMembers(profileId: string): Promise<UpworkProfileMember[]> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profile_members')
    .select('*')
    .eq('profile_id', profileId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(`db.upwork.profileMembers.list: ${error.message}`)
  return (data as UpworkProfileMember[]) ?? []
}

/** Members with auth.users.email folded in. */
export async function listMembersWithEmail(
  profileId: string,
  selfUserId: string
): Promise<UpworkProfileMemberWithEmail[]> {
  const members = await listMembers(profileId)
  const out: UpworkProfileMemberWithEmail[] = []
  for (const m of members) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
    out.push({ ...m, email: u.user?.email ?? null, is_self: m.user_id === selfUserId })
  }
  return out
}

export async function getMembership(
  profileId: string,
  userId: string
): Promise<UpworkProfileMember | null> {
  const { data, error } = await supabaseAdmin
    .from('upwork_profile_members')
    .select('*')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`db.upwork.profileMembers.getMembership: ${error.message}`)
  return (data as UpworkProfileMember | null) ?? null
}

export async function addMember(input: {
  profile_id: string
  user_id: string
  role: UpworkProfileRole
  invited_by: string
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_profile_members')
    .insert(input)
  if (error) throw new Error(`db.upwork.profileMembers.add: ${error.message}`)
}

export async function setMemberRole(
  profileId: string,
  userId: string,
  role: UpworkProfileRole
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_profile_members')
    .update({ role })
    .eq('profile_id', profileId)
    .eq('user_id', userId)
  if (error) throw new Error(`db.upwork.profileMembers.setRole: ${error.message}`)
}

export async function removeMember(profileId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upwork_profile_members')
    .delete()
    .eq('profile_id', profileId)
    .eq('user_id', userId)
  if (error) throw new Error(`db.upwork.profileMembers.remove: ${error.message}`)
}

/** Returns the count of upwork_profile_members rows for a user across the team. */
export async function countMembershipsForUser(
  teamId: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('upwork_profile_members')
    .select('profile_id, upwork_profiles!inner(team_id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('upwork_profiles.team_id', teamId)
  if (error) throw new Error(`db.upwork.profileMembers.countForUser: ${error.message}`)
  return count ?? 0
}
