'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBatches, useCreateBatch } from '@/lib/queries/batches'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  done: 'default',
  processing: 'secondary',
  failed: 'destructive',
}

export default function BatchesPage() {
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [count, setCount] = useState(10)
  const [autoEnrichTopN, setAutoEnrichTopN] = useState(0)
  const [pitchScoreThreshold, setPitchScoreThreshold] = useState<string>('')
  const [success, setSuccess] = useState('')

  const batchesQ = useBatches()
  const createMut = useCreateBatch()
  const batches = batchesQ.data ?? []
  const loadError = batchesQ.error ? batchesQ.error.message : ''
  const submitError = createMut.error ? createMut.error.message : ''
  const error = submitError || loadError

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess('')
    try {
      const data = await createMut.mutateAsync({
        city,
        category,
        count,
        auto_enrich_top_n: autoEnrichTopN,
        pitch_score_threshold: pitchScoreThreshold === '' ? null : Number(pitchScoreThreshold),
      })
      setSuccess(`Successfully created batch with ${data.prospects_created} prospects!`)
      setCity('')
      setCategory('')
      setCount(10)
      setAutoEnrichTopN(0)
      setPitchScoreThreshold('')
    } catch {
      // error surfaced via createMut.error
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batches</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create New Batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" required placeholder="e.g., Austin, San Francisco" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" required placeholder="e.g., restaurants, coffee shops, dentists" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">Count (1-50)</Label>
                <Input id="count" type="number" min={1} max={50} required value={count} onChange={(e) => setCount(parseInt(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="autoEnrich">Auto-enrich top N leads with Apollo contacts</Label>
                <Input id="autoEnrich" type="number" min={0} max={50} value={autoEnrichTopN} onChange={(e) => setAutoEnrichTopN(Math.max(0, parseInt(e.target.value || '0')))} />
                <p className="text-xs text-muted-foreground">
                  Spends Apollo people-search on the top N by opportunity score. Email reveals stay opt-in per contact. Set to 0 to skip entirely.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pitchGate">Skip pitch below opportunity score</Label>
                <Input id="pitchGate" type="number" min={0} max={100} placeholder="e.g. 50 — leave blank to pitch everything" value={pitchScoreThreshold} onChange={(e) => setPitchScoreThreshold(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Cuts Sonnet cost by skipping pitch generation for low-scoring leads you wouldn&apos;t personally email.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create Batch'}
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">{error}</div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">{success}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batchesQ.isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No batches created yet. Create your first batch above!
            </div>
          ) : (
            <div className="divide-y">
              {batches.map((batch) => (
                <Link key={batch.id} href={`/batches/${batch.id}`} className="block p-6 hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{batch.category} in {batch.city}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Created: {new Date(batch.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant={STATUS_VARIANT[batch.status] ?? 'outline'}>{batch.status}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {batch.count_completed} of {batch.count_requested} completed
                      </p>
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
