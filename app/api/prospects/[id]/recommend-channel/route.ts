import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as recommendationsService from '@/lib/services/recommendations'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    await recommendationsService.recommend(userId, prospectId)
  })
}
