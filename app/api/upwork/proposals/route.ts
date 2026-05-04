import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProposalsService from '@/lib/services/upwork-proposals'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) =>
    upworkProposalsService.createProposal(userId, await readJsonBody(request))
  )
}
