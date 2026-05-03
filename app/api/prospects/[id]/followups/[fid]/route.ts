import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as followupsService from '@/lib/services/followups'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; fid: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, fid } = await context.params
    await followupsService.update(userId, prospectId, fid, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; fid: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, fid } = await context.params
    await followupsService.remove(userId, prospectId, fid)
  })
}
