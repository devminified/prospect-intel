/**
 * Tiny RFC 5545 (iCalendar) builder. Produces a single VEVENT inside a
 * VCALENDAR wrapper, suitable for "Add to Calendar" downloads.
 *
 * Used client-side from the prospect detail page so the download doesn't
 * need an auth round-trip — the followup data is already loaded.
 */

export interface IcsEventInput {
  uid: string
  startUtc: Date
  endUtc?: Date
  summary: string
  description?: string
  url?: string
  durationMinutes?: number
}

export function buildIcsEvent(e: IcsEventInput): string {
  const start = e.startUtc
  const end = e.endUtc ?? new Date(start.getTime() + (e.durationMinutes ?? 30) * 60_000)
  const now = new Date()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prospect Intel//Followup//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@prospect-intel`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
  ]
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.url) lines.push(`URL:${e.url}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  // RFC 5545 mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

/**
 * Trigger a browser download of an .ics file with the given content and
 * suggested filename. No-op if document/window is unavailable (SSR).
 */
export function downloadIcs(content: string, filename: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatUtc(d: Date): string {
  // 20260503T140000Z
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function escapeText(s: string): string {
  // RFC 5545 §3.3.11 — escape backslash, comma, semicolon, newline.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n')
}
