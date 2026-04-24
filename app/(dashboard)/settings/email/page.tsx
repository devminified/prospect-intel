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
  sender_title: string | null
  sender_company: string | null
  calendly_url: string | null
  website_url: string | null
}

export default function EmailSettingsPage() {
  const [account, setAccount] = useState<EmailAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [cap, setCap] = useState(20)
  const [senderTitle, setSenderTitle] = useState('')
  const [senderCompany, setSenderCompany] = useState('Devminified')
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('https://devminified.com')
  const [savingSignature, setSavingSignature] = useState(false)
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
      const acct = data as EmailAccount
      setAccount(acct)
      setCap(acct.daily_send_cap)
      setSenderTitle(acct.sender_title ?? '')
      setSenderCompany(acct.sender_company ?? 'Devminified')
      setCalendlyUrl(acct.calendly_url ?? '')
      setWebsiteUrl(acct.website_url ?? 'https://devminified.com')
    }
    setLoading(false)
  }

  async function saveSignature() {
    if (!account) return
    setSavingSignature(true)
    const { error } = await supabase
      .from('email_accounts')
      .update({
        sender_title: senderTitle.trim() || null,
        sender_company: senderCompany.trim() || null,
        calendly_url: calendlyUrl.trim() || null,
        website_url: websiteUrl.trim() || null,
      })
      .eq('id', account.id)
    setSavingSignature(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Signature saved.')
    await load()
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
              <CardTitle>Email signature</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Appended to every sent pitch. Kept deliberately minimal — heavy formatting or images
                in cold email triggers spam filters. Plain name, title, company, one or two links.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sender-title">Your title</Label>
                  <Input
                    id="sender-title"
                    placeholder="e.g. CTO, Founder, Head of AI"
                    value={senderTitle}
                    onChange={(e) => setSenderTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sender-company">Company</Label>
                  <Input
                    id="sender-company"
                    placeholder="Devminified"
                    value={senderCompany}
                    onChange={(e) => setSenderCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="calendly">Calendly URL</Label>
                  <Input
                    id="calendly"
                    placeholder="https://calendly.com/your-handle/15min"
                    value={calendlyUrl}
                    onChange={(e) => setCalendlyUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    placeholder="https://devminified.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Preview</div>
                <div className="rounded-md border p-5 bg-background max-w-[560px]">
                  <p className="text-sm text-muted-foreground italic mb-0">
                    …[your pitch body ends here]
                  </p>
                  <div className="mt-8 pt-4 border-t">
                    {account.display_name && (
                      <div className="font-semibold text-foreground">{account.display_name}</div>
                    )}
                    {(senderTitle || senderCompany) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {senderTitle}
                        {senderTitle && senderCompany ? ' · ' : ''}
                        {senderCompany}
                      </div>
                    )}
                    {(calendlyUrl || websiteUrl) && (
                      <div className="mt-3 text-xs space-x-2">
                        {calendlyUrl && (
                          <a href={calendlyUrl} target="_blank" rel="noreferrer" className="text-primary font-medium hover:underline">
                            Book a 15-min call
                          </a>
                        )}
                        {calendlyUrl && websiteUrl && <span className="text-muted-foreground">·</span>}
                        {websiteUrl && (
                          <a href={websiteUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                            {websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Button size="sm" onClick={saveSignature} disabled={savingSignature}>
                {savingSignature ? 'Saving…' : 'Save signature'}
              </Button>
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
