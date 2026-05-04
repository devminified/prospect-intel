import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkJobsService from '@/lib/services/upwork-jobs'
import * as upworkProposalsService from '@/lib/services/upwork-proposals'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    const job = await upworkJobsService.getJob(userId, id)
    const proposals = await upworkProposalsService.listForJobScoped(userId, id)
    return { job, proposals }
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    await upworkJobsService.updateJob(userId, id, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id } = await context.params
    await upworkJobsService.deleteJob(userId, id)
  })
}
