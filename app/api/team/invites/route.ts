import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as teamsService from '@/lib/services/teams'
import { ValidationError } from '@/lib/services/errors'

export async function POST(request: NextRequest) {
  return withAuth(request, ({ userId }) =>
    readJsonBody(request).then((body) => teamsService.createInvite(userId, body))
  )
}

export async function DELETE(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    const inviteId = request.nextUrl.searchParams.get('id')
    if (!inviteId) throw new ValidationError('Missing id')
    await teamsService.revokeInvite(userId, inviteId)
  })
}
