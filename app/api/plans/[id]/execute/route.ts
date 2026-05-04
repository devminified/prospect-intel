import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as plansService from '@/lib/services/plans'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: planId } = await context.params
    const itemId = request.nextUrl.searchParams.get('item_id')

    if (itemId) {
      const { batch_id } = await plansService.executeItem(userId, itemId)
      return { ok: true, batch_id }
    }
    const result = await plansService.execute(userId, planId)
    return { ok: true, ...result }
  })
}
