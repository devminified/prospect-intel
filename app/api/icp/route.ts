import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as icpService from '@/lib/services/icp'

export async function GET(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    const icp = await icpService.get(userId)
    return { icp }
  })
}

export async function PATCH(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    const icp = await icpService.save(userId, await readJsonBody(request))
    return { icp }
  })
}
