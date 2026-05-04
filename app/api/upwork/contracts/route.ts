import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as contractsService from '@/lib/services/upwork-contracts'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) =>
    contractsService.createContract(userId, await readJsonBody(request))
  )
}
