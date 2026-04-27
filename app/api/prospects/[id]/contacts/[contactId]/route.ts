import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Patch editable fields on a contact row. Currently supports linkedin_url
 * — used to manually attach a LinkedIn profile when Apollo didn't return one,
 * which makes Lusha's direct-line matcher work via the most reliable path.
 *
 * Pass linkedin_url: null (or empty string) to clear it.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id: prospectId, contactId } = await context.params

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  const { data: contact, error: cErr } = await supabaseAdmin
    .from('contacts')
    .select('id, prospect_id, prospects!inner(batches!inner(user_id))')
    .eq('id', contactId)
    .single()
  if (cErr || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }
  if ((contact as any).prospect_id !== prospectId) {
    return NextResponse.json({ error: 'Contact does not belong to this prospect' }, { status: 400 })
  }
  if ((contact as any).prospects?.batches?.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if ('linkedin_url' in body) {
    const raw = (body as any).linkedin_url
    if (raw === null || raw === '') {
      update.linkedin_url = null
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!/linkedin\.com\/(in|pub)\//i.test(trimmed)) {
        return NextResponse.json(
          { error: 'Not a valid LinkedIn profile URL — must contain linkedin.com/in/' },
          { status: 400 }
        )
      }
      update.linkedin_url = trimmed
    } else {
      return NextResponse.json({ error: 'linkedin_url must be a string or null' }, { status: 400 })
    }
  }

  if ('first_name' in body) {
    const raw = (body as any).first_name
    if (raw === null || raw === '') {
      update.first_name = null
    } else if (typeof raw === 'string') {
      update.first_name = raw.trim() || null
    }
  }
  if ('last_name' in body) {
    const raw = (body as any).last_name
    if (raw === null || raw === '') {
      update.last_name = null
    } else if (typeof raw === 'string') {
      update.last_name = raw.trim() || null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('contacts')
    .update(update)
    .eq('id', contactId)
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
