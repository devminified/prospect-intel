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
import {
  useDisconnectEmailAccount,
  useEmailAccount,
  useUpdateCap,
  useUpdateSignature,
} from '@/lib/queries/email-account'
import { useCurrentTeam } from '@/lib/queries/team'

export default function EmailSettingsPage() {
  const accountQ = useEmailAccount()
  const teamQ = useCurrentTeam()
  const updateSignature = useUpdateSignature()
  const updateCap = useUpdateCap()
  const disconnectMut = useDisconnectEmailAccount()

  const account = accountQ.data ?? null
  // Disconnecting affects every team member because the account is
  // team-scoped (M70). Restrict to owner + manager.
  const myRole = teamQ.data?.my_role ?? null
  const canManage = myRole === 'owner' || myRole === 'manager'

  const [cap, setCap] = useState(20)
  const [senderTitle, setSenderTitle] = useState('')
  const [senderCompany, setSenderCompany] = useState('Devminified')
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('https://devminified.com')
  const [userId, setUserId] = useState<string | null>(null)
  const params = useSearchParams()

  useEffect(() => {
    const connected = params.get('connected')
    const err = params.get('error')
    if (connected) toast.success('Zoho connected.')
    if (err) toast.error(err)
  }, [params])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data?.user?.id ?? null)
    })()
  }, [])

  useEffect(() => {
    if (!account) return
    setCap(account.daily_send_cap)
    setSenderTitle(account.sender_title ?? '')
    setSenderCompany(account.sender_company ?? 'Devminified')
    setCalendlyUrl(account.calendly_url ?? '')
    setWebsiteUrl(account.website_url ?? 'https://devminified.com')
  }, [account])

  async function saveSignature() {
    if (!account) return
    try {
      await updateSignature.mutateAsync({
        id: account.id,
        patch: {
          sender_title: senderTitle.trim() || null,
          sender_company: senderCompany.trim() || null,
          calendly_url: calendlyUrl.trim() || null,
          website_url: websiteUrl.trim() || null,
        },
      })
      toast.success('Signature saved.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'save failed')
    }
  }

  async function saveCap() {
    if (!account) return
    try {
      await updateCap.mutateAsync({ id: account.id, cap })
      toast.success('Daily cap updated.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'save failed')
    }
  }

  async function disconnect() {
    if (!account) return
    if (!confirm(`Disconnect ${account.email}? You will need to reconnect to send again.`)) return
    try {
      await disconnectMut.mutateAsync(account.id)
      toast.success('Disconnected.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'disconnect failed')
    }
  }

  if (accountQ.isLoading) return <div className="text-muted-foreground">Loading…</div>

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
              of the team. We request <code className="text-xs">ZohoMail.messages.CREATE</code>,{' '}
              <code className="text-xs">ZohoMail.messages.READ</code>, and{' '}
              <code className="text-xs">ZohoMail.accounts.READ</code>. Once connected, every team
              member sees the same account — there's only one outbound mailbox per team.
            </p>
            {canManage ? (
              <Button
                disabled={!userId}
                onClick={() => {
                  if (userId) window.location.href = `/api/auth/zoho/authorize?uid=${userId}`
                }}
              >
                Connect Zoho
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only an owner or manager can connect the team's email account.
              </p>
            )}
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
                {canManage ? (
                  <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnectMut.isPending}>
                    Disconnect
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only owners and managers can disconnect the team's email account.
                  </p>
                )}
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

              <Button size="sm" onClick={saveSignature} disabled={updateSignature.isPending}>
                {updateSignature.isPending ? 'Saving…' : 'Save signature'}
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
              <Button size="sm" onClick={saveCap} disabled={cap === account.daily_send_cap || updateCap.isPending}>
                Save cap
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
