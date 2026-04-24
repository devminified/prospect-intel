import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { exchangeCode, getAccountInfo } from '@/lib/email/zoho'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return redirectWithError(request, `Zoho denied: ${err}`)
  }
  if (!code || !state) {
    return redirectWithError(request, 'Missing code or state from Zoho')
  }

  const cookieState = request.cookies.get('zoho_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return redirectWithError(request, 'OAuth state mismatch — please retry')
  }

  const userId = state.split('.')[0]
  if (!userId) {
    return redirectWithError(request, 'Invalid state format')
  }

  try {
    const tokens = await exchangeCode(code)
    const account = await getAccountInfo(tokens.access_token, tokens.api_domain)

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()

    const { error: upsertErr } = await supabaseAdmin
      .from('email_accounts')
      .upsert(
        {
          user_id: userId,
          provider: 'zoho',
          email: account.primaryEmailAddress,
          display_name: account.displayName,
          zoho_account_id: account.accountId,
          api_domain: tokens.api_domain,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expires_at: expiresAt,
        },
        { onConflict: 'user_id,email' }
      )

    if (upsertErr) {
      return redirectWithError(request, `Save failed: ${upsertErr.message}`)
    }

    const redirect = NextResponse.redirect(new URL('/settings/email?connected=1', request.url))
    redirect.cookies.delete('zoho_oauth_state')
    return redirect
  } catch (e: any) {
    return redirectWithError(request, e?.message ?? 'Zoho connect failed')
  }
}

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL('/settings/email', request.url)
  url.searchParams.set('error', message.slice(0, 300))
  return NextResponse.redirect(url)
}
