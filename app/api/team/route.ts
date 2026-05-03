import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as teamsService from '@/lib/services/teams'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) => teamsService.getCurrentTeamView(userId))
}

export async function PATCH(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    await teamsService.rename(userId, await readJsonBody(request))
  })
}
