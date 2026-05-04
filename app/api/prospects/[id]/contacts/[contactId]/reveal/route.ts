import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as contactsService from '@/lib/services/contacts'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; contactId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, contactId } = await context.params
    const result = await contactsService.revealEmail(userId, prospectId, contactId)
    return { ok: true, email: result.email }
  })
}
