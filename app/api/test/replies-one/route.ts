import { NextRequest, NextResponse } from 'next/server'
import { pollReplies } from '@/lib/email/replies'

/**
 * CRON_SECRET-gated. Drive a single account's reply poll manually.
 * Usage: GET /api/test/replies-one?account_id=<uuid> with Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json({ error: 'Missing account_id' }, { status: 400 })
  }

  try {
    const result = await pollReplies(accountId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
