'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sign-up is invite-only. Prospect Intel runs as a single-tenant app
 * for the Devminified team plus invited collaborators — no public
 * sign-up. Without a valid `?token=...` we render a friendly rejection.
 *
 * With a token we (a) validate the invite via the public check endpoint,
 * (b) pre-fill the email so the user signs up with the address the
 * invite was sent to, and (c) point Supabase's email-confirm redirect
 * back to /invite/[token] so the redemption happens automatically once
 * the user clicks the magic link in their inbox.
 */
type InviteState =
  | { status: 'loading' }
  | { status: 'no_token' }
  | { status: 'invalid'; reason: string }
  | { status: 'ready'; email: string; role: string; expires_at: string }

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SignupInner />
    </Suspense>
  )
}

function SignupInner() {
  const sp = useSearchParams()
  const token = sp?.get('token') ?? null

  const [invite, setInvite] = useState<InviteState>({ status: 'loading' })
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setInvite({ status: 'no_token' })
      return
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/team/invites/check?token=${encodeURIComponent(token)}`
        )
        const json = await res.json()
        if (!res.ok) {
          setInvite({ status: 'invalid', reason: json.error ?? 'Invalid invite' })
          return
        }
        setInvite({
          status: 'ready',
          email: json.email,
          role: json.role,
          expires_at: json.expires_at,
        })
      } catch (e: any) {
        setInvite({ status: 'invalid', reason: e.message ?? 'Network error' })
      }
    })()
  }, [token])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invite.status !== 'ready') return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      // The email-confirm link will land them at /invite/[token] which,
      // now that they have a session, runs the actual redemption.
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/invite/${token}`
          : undefined
      const { error: signErr } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      })
      if (signErr) throw signErr
      setMessage(
        'Check your email for the confirmation link. Once you confirm, you will be redirected back here to join the team.'
      )
    } catch (e: any) {
      setError(e.message ?? 'Sign-up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {invite.status === 'ready' ? 'Accept your invite' : 'Sign up'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invite.status === 'loading' && (
            <p className="text-sm text-muted-foreground text-center">
              Checking your invite…
            </p>
          )}

          {invite.status === 'no_token' && <NoInviteCopy />}

          {invite.status === 'invalid' && (
            <div className="space-y-3">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {invite.reason}
              </div>
              <p className="text-sm text-muted-foreground">
                If you think this is wrong, ask the person who invited you to
                send a fresh link, or sign in if you already have an account.
              </p>
              <Link href="/login" className="block text-center text-primary hover:underline text-sm">
                Sign in instead
              </Link>
            </div>
          )}

          {invite.status === 'ready' && (
            <form className="space-y-4" onSubmit={handleSignup}>
              <p className="text-sm text-muted-foreground">
                You've been invited as <span className="font-medium text-foreground">{labelForRole(invite.role)}</span>.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={invite.email}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Locked to the address the invite was sent to.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password (min 6 characters)</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              {message && (
                <p className="text-sm text-green-700 text-center">{message}</p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating account…' : 'Create account'}
              </Button>

              <p className="text-center text-sm">
                <Link href="/login" className="text-primary hover:underline">
                  Already have an account? Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NoInviteCopy() {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Prospect Intel is invite-only.
      </p>
      <p className="text-sm text-muted-foreground">
        If you've been invited, open the link in your email. The "Sign up"
        page is only reachable from a valid invite — there is no public
        registration.
      </p>
      <Link
        href="/login"
        className="block text-center text-primary hover:underline text-sm pt-2"
      >
        Already have an account? Sign in
      </Link>
    </div>
  )
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  lead_gen: 'Lead generator',
  cold_caller: 'Cold caller',
  closer: 'Closer',
}
function labelForRole(role: string): string {
  return ROLE_LABELS[role] ?? role
}
