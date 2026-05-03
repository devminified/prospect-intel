import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as teamsService from '@/lib/services/teams'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    await teamsService.transferOwnership(userId, await readJsonBody(request))
  })
}
