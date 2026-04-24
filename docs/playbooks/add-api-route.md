# Playbook — add a new API route

Skeleton every mutating route should match:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  // 1. AUTH — JWT bearer
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  // 2. OWNERSHIP — chain through batches.user_id (adjust foreign-key path per resource)
  const { data: row, error } = await supabaseAdmin
    .from('prospects').select('id, batches!inner(user_id)').eq('id', id).single()
  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((row as any).batches?.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. WORK — delegate to lib, never inline business logic here
  try {
    const result = await doWork(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
```

**Never skip steps 1–2.** Never put business logic in the route body — delegate to `lib/`.

Read-only `GET` routes still need step 1 (auth) unless they're intentionally public (e.g. login page).
