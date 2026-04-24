'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface Batch {
  id: string
  city: string
  category: string
  count_requested: number
  count_completed: number
  status: string
  created_at: string
}

export default function BatchesPage() {
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [count, setCount] = useState(10)
  const [autoEnrichTopN, setAutoEnrichTopN] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])

  useEffect(() => {
    loadBatches()
  }, [])

  async function loadBatches() {
    const { data, error } = await supabase
      .from('batches')
      .select('id, city, category, count_requested, count_completed, status, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      setError(`Failed to load batches: ${error.message}`)
      return
    }
    setBatches((data as Batch[]) ?? [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error('Not signed in')
      }

      const response = await fetch('/api/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          city,
          category,
          count,
          auto_enrich_top_n: autoEnrichTopN,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create batch')
      }

      setSuccess(`Successfully created batch with ${data.prospects_created} prospects!`)

      await loadBatches()
      
      // Reset form
      setCity('')
      setCategory('')
      setCount(10)
      setAutoEnrichTopN(0)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Batches</h1>
      
      {/* Create New Batch Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Batch</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                id="city"
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Austin, San Francisco"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                id="category"
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., restaurants, coffee shops, dentists"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            
            <div>
              <label htmlFor="count" className="block text-sm font-medium text-gray-700 mb-1">
                Count (1-50)
              </label>
              <input
                id="count"
                type="number"
                min="1"
                max="50"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="autoEnrich" className="block text-sm font-medium text-gray-700 mb-1">
              Auto-enrich top N leads with Apollo contacts
            </label>
            <input
              id="autoEnrich"
              type="number"
              min="0"
              max="50"
              className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={autoEnrichTopN}
              onChange={(e) => setAutoEnrichTopN(Math.max(0, parseInt(e.target.value || '0')))}
            />
            <p className="mt-1 text-xs text-gray-500">
              Spends Apollo people-search on the top N by opportunity score. Email reveals stay opt-in
              per contact on the detail page. Set to 0 to skip entirely.
            </p>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            {loading ? 'Creating Batch...' : 'Create Batch'}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
            {success}
          </div>
        )}
      </div>

      {/* Batches List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Your Batches</h2>
        </div>
        
        {batches.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No batches created yet. Create your first batch above!
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {batches.map((batch) => (
              <Link key={batch.id} href={`/batches/${batch.id}`} className="block p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {batch.category} in {batch.city}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Created: {new Date(batch.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          batch.status === 'done'
                            ? 'bg-green-100 text-green-800'
                            : batch.status === 'processing'
                            ? 'bg-yellow-100 text-yellow-800'
                            : batch.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {batch.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {batch.count_completed} of {batch.count_requested} completed
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}