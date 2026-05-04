import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProfilesService from '@/lib/services/upwork-profiles'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return upworkProfilesService.getProfileDetail(userId, id)
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    await upworkProfilesService.updateProfile(userId, id, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    await upworkProfilesService.archiveProfile(userId, id)
  })
}
