/**
 * HTML email template for outbound pitches.
 *
 * Design constraints:
 *  - Cold email spam filters punish heavy markup, images, colored banners, and
 *    multi-column layouts. Keep the visual signal subtle and the code minimal.
 *  - No images beyond the 1x1 tracking pixel. No emoji (higher spam risk).
 *  - Inline styles only (most email clients strip <style> blocks).
 *  - Body text is whatever the pitch prompt produced. We add a signature block
 *    and unsubscribe footer — nothing else.
 *  - 560px max-width renders cleanly on desktop and mobile.
 */

export interface EmailSignatureInput {
  sender_name?: string | null
  sender_title?: string | null
  sender_company?: string | null
  calendly_url?: string | null
  website_url?: string | null
}

export interface EmailTemplateInput {
  bodyText: string
  appOrigin: string          // e.g. https://prospect-intel-five.vercel.app
  sentEmailId: string        // uuid — used for tracking pixel
  unsubToken: string         // base64url(contact_id) — used for unsub link
  signature?: EmailSignatureInput
}

function textToHtml(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSignature(sig: EmailSignatureInput): string {
  const name = sig.sender_name?.trim()
  const title = sig.sender_title?.trim()
  const company = sig.sender_company?.trim()
  const calendly = sig.calendly_url?.trim()
  const website = sig.website_url?.trim()

  if (!name && !title && !company && !calendly && !website) return ''

  const titleCompanyLine =
    title && company ? `${escapeHtml(title)} &middot; ${escapeHtml(company)}`
    : title ? escapeHtml(title)
    : company ? escapeHtml(company)
    : ''

  const linksParts: string[] = []
  if (calendly) {
    linksParts.push(
      `<a href="${escapeHtml(calendly)}" style="color:#4338ca;text-decoration:none;font-weight:500;">Book a 15-min call</a>`
    )
  }
  if (website) {
    const displayUrl = website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    linksParts.push(
      `<a href="${escapeHtml(website)}" style="color:#6b7280;text-decoration:none;">${escapeHtml(displayUrl)}</a>`
    )
  }

  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#1f2937;">
  ${name ? `<div style="font-weight:600;color:#111827;">${escapeHtml(name)}</div>` : ''}
  ${titleCompanyLine ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${titleCompanyLine}</div>` : ''}
  ${linksParts.length
    ? `<div style="margin-top:12px;font-size:13px;">${linksParts.join(' &middot; ')}</div>`
    : ''}
</div>`
}

export function buildEmailHtml(input: EmailTemplateInput): string {
  const pixelUrl = `${input.appOrigin}/api/track/open/${input.sentEmailId}`
  const unsubUrl = `${input.appOrigin}/api/unsub?t=${encodeURIComponent(input.unsubToken)}`
  const signature = input.signature ? renderSignature(input.signature) : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
${textToHtml(input.bodyText)}
${signature}
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;outline:none;max-width:1px;max-height:1px;" />
<p style="margin-top:28px;font-size:11px;color:#9ca3af;line-height:1.4;">
  If you'd rather not hear from me, <a href="${unsubUrl}" style="color:#9ca3af;">click here to unsubscribe</a>.
</p>
</div>
</body>
</html>`
}

/** base64url (no padding) — used for unsub tokens. Not meant to be secret, just unguessable. */
export function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

export function fromB64url(s: string): string | null {
  try {
    return Buffer.from(s, 'base64url').toString('utf8')
  } catch {
    return null
  }
}
