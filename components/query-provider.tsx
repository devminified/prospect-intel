'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * App-wide TanStack Query provider. Mounted in the root layout.
 *
 * Defaults are intentionally conservative for a small dataset: 30s
 * stale time so navigation between pages doesn't refetch on every
 * mount, but values are still considered fresh enough that we don't
 * lose responsiveness. Mutation errors are NOT silently swallowed —
 * the GlobalErrorToast catches them via the existing fetch monkey
 * patch since all mutations go through fetch().
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
