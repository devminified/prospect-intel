/**
 * Wraps a plain-text pitch body in simple HTML with tracking pixel + unsubscribe footer.
 *
 * Design choices:
 *  - HTML kept minimal. Cold email spam filters hate heavy markup / inline CSS / images.
 *  - No click-tracking (user config). Links are NOT rewritten.
 *  - Tracking pixel is the only image, at the end, 1x1, alt="" so screen readers skip.
 *  - Unsubscribe footer is small, plain-text styled, with List-Unsubscribe-style clarity.
 */

export interface EmailTemplateInput {
  bodyText: string
  appOrigin: string          // e.g. https://prospect-intel-five.vercel.app
  sentEmailId: string        // uuid — used for tracking pixel
  unsubToken: string         // base64url(contact_id) — used for unsub link
  senderName?: string        // optional signature line
}

/** Simple <br> wrapping. Preserves paragraph breaks. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function buildEmailHtml(input: EmailTemplateInput): string {
  const pixelUrl = `${input.appOrigin}/api/track/open/${input.sentEmailId}`
  const unsubUrl = `${input.appOrigin}/api/unsub?t=${encodeURIComponent(input.unsubToken)}`
  const signature = input.senderName
    ? `<p style="margin:24px 0 0;">— ${escapeHtml(input.senderName)}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.55;">
${textToHtml(input.bodyText)}
${signature}
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;outline:none;max-width:1px;max-height:1px;" />
<p style="margin-top: 32px; font-size: 11px; color: #9ca3af;">
  If you'd rather not hear from me, <a href="${unsubUrl}" style="color: #9ca3af;">click here to unsubscribe</a>.
</p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
