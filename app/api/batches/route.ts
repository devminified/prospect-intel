import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as batchesService from '@/lib/services/batches'

export async function POST(request: NextRequest) {
  return withAuth(request, async ({ userId }) => {
    return batchesService.create(userId, await readJsonBody(request))
  })
}
