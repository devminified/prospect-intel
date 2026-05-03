import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as notesService from '@/lib/services/notes'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    const notes = await notesService.listForProspect(userId, prospectId)
    return { notes }
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId } = await context.params
    const note = await notesService.add(userId, prospectId, await readJsonBody(request))
    return { note }
  })
}
