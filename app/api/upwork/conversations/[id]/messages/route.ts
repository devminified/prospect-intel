import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as conversationsService from '@/lib/services/upwork-conversations'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return conversationsService.appendMessage(userId, id, await readJsonBody(request))
  })
}
