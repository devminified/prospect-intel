import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as pitchesService from '@/lib/services/pitches'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    await pitchesService.regenerate(userId, prospectId)
  })
}
