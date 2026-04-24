import { NextRequest, NextResponse } from 'next/server'
import { recommendChannel } from '@/lib/recommend'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prospectId = request.nextUrl.searchParams.get('prospect_id')
  if (!prospectId) {
    return NextResponse.json({ error: 'Missing prospect_id' }, { status: 400 })
  }

  try {
    await recommendChannel(prospectId)
    return NextResponse.json({ ok: true, prospect_id: prospectId })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    )
  }
}
