import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('/Users/cto/Documents/GitHub/prospect-intel/.env.local', 'utf8')
  .split('\n').filter(Boolean)
  .reduce((m, l) => { const i = l.indexOf('='); if (i>0) m[l.slice(0,i).trim()] = l.slice(i+1).trim().replace(/^"|"$/g,''); return m }, {})

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const email = 'muhammadmahad@devminified.com'
const password = process.argv[2] ?? 'TestRun!2026'

const { data, error } = await sb.auth.admin.createUser({
  email, password, email_confirm: true,
})
if (error) {
  // If user already exists, try a password reset instead
  console.error('createUser:', error.message)
  if (/already (registered|been registered)/i.test(error.message)) {
    const { data: list } = await sb.auth.admin.listUsers()
    const existing = list.users.find(u => u.email === email)
    if (existing) {
      const { error: upErr } = await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      if (upErr) { console.error('updateUserById:', upErr.message); process.exit(1) }
      console.log('UPDATED existing user', existing.id, '→ password reset')
    } else {
      process.exit(1)
    }
  } else {
    process.exit(1)
  }
} else {
  console.log('CREATED', data.user.id)
}
console.log('email:', email)
console.log('password:', password)
