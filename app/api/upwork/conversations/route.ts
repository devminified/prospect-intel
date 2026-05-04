import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as conversationsService from '@/lib/services/upwork-conversations'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) =>
    conversationsService.createConversation(userId, await readJsonBody(request))
  )
}
