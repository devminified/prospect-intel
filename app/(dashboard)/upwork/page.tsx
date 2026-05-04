'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /upwork is just a redirect to the profiles list. Keeping it as a
 * stable landing so future Phase 11C/D dashboards can replace this body
 * without rewriting nav links elsewhere.
 */
export default function UpworkLandingPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/upwork/profiles')
  }, [router])
  return <div className="text-muted-foreground">Loading…</div>
}
