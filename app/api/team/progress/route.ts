import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as teamProgressService from '@/lib/services/team-progress'

export async function GET(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    const days = request.nextUrl.searchParams.get('days')
    return teamProgressService.getTeamProgress(userId, days)
  })
}
