'use client'

import { useEffect } from 'react'
import { toast } from '@/components/ui/sonner'

/**
 * Global client-side error listener. Mount once in the root layout.
 *
 * Catches errors from THREE sources automatically — no per-page wiring needed:
 *
 * 1. Every `fetch()` call in the browser. We monkey-patch window.fetch once on
 *    mount; if the response is non-2xx and the body is JSON with an `error`
 *    field, we toast it. The original response object is returned untouched,
 *    so existing page code continues to work (it still sees !res.ok and can
 *    setError() for the inline banner).
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

    const toastFromResponse = async (res: Response, input: RequestInfo | URL) => {
      try {
        const cloned = res.clone()
        const contentType = cloned.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
          toast.error(`${res.status} ${res.statusText || 'Request failed'} — ${url}`)
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
      if (!res.ok) {
        // Fire and forget — don't block the caller on the toast path.
        void toastFromResponse(res, input)
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
