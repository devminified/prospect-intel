'use client'

import { useState } from 'react'
import {
  usePatchContact,
  useUseBusinessPhone,
  useFindDirectLine,
} from '@/lib/queries/contacts'

/**
 * Owns local pending state for per-contact mutations on a prospect's
 * contacts table: phone (manual / business / Lusha direct line), LinkedIn
 * URL, and full name edits.
 *
 * One pendingId at a time — the UI disables all action buttons on a
 * contact row while any of its mutations are in flight, since chaining
 * them risks racing PATCH responses against each other.
 *
 * Internally delegates to TanStack mutations from lib/queries/contacts so:
 *   - request/parse/error logic is centralized in lib/api-client.ts
 *   - cache invalidation runs (queryKeys.prospect)
 */
export function useContactMutations(prospectId: string) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState<'phone' | 'linkedin' | 'name' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patchMutation = usePatchContact(prospectId)
  const useBusinessMutation = useUseBusinessPhone(prospectId)
  const findDirectMutation = useFindDirectLine(prospectId)

  async function withPending<T>(
    contactId: string,
    kind: 'phone' | 'linkedin' | 'name',
    fn: () => Promise<T>
  ): Promise<T | null> {
    setPendingId(contactId)
    setPendingKind(kind)
    setError(null)
    try {
      return await fn()
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setPendingId(null)
      setPendingKind(null)
    }
  }

  async function setPhoneManually(contactId: string, currentPhone: string | null) {
    if (typeof window === 'undefined') return
    const input = window.prompt(
      currentPhone
        ? 'Update phone number (or clear to remove):'
        : 'Enter phone number for this contact (no Lusha credit charged):',
      currentPhone ?? ''
    )
    if (input === null) return
    const trimmed = input.trim()
    await withPending(contactId, 'phone', async () => {
      await patchMutation.mutateAsync({
        contactId,
        patch: { phone: trimmed === '' ? null : trimmed },
      })
    })
  }

  async function useBusinessPhone(contactId: string) {
    await withPending(contactId, 'phone', async () => {
      await useBusinessMutation.mutateAsync(contactId)
    })
  }

  async function findDirectLine(contactId: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Spend 1 Lusha credit to find a direct/mobile line for this contact? For SMB prospects the business phone above is usually the right number — only do this if you genuinely need the decision-maker direct.'
      )
    ) {
      return
    }
    await withPending(contactId, 'phone', async () => {
      await findDirectMutation.mutateAsync(contactId)
    })
  }

  async function setLinkedin(contactId: string, currentUrl: string | null) {
    if (typeof window === 'undefined') return
    const input = window.prompt(
      currentUrl
        ? 'Update LinkedIn profile URL (or clear to remove):'
        : 'Paste the LinkedIn profile URL for this contact (Lusha matches against this most reliably):',
      currentUrl ?? ''
    )
    if (input === null) return
    const trimmed = input.trim()
    await withPending(contactId, 'linkedin', async () => {
      await patchMutation.mutateAsync({
        contactId,
        patch: { linkedin_url: trimmed === '' ? null : trimmed },
      })
    })
  }

  async function setName(contactId: string, currentFullName: string | null) {
    if (typeof window === 'undefined') return
    const input = window.prompt(
      'Enter contact name as "First Last" — used by Lusha to match a direct line:',
      currentFullName ?? ''
    )
    if (input === null) return
    const trimmed = input.trim()
    if (trimmed === '') {
      setError('Name cannot be empty')
      return
    }
    const parts = trimmed.split(/\s+/).filter(Boolean)
    const firstName = parts[0] ?? null
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null
    if (!lastName) {
      const proceed = window.confirm('Only one word — Lusha needs a last name to match. Proceed anyway?')
      if (!proceed) return
    }
    await withPending(contactId, 'name', async () => {
      await patchMutation.mutateAsync({
        contactId,
        patch: {
          first_name: firstName,
          last_name: lastName,
          full_name: trimmed,
        },
      })
    })
  }

  return {
    pendingId,
    pendingKind,
    error,
    setPhoneManually,
    useBusinessPhone,
    findDirectLine,
    setLinkedin,
    setName,
  }
}
