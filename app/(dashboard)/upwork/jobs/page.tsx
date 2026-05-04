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
import { useCreateUpworkJob, useUpworkJobs } from '@/lib/queries/upwork-jobs'
import type { UpworkBudgetType, UpworkJobCreateInput, UpworkJobStatus } from '@/lib/types'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'default',
  closed: 'outline',
  hired_other: 'destructive',
  dead: 'secondary',
}

export default function UpworkJobsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const jobsQ = useUpworkJobs(statusFilter)
  const createMut = useCreateUpworkJob()

  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budgetType, setBudgetType] = useState<UpworkBudgetType>('unknown')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [hourlyMin, setHourlyMin] = useState('')
  const [hourlyMax, setHourlyMax] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [estDuration, setEstDuration] = useState('')
  const [skillsRaw, setSkillsRaw] = useState('')

  const jobs = jobsQ.data ?? []
  const error = jobsQ.error?.message ?? createMut.error?.message ?? ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const skills = skillsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const input: UpworkJobCreateInput = {
      url: url.trim(),
      title: title.trim(),
      description: description.trim() || null,
      budget_type: budgetType,
      budget_min_usd: budgetMin === '' ? null : Number(budgetMin),
      budget_max_usd: budgetMax === '' ? null : Number(budgetMax),
      hourly_min_usd: hourlyMin === '' ? null : Number(hourlyMin),
      hourly_max_usd: hourlyMax === '' ? null : Number(hourlyMax),
      hours_per_week: hoursPerWeek.trim() || null,
      est_duration: estDuration.trim() || null,
      skills,
    }
    try {
      await createMut.mutateAsync(input)
      setShowForm(false)
      setUrl(''); setTitle(''); setDescription('')
      setBudgetType('unknown')
      setBudgetMin(''); setBudgetMax(''); setHourlyMin(''); setHourlyMax('')
      setHoursPerWeek(''); setEstDuration(''); setSkillsRaw('')
    } catch {
      // surfaced via createMut.error
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Upwork jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Postings the team is tracking. Saved here so any profile can bid without
            duplicating across the team.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger size="sm" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="hired_other">Hired (other)</SelectItem>
              <SelectItem value="dead">Dead</SelectItem>
            </SelectContent>
          </Select>
          {!showForm && <Button onClick={() => setShowForm(true)}>+ Save job</Button>}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Save a new job</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="job-url">Upwork URL</Label>
                  <Input
                    id="job-url"
                    type="url"
                    required
                    placeholder="https://www.upwork.com/jobs/Senior-Engineer_~021…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The external job id is parsed from the URL — duplicates across profiles are caught at save time.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="job-title">Title</Label>
                  <Input
                    id="job-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Next.js engineer for analytics dashboard"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-budget-type">Budget type</Label>
                  <Select value={budgetType} onValueChange={(v) => v && setBudgetType(v as UpworkBudgetType)}>
                    <SelectTrigger id="job-budget-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="fixed">Fixed price</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {budgetType === 'fixed' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="job-bmin">Budget min (USD)</Label>
                      <Input id="job-bmin" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job-bmax">Budget max (USD)</Label>
                      <Input id="job-bmax" type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
                    </div>
                  </>
                )}
                {budgetType === 'hourly' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="job-hmin">Hourly min ($/hr)</Label>
                      <Input id="job-hmin" type="number" min={0} value={hourlyMin} onChange={(e) => setHourlyMin(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job-hmax">Hourly max ($/hr)</Label>
                      <Input id="job-hmax" type="number" min={0} value={hourlyMax} onChange={(e) => setHourlyMax(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="job-hpw">Hours per week</Label>
                  <Input id="job-hpw" placeholder="e.g. 30+/week" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-dur">Estimated duration</Label>
                  <Input id="job-dur" placeholder="e.g. 3 to 6 months" value={estDuration} onChange={(e) => setEstDuration(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="job-skills">Skills (comma-separated)</Label>
                  <Input id="job-skills" placeholder="React, Next.js, Postgres" value={skillsRaw} onChange={(e) => setSkillsRaw(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="job-desc">Description</Label>
                  <textarea
                    id="job-desc"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Saving…' : 'Save job'}
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
          <CardTitle className="text-base">
            {jobsQ.isLoading ? 'Loading…' : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No jobs match the current filter.
            </div>
          ) : (
            <div className="divide-y">
              {jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/upwork/jobs/${j.id}`}
                  className="block p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{j.title}</h3>
                        <Badge variant={STATUS_VARIANT[j.status] ?? 'outline'}>{j.status}</Badge>
                        <Badge variant="outline" className="text-xs">{j.budget_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Saved {new Date(j.created_at).toLocaleDateString()}
                        {j.skills.length > 0 && ` · ${j.skills.slice(0, 5).join(', ')}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {j.budget_type === 'fixed' && (j.budget_min_usd != null || j.budget_max_usd != null) && (
                        <div className="text-sm font-medium">
                          {budgetRange(j.budget_min_usd, j.budget_max_usd, '$')}
                        </div>
                      )}
                      {j.budget_type === 'hourly' && (j.hourly_min_usd != null || j.hourly_max_usd != null) && (
                        <div className="text-sm font-medium">
                          {budgetRange(j.hourly_min_usd, j.hourly_max_usd, '$')}/hr
                        </div>
                      )}
                      {j.hours_per_week && (
                        <div className="text-xs text-muted-foreground">{j.hours_per_week}</div>
                      )}
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

function budgetRange(min: number | null, max: number | null, prefix: string): string {
  if (min != null && max != null) return `${prefix}${min}–${prefix}${max}`
  if (min != null) return `${prefix}${min}+`
  if (max != null) return `up to ${prefix}${max}`
  return ''
}
