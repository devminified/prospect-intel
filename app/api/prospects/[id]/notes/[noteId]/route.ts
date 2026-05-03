import { NextRequest } from 'next/server'
import { readJsonBody, withAuth } from '@/lib/services/route-helper'
import * as notesService from '@/lib/services/notes'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, noteId } = await context.params
    await notesService.edit(userId, prospectId, noteId, await readJsonBody(request))
  })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  return withAuth(request, async ({ userId }) => {
    const { id: prospectId, noteId } = await context.params
    await notesService.remove(userId, prospectId, noteId)
  })
}
