import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { pollReplies } from '@/lib/email/replies'

/**
 * Runs every 10 minutes via vercel.json. Polls each connected email account's
 * inbox for replies to our sent emails. Idempotent — dedupes by raw_message_id.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('email_accounts')
    .select('id')
    .eq('provider', 'zoho')
  if (error) {
    return NextResponse.json({ error: `Account lookup failed: ${error.message}` }, { status: 500 })
  }

  const results: any[] = []
  for (const a of (accounts ?? []) as any[]) {
    try {
      const r = await pollReplies(a.id)
      results.push(r)
    } catch (e: any) {
      results.push({ account_id: a.id, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, accounts: results })
}
