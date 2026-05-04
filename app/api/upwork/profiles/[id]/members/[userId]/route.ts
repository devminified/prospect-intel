import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProfilesService from '@/lib/services/upwork-profiles'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id, userId: targetUserId } = await context.params
    await upworkProfilesService.setMemberRole(userId, id, targetUserId, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id, userId: targetUserId } = await context.params
    await upworkProfilesService.removeMember(userId, id, targetUserId)
  })
}
