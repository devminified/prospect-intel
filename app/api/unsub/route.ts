import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fromB64url } from '@/lib/email/templates'

/**
 * Public unsubscribe endpoint. Token is base64url(contact_id).
 * On GET, show a simple confirmation page (HTML). On POST, write to email_unsubs
 * and confirm. We accept GET+auto-confirm too since a lot of mail clients fetch
 * the target URL on click without allowing a POST.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')
  if (!token) return renderPage('Missing token.', 400)
  const contactId = fromB64url(token)
  if (!contactId) return renderPage('Invalid token.', 400)

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, email, full_name')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact?.email) return renderPage('We could not find that contact.', 404)

  const email = contact.email.toLowerCase()
  const { error } = await supabaseAdmin
    .from('email_unsubs')
    .upsert({ contact_email: email, reason: 'user_clicked_unsub' }, { onConflict: 'contact_email' })

  if (error) {
    return renderPage(`Something went wrong: ${error.message}`, 500)
  }

  return renderPage(
    `You've been unsubscribed. ${contact.email} will not receive further outreach from us.`,
    200
  )
}

function renderPage(message: string, status: number) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Unsubscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; max-width: 440px; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 12px; color: #111827; }
    p { font-size: 14px; color: #4b5563; line-height: 1.55; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Unsubscribe</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
