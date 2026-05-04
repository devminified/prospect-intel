import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as connectsService from '@/lib/services/upwork-connects'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return { entries: await connectsService.listEntries(userId, id) }
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return connectsService.recordEntry(userId, id, await readJsonBody(request))
  })
}
