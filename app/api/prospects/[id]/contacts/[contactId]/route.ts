import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as contactsService from '@/lib/services/contacts'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; contactId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, contactId } = await context.params
    await contactsService.patch(userId, prospectId, contactId, await readJsonBody(request))
  })
}
