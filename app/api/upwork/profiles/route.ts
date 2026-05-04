import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as upworkProfilesService from '@/lib/services/upwork-profiles'

export async function GET(request: NextRequest) {
  return withAuth(request, ({ userId }) => upworkProfilesService.listProfiles(userId))
}

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) =>
    upworkProfilesService.createProfile(userId, await readJsonBody(request))
  )
}
