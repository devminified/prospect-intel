import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as pitchesService from '@/lib/services/pitches'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: pitchId } = await context.params
    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, '')
    return pitchesService.send(userId, pitchId, appOrigin)
  })
}
