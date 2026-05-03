import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * email_accounts is partially typed — token + provider fields are only
 * touched by the OAuth callback + cron paths, so we keep the public
 * shape minimal here. Callers needing the full row import the wider
 * shape from lib/email/zoho.ts.
 */
export interface EmailAccountSummary {
  id: string
  user_id: string
  team_id: string
  email: string
  display_name: string | null
}

export async function listForUser(userId: string): Promise<EmailAccountSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('email_accounts')
    .select('id, user_id, team_id, email, display_name')
    .eq('user_id', userId)
  if (error) throw new Error(`db.email.listForUser: ${error.message}`)
  return (data as EmailAccountSummary[] | null) ?? []
}

export async function upsertZohoAccount(input: {
  userId: string
  teamId: string
  email: string
  displayName: string | null
  zohoAccountId: string | null
  apiDomain: string | null
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string
}): Promise<void> {
  const { error } = await supabaseAdmin.from('email_accounts').upsert(
    {
      user_id: input.userId,
      team_id: input.teamId,
      provider: 'zoho',
      email: input.email,
      display_name: input.displayName,
      zoho_account_id: input.zohoAccountId,
      api_domain: input.apiDomain,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: input.tokenExpiresAt,
    },
    { onConflict: 'user_id,email' }
  )
  if (error) throw new Error(`db.email.upsertZohoAccount: ${error.message}`)
}
