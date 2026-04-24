'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Plan {
  id: string
  plan_date: string
  status: string
  created_at: string
  executed_at: string | null
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  executed: 'default',
  skipped: 'outline',
  draft: 'secondary',
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('lead_plans')
      .select('id, plan_date, status, created_at, executed_at')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setPlans((data as Plan[]) ?? [])
    }
    setLoading(false)
  }

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not signed in')
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'generate failed')
      window.location.href = `/plans/${body.plan_id}`
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily lead plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opus-generated recommendations of which categories + cities to target today.
            <Link href="/settings/icp" className="ml-2 text-primary hover:underline">Edit ICP →</Link>
          </p>
        </div>
        <Button onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : "Generate today's plan"}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Past plans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No plans yet. Fill out your ICP, then click &quot;Generate today&apos;s plan&quot;.
            </div>
          ) : (
            <div className="divide-y">
              {plans.map((p) => (
                <Link key={p.id} href={`/plans/${p.id}`} className="block p-6 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{p.plan_date}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generated {new Date(p.created_at).toLocaleString()}
                        {p.executed_at && ` · Executed ${new Date(p.executed_at).toLocaleString()}`}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>{p.status}</Badge>
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
