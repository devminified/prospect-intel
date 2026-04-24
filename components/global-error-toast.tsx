'use client'

import { useEffect } from 'react'
import { toast } from '@/components/ui/sonner'

/**
 * Global client-side error listener. Mount once in the root layout.
 *
 * Catches errors from THREE sources automatically — no per-page wiring needed:
 *
 * 1. Every `fetch()` call to OUR OWN /api/* routes. We monkey-patch
 *    window.fetch once on mount; if the request is to /api/* and the response
 *    is non-2xx, we toast the JSON error body. The original response object
 *    is returned untouched, so existing page code continues to work (it still
 *    sees !res.ok and can setError() for the inline banner).
 *
 *    IMPORTANT: we deliberately skip Next.js internals, image optimization,
 *    and Supabase auth requests. Only user-initiated app API calls trigger
 *    toasts. Otherwise a cached RSC prefetch 404 or a token-refresh race
 *    would flood the user with toasts they didn't cause.
 *
 * 2. Unhandled promise rejections (errors thrown from async code that nothing
 *    catches). Safety net for logic bugs.
 *
 * 3. Uncaught runtime errors (window.onerror). Same safety net.
 *
 * If any page in the future adds a new fetch call / new backend route / new
 * error path, the toast shows up for free. This is the SINGLE place to maintain
 * error visibility across the app.
 */
export function GlobalErrorToast() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const originalFetch = window.fetch

    const isOurApi = (input: RequestInfo | URL): boolean => {
      try {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
        // Same-origin '/api/...' or absolute URL on our origin with /api/...
        if (raw.startsWith('/api/')) return true
        if (raw.startsWith(window.location.origin + '/api/')) return true
        return false
      } catch {
        return false
      }
    }

    const toastFromResponse = async (res: Response) => {
      try {
        const cloned = res.clone()
        const contentType = cloned.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          toast.error(`${res.status} ${res.statusText || 'Request failed'}`)
          return
        }
        const body = await cloned.json().catch(() => null)
        const msg = body?.error ?? `Request failed (${res.status})`
        toast.error(String(msg))
      } catch {
        toast.error(`Request failed (${res.status})`)
      }
    }

    const patchedFetch: typeof fetch = async (input, init) => {
      const res = await originalFetch(input, init)
      // Only toast for OUR /api/* routes. Next.js RSC prefetches, image
      // optimization, and Supabase auth refreshes go through un-toasted.
      if (!res.ok && isOurApi(input)) {
        void toastFromResponse(res)
      }
      return res
    }

    window.fetch = patchedFetch

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
          ? reason
          : reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as any).message)
          : 'Unhandled error'
      // Skip "Not signed in" spam on first load before session resolves
      if (msg === 'Not signed in') return
      toast.error(msg)
      // eslint-disable-next-line no-console
      console.error('[prospect-intel] unhandled rejection', reason)
    }

    const onWindowError = (event: ErrorEvent) => {
      toast.error(event.message || 'Unexpected error')
      // eslint-disable-next-line no-console
      console.error('[prospect-intel] window error', event.error ?? event.message)
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('error', onWindowError)

    return () => {
      window.fetch = originalFetch
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.removeEventListener('error', onWindowError)
    }
  }, [])

  return null
}
