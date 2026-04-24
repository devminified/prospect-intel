'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'

interface EmailAccount {
  id: string
  email: string
  display_name: string | null
  daily_send_cap: number
  sends_today: number
  sends_reset_at: string | null
  last_send_at: string | null
  created_at: string
}

export default function EmailSettingsPage() {
  const [account, setAccount] = useState<EmailAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [cap, setCap] = useState(20)
  const [userId, setUserId] = useState<string | null>(null)
  const params = useSearchParams()

  useEffect(() => {
    const connected = params.get('connected')
    const err = params.get('error')
    if (connected) toast.success('Zoho connected.')
    if (err) toast.error(err)
    load()
  }, [params])

  async function load() {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    setUserId(userData?.user?.id ?? null)

    const { data } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('provider', 'zoho')
      .maybeSingle()

    if (data) {
      setAccount(data as EmailAccount)
      setCap((data as EmailAccount).daily_send_cap)
    }
    setLoading(false)
  }

  async function saveCap() {
    if (!account) return
    const { error } = await supabase
      .from('email_accounts')
      .update({ daily_send_cap: cap })
      .eq('id', account.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Daily cap updated.')
    await load()
  }

  async function disconnect() {
    if (!account) return
    if (!confirm(`Disconnect ${account.email}? You will need to reconnect to send again.`)) return
    const { error } = await supabase.from('email_accounts').delete().eq('id', account.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setAccount(null)
    toast.success('Disconnected.')
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Zoho Workspace to send pitches directly from your inbox with open tracking.
          <Link href="/plans" className="ml-2 text-primary hover:underline">← Plans</Link>
        </p>
      </div>

      {!account ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect Zoho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You'll be redirected to Zoho to authorize Prospect Intel to send and read mail on behalf
              of your account. We request <code className="text-xs">ZohoMail.messages.CREATE</code>,{' '}
              <code className="text-xs">ZohoMail.messages.READ</code>, and{' '}
              <code className="text-xs">ZohoMail.accounts.READ</code>.
            </p>
            <Button
              disabled={!userId}
              onClick={() => {
                if (userId) window.location.href = `/api/auth/zoho/authorize?uid=${userId}`
              }}
            >
              Connect Zoho
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-baseline justify-between">
              <CardTitle>Connected account</CardTitle>
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">connected</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Email</div>
                  <div className="mt-1 font-mono">{account.email}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Name</div>
                  <div className="mt-1">{account.display_name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Sent today</div>
                  <div className="mt-1">
                    <span className="font-bold">{account.sends_today}</span>
                    <span className="text-muted-foreground"> / {account.daily_send_cap}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Last send</div>
                  <div className="mt-1">
                    {account.last_send_at
                      ? new Date(account.last_send_at).toLocaleString()
                      : 'never'}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <Button variant="outline" size="sm" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily send cap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="cap">Max sends per day (hard limit)</Label>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  max={500}
                  value={cap}
                  onChange={(e) => setCap(parseInt(e.target.value || '0', 10) || 0)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Zoho's published ceiling on Workspace plans is ~1000/day but aggressive cold outbound
                gets flagged well below that. For <code className="text-xs">devminified.com</code> (your
                main domain) keep this conservative to protect sender reputation.
              </p>
              <Button size="sm" onClick={saveCap} disabled={cap === account.daily_send_cap}>
                Save cap
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
