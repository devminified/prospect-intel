import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as analyticsService from '@/lib/services/upwork-analytics'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) => {
    const days = request.nextUrl.searchParams.get('days')
    return analyticsService.getBidderLeaderboard(userId, days)
  })
}
