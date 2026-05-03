'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authHeaders } from '@/lib/auth-headers'

type Status = 'loading' | 'need_signin' | 'ready' | 'redeeming' | 'success' | 'error'

export default function InviteRedeemPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState<string>('')
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    void check()
  }, [token])

  async function check() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStatus('need_signin')
      return
    }
    setEmail(user.email ?? null)
    setStatus('ready')
  }

  async function redeem() {
    setStatus('redeeming')
    setMessage('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch('/api/team/invites/redeem', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'redeem failed')
      }
      setStatus('success')
      // Brief delay so the user sees the success state, then redirect.
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (e: any) {
      setStatus('error')
      setMessage(e.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Team invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <p className="text-sm text-muted-foreground">Checking your invite…</p>
          )}

          {status === 'need_signin' && (
            <>
              <p className="text-sm">
                Sign in to the email address this invite was sent to, then come back to this page.
              </p>
              <Button onClick={() => router.push(`/login?next=/invite/${token}`)} className="w-full">
                Sign in
              </Button>
            </>
          )}

          {status === 'ready' && (
            <>
              <p className="text-sm">
                You're signed in as <span className="font-medium">{email ?? '(unknown)'}</span>.
                Click below to accept the invite and join the team.
              </p>
              <Button onClick={redeem} className="w-full">
                Accept invite
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Wrong account? <button onClick={() => supabase.auth.signOut().then(() => router.refresh())} className="underline">Sign out</button> and use the email this invite was sent to.
              </p>
            </>
          )}

          {status === 'redeeming' && (
            <p className="text-sm text-muted-foreground">Joining team…</p>
          )}

          {status === 'success' && (
            <div className="text-sm text-emerald-700">
              Joined! Redirecting to your dashboard…
            </div>
          )}

          {status === 'error' && (
            <>
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {message}
              </div>
              <Button variant="outline" onClick={check} className="w-full">
                Try again
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
