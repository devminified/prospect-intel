import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/services/route-helper'
import * as contractsService from '@/lib/services/upwork-contracts'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    const status = request.nextUrl.searchParams.get('status')
    return contractsService.listForProfile(userId, id, { status })
  })
}
