'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateUpworkProfile,
  useUpworkAccess,
  useUpworkProfiles,
} from '@/lib/queries/upwork-profiles'
import type { UpworkProfileCreateInput } from '@/lib/types'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  archived: 'outline',
}

export default function UpworkProfilesPage() {
  const accessQ = useUpworkAccess()
  const profilesQ = useUpworkProfiles()
  const createMut = useCreateUpworkProfile()

  const isOwner = accessQ.data?.team_role === 'owner'
  const profiles = profilesQ.data ?? []

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [accountType, setAccountType] = useState<'individual' | 'agency'>('individual')
  const [hourlyRate, setHourlyRate] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const input: UpworkProfileCreateInput = {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      description: description.trim() || null,
      profile_url: profileUrl.trim() || null,
      account_type: accountType,
      hourly_rate_usd: hourlyRate.trim() === '' ? null : Number(hourlyRate),
    }
    try {
      await createMut.mutateAsync(input)
      setShowForm(false)
      setName('')
      setSlug('')
      setDescription('')
      setProfileUrl('')
      setAccountType('individual')
      setHourlyRate('')
    } catch {
      // surfaced via createMut.error
    }
  }

  if (profilesQ.isLoading || accessQ.isLoading) {
    return <div className="text-muted-foreground">Loading…</div>
  }

  const error = profilesQ.error?.message ?? createMut.error?.message ?? ''

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Upwork profiles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each profile is a separate Upwork account the team operates from.
            {isOwner && ' Only the team owner can create new profiles.'}
          </p>
        </div>
        {isOwner && !showForm && (
          <Button onClick={() => setShowForm(true)}>+ Add profile</Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Upwork profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="up-name">Name</Label>
                  <Input
                    id="up-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Devminified — Web Dev"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-slug">Slug</Label>
                  <Input
                    id="up-slug"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. web-dev"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lowercase, letters/numbers/hyphens. Used in URLs.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-type">Account type</Label>
                  <Select value={accountType} onValueChange={(v) => v && setAccountType(v as 'individual' | 'agency')}>
                    <SelectTrigger id="up-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual freelancer</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-rate">Hourly rate (USD)</Label>
                  <Input
                    id="up-rate"
                    type="number"
                    min={0}
                    step={1}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="e.g. 65"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="up-url">Profile URL</Label>
                  <Input
                    id="up-url"
                    type="url"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder="https://www.upwork.com/freelancers/…"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="up-desc">Description</Label>
                  <textarea
                    id="up-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="What this profile pitches: niches, services, target client size."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Creating…' : 'Create profile'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your profiles</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {isOwner
                ? 'No profiles yet. Click + Add profile to set up the first one.'
                : 'You are not a member of any Upwork profile yet. Ask the owner or a profile manager to add you.'}
            </div>
          ) : (
            <div className="divide-y">
              {profiles.map((p) => (
                <Link
                  key={p.id}
                  href={`/upwork/profiles/${p.id}`}
                  className="block p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{p.name}</h3>
                        <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>{p.status}</Badge>
                        <Badge variant="outline" className="text-xs">{p.account_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">/{p.slug}</p>
                      {p.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {p.hourly_rate_usd != null && (
                        <div className="text-sm font-medium">${p.hourly_rate_usd}/hr</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {p.connects_balance} Connects
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
