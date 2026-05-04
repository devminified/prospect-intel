import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as upworkProfilesService from '@/lib/services/upwork-profiles'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) => upworkProfilesService.getMyAccess(userId))
}
