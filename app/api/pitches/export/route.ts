import { NextRequest, NextResponse } from 'next/server'
import { requireUserFromHeader } from '@/lib/services/auth'
import { errorToResponse } from '@/lib/services/errors'
import * as pitchesService from '@/lib/services/pitches'

/**
 * Returns text/csv with attachment Content-Disposition. Doesn't fit
 * the JSON withAuth wrapper, so re-implements auth + error mapping
 * inline using the same building blocks.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireUserFromHeader(request.headers.get('authorization'))
    const batchId = request.nextUrl.searchParams.get('batch_id') ?? ''
    const { filename, csv } = await pitchesService.exportApprovedCsv(userId, batchId)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const { status, body } = errorToResponse(err)
    return NextResponse.json(body, { status })
  }
}
