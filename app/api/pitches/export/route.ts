import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const CSV_COLUMNS = ['name', 'website', 'email', 'subject', 'body', 'phone'] as const

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  const batchId = request.nextUrl.searchParams.get('batch_id')
  if (!batchId) {
    return NextResponse.json({ error: 'Missing batch_id' }, { status: 400 })
  }

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('batches')
    .select('id, city, category, user_id')
    .eq('id', batchId)
    .single()
  if (batchError || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }
  if (batch.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('pitches')
    .select('subject, body, edited_body, prospects!inner(name, website, email, phone, batch_id)')
    .eq('status', 'approved')
    .eq('prospects.batch_id', batchId)

  if (rowsError) {
    return NextResponse.json({ error: `Query failed: ${rowsError.message}` }, { status: 500 })
  }

  const csvLines: string[] = [CSV_COLUMNS.join(',')]

  for (const row of (rows ?? []) as any[]) {
    const p = row.prospects ?? {}
    const bodyToSend: string = row.edited_body ?? row.body ?? ''
    const values = [
      p.name ?? '',
      p.website ?? '',
      p.email ?? '',
      row.subject ?? '',
      bodyToSend,
      p.phone ?? '',
    ]
    csvLines.push(values.map(csvEscape).join(','))
  }

  const csv = csvLines.join('\n') + '\n'
  const filename = `prospect-intel-${batch.category}-${batch.city}-${batchId.slice(0, 8)}.csv`
    .replace(/[^a-z0-9.\-]+/gi, '-')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
