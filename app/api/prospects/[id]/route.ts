import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as prospectsService from '@/lib/services/prospects'
import * as pitchesService from '@/lib/services/pitches'

/**
 * Bundle PATCH — applies whichever of these the body contains:
 *   - prospect_status            → prospectsService.setStatus
 *   - outreach_status            → prospectsService.setOutreachStatus
 *   - deal_stage                 → prospectsService.setDealStage
 *   - assigned_to                → prospectsService.assign
 *   - mark_viewed: true          → prospectsService.markViewed
 *   - pitch_edited_body / pitch_status → pitchesService.update
 *
 * Each branch runs its own ownership + role check via the service.
 * Failures short-circuit the rest of the request — partial application
 * isn't supported deliberately, since the client only ever sends one
 * field at a time today.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    const body = (await readJsonBody(request)) as Record<string, unknown>

    if ('assigned_to' in body) {
      await prospectsService.assign(userId, prospectId, body.assigned_to)
    }
    if ('outreach_status' in body) {
      await prospectsService.setOutreachStatus(userId, prospectId, body.outreach_status)
    }
    if ('deal_stage' in body) {
      await prospectsService.setDealStage(userId, prospectId, body.deal_stage)
    }
    if (body.mark_viewed === true) {
      await prospectsService.markViewed(userId, prospectId)
    }
    if ('prospect_status' in body) {
      await prospectsService.setStatus(userId, prospectId, body.prospect_status)
    }
    if ('pitch_edited_body' in body || 'pitch_status' in body) {
      await pitchesService.update(userId, prospectId, {
        edited_body: body.pitch_edited_body as string | undefined,
        status: body.pitch_status as string | undefined,
      })
    }
  })
}
