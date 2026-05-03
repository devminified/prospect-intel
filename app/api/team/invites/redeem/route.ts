import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as teamsService from '@/lib/services/teams'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId, email }) => {
    const result = await teamsService.redeemInvite(userId, email, await readJsonBody(request))
    return { ok: true, team_id: result.team_id }
  })
}
