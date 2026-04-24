'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Icp {
  services: string[]
  avg_deal_size: number | null
  daily_capacity: number
  preferred_cities: string[]
  excluded_cities: string[]
  min_gmb_rating: number | null
  min_review_count: number | null
  target_categories: string[]
}

const EMPTY: Icp = {
  services: [],
  avg_deal_size: null,
  daily_capacity: 0,
  preferred_cities: [],
  excluded_cities: [],
  min_gmb_rating: null,
  min_review_count: null,
  target_categories: [],
}

export default function IcpSettingsPage() {
  const [icp, setIcp] = useState<Icp>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError('Not signed in')
      setLoading(false)
      return
    }
    const res = await fetch('/api/icp', { headers: { Authorization: `Bearer ${token}` } })
    const body = await res.json()
    if (res.ok && body.icp) {
      setIcp({ ...EMPTY, ...body.icp })
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch('/api/icp', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(icp),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save failed' }))
        throw new Error(body.error ?? 'save failed')
      }
      setMessage('Saved.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-500">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <Link href="/plans" className="text-sm text-indigo-600 hover:underline">← Plans</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Ideal Customer Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          The daily planner uses this to decide which categories and cities to target.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}
      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">{message}</div>
      )}

      <div className="bg-white rounded-lg shadow p-5 space-y-5">
        <CsvField
          label="Services your agency offers"
          help="Comma-separated. These shape which prospect gaps the agency can solve."
          value={icp.services}
          onChange={(v) => setIcp({ ...icp, services: v })}
          placeholder="web development, mobile apps, AI automation, design, DevOps"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Average deal size (USD)"
            value={icp.avg_deal_size}
            onChange={(v) => setIcp({ ...icp, avg_deal_size: v })}
            placeholder="e.g. 15000"
          />
          <NumberField
            label="Daily lead capacity (hard cap)"
            help="The planner will never recommend more leads total/day than this. 0 = unlimited."
            value={icp.daily_capacity}
            onChange={(v) => setIcp({ ...icp, daily_capacity: v ?? 0 })}
            placeholder="e.g. 90"
            min={0}
            max={500}
          />
        </div>

        <CsvField
          label="Target categories (the planner picks from this pool)"
          help="Comma-separated. Try the exact names the seasonality calendar knows: med spas, dentists, law firms, HVAC, landscaping, real estate agents, wedding planners, restaurants, etc."
          value={icp.target_categories}
          onChange={(v) => setIcp({ ...icp, target_categories: v })}
          placeholder="med spas, dental practices, tax preparation, HVAC"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CsvField
            label="Preferred cities"
            help="Comma-separated. Planner prefers these; leaves blank if none."
            value={icp.preferred_cities}
            onChange={(v) => setIcp({ ...icp, preferred_cities: v })}
            placeholder="Austin, Denver, Seattle"
          />
          <CsvField
            label="Excluded cities"
            help="Planner will never recommend these."
            value={icp.excluded_cities}
            onChange={(v) => setIcp({ ...icp, excluded_cities: v })}
            placeholder="New York, Los Angeles"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Min GMB rating (quality floor)"
            value={icp.min_gmb_rating}
            onChange={(v) => setIcp({ ...icp, min_gmb_rating: v })}
            placeholder="e.g. 4.0"
            step={0.1}
            min={0}
            max={5}
          />
          <NumberField
            label="Min review count"
            value={icp.min_review_count}
            onChange={(v) => setIcp({ ...icp, min_review_count: v })}
            placeholder="e.g. 50"
            min={0}
          />
        </div>

        <div className="pt-3 border-t">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-md font-medium"
          >
            {saving ? 'Saving…' : 'Save ICP'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CsvField({
  label, help, value, onChange, placeholder,
}: {
  label: string; help?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value.join(', '))
  useEffect(() => { setRaw(value.join(', ')) }, [value])
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
    </div>
  )
}

function NumberField({
  label, help, value, onChange, placeholder, step, min, max,
}: {
  label: string; help?: string; value: number | null; onChange: (v: number | null) => void;
  placeholder?: string; step?: number; min?: number; max?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : Number(v))
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
    </div>
  )
}
