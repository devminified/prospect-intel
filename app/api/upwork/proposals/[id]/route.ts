import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProposalsService from '@/lib/services/upwork-proposals'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    return upworkProposalsService.getProposal(userId, id)
  })
}

/**
 * Bundle PATCH — applies whichever the body contains:
 *   - status   → changeStatus
 *   - notes    → updateNotes
 *   - send: true → promote drafted → sent + record Connects spend
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    const body = (await readJsonBody(request)) as Record<string, unknown>
    if (body.send === true) {
      await upworkProposalsService.sendDraft(userId, id)
    }
    if ('status' in body) {
      await upworkProposalsService.changeStatus(userId, id, { status: body.status })
    }
    if (typeof body.notes === 'string') {
      await upworkProposalsService.updateNotes(userId, id, body.notes)
    }
  })
}
