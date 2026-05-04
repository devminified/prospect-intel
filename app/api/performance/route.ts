import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as performanceService from '@/lib/services/performance'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) =>
    performanceService.getRecent(userId, request.nextUrl.searchParams.get('days'))
  )
}
