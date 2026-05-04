import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkJobsService from '@/lib/services/upwork-jobs'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) => {
    const status = request.nextUrl.searchParams.get('status')
    return upworkJobsService.listJobs(userId, { status })
  })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) =>
    upworkJobsService.createJob(userId, await readJsonBody(request))
  )
}
