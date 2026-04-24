import { ExternalAPIError } from '../errors'

const PROVIDER = 'Zoho'
const ACCOUNTS_BASE = process.env.ZOHO_ACCOUNTS_BASE ?? 'https://accounts.zoho.com'
const DEFAULT_API_DOMAIN = 'https://mail.zoho.com'

const SCOPES = [
  'ZohoMail.messages.CREATE',
  'ZohoMail.messages.READ',
  'ZohoMail.accounts.READ',
].join(',')

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new ExternalAPIError(PROVIDER, `Missing env.${name}`, 500)
  return v
}

export function getAuthUrl(state: string): string {
  const clientId = requireEnv('ZOHO_CLIENT_ID')
  const redirectUri = requireEnv('ZOHO_REDIRECT_URI')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${ACCOUNTS_BASE}/oauth/v2/auth?${params.toString()}`
}

export interface ZohoTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
  api_domain: string
  token_type: string
}

export async function exchangeCode(code: string): Promise<ZohoTokenResponse> {
  const clientId = requireEnv('ZOHO_CLIENT_ID')
  const clientSecret = requireEnv('ZOHO_CLIENT_SECRET')
  const redirectUri = requireEnv('ZOHO_REDIRECT_URI')

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(`${ACCOUNTS_BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new ExternalAPIError(PROVIDER, `token exchange failed: ${JSON.stringify(data ?? {})}`, res.status)
  }
  return data as ZohoTokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<ZohoTokenResponse> {
  const clientId = requireEnv('ZOHO_CLIENT_ID')
  const clientSecret = requireEnv('ZOHO_CLIENT_SECRET')

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  const res = await fetch(`${ACCOUNTS_BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new ExternalAPIError(PROVIDER, `token refresh failed: ${JSON.stringify(data ?? {})}`, res.status)
  }
  return data as ZohoTokenResponse
}

export interface ZohoAccountInfo {
  accountId: string
  primaryEmailAddress: string
  displayName?: string | null
}

export async function getAccountInfo(accessToken: string, apiDomain: string): Promise<ZohoAccountInfo> {
  const base = apiDomain || DEFAULT_API_DOMAIN
  const res = await fetch(`${base}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ExternalAPIError(PROVIDER, `accounts lookup failed: ${JSON.stringify(data ?? {})}`, res.status)
  }
  const first = data?.data?.[0]
  if (!first?.accountId) {
    throw new ExternalAPIError(PROVIDER, 'no account found in Zoho response', 500)
  }
  return {
    accountId: String(first.accountId),
    primaryEmailAddress: String(first.primaryEmailAddress ?? ''),
    displayName: first.displayName ?? null,
  }
}

export interface SendMessageInput {
  fromAddress: string
  toAddress: string
  subject: string
  htmlContent: string
}

export interface SendMessageResult {
  messageId: string | null
  threadId: string | null
}

export async function sendMessage(
  accessToken: string,
  apiDomain: string,
  accountId: string,
  input: SendMessageInput
): Promise<SendMessageResult> {
  const base = apiDomain || DEFAULT_API_DOMAIN
  const res = await fetch(`${base}/api/accounts/${accountId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      content: input.htmlContent,
      mailFormat: 'html',
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.status?.code >= 400) {
    const msg = data?.data?.errorMessage ?? data?.message ?? JSON.stringify(data ?? {})
    throw new ExternalAPIError(PROVIDER, `send failed: ${msg}`, res.status)
  }
  return {
    messageId: data?.data?.messageId ?? null,
    threadId: data?.data?.threadId ?? null,
  }
}
