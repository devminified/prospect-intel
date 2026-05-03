import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as teamsService from '@/lib/services/teams'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ user_id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { user_id: targetUserId } = await context.params
    await teamsService.changeMemberRole(userId, targetUserId, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ user_id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { user_id: targetUserId } = await context.params
    await teamsService.removeMember(userId, targetUserId)
  })
}
