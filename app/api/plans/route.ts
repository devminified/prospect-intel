import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as plansService from '@/lib/services/plans'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    const { plan_id } = await plansService.generate(userId)
    return { ok: true, plan_id }
  })
}
