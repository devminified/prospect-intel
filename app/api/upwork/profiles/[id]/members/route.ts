import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProfilesService from '@/lib/services/upwork-profiles'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return { addable: await upworkProfilesService.listAddableTeamMembers(userId, id) }
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    await upworkProfilesService.addMember(userId, id, await readJsonBody(request))
  })
}
