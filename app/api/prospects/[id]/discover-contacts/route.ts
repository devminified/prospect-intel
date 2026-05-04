import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as contactsService from '@/lib/services/contacts'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    await contactsService.discover(userId, prospectId)
  })
}
