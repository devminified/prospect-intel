'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { EmailAccount, EmailSignaturePatch } from '@/lib/types'
import { queryKeys } from './keys'

/**
 * Hooks for /settings/email — the connected outbound Zoho account.
 *
 * Reads + writes happen through the Supabase client because the
 * `email_accounts` table is RLS-protected and these are simple row ops.
 * No need to spin up dedicated API routes for them.
 */

export function useEmailAccount() {
  return useQuery<EmailAccount | null>({
    queryKey: queryKeys.emailAccount.current(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('provider', 'zoho')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as EmailAccount | null) ?? null
    },
  })
}

export function useUpdateSignature() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; patch: EmailSignaturePatch }>({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from('email_accounts').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emailAccount.current() })
    },
  })
}

export function useUpdateCap() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; cap: number }>({
    mutationFn: async ({ id, cap }) => {
      const { error } = await supabase
        .from('email_accounts')
        .update({ daily_send_cap: cap })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emailAccount.current() })
    },
  })
}

export function useDisconnectEmailAccount() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('email_accounts').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.setQueryData(queryKeys.emailAccount.current(), null)
    },
  })
}
