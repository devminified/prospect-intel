'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { apiPatch, apiPost } from '@/lib/api-client'
import type { Followup, Note, ProspectDetail } from '@/lib/types'
import { queryKeys } from './keys'

/**
 * Aggregate query for the prospect detail page. Fetches every domain
 * row the page renders in one shot — prospect + enrichment + analysis +
 * pitch + contacts + audit + channel rec + sent emails + notes +
 * follow-ups. Mutations on this prospect invalidate `queryKeys.prospect(id)`
 * to trigger a re-fetch.
 *
 * Notes + follow-ups are also exposed as standalone queries
 * (lib/queries/notes, lib/queries/followups). Their mutations invalidate
 * BOTH the standalone key and this aggregate so the prospect detail page
 * always reflects the latest data.
 */
export function useProspectDetail(prospectId: string) {
  return useQuery<ProspectDetail>({
    queryKey: queryKeys.prospect(prospectId),
    enabled: !!prospectId,
    queryFn: async () => {
      const [pRes, eRes, aRes, pitchRes, cRes, vRes, rRes, nRes, fRes] = await Promise.all([
        supabase.from('prospects').select('*').eq('id', prospectId).single(),
        supabase.from('enrichments').select('*').eq('prospect_id', prospectId).maybeSingle(),
        supabase.from('analyses').select('*').eq('prospect_id', prospectId).maybeSingle(),
        supabase
          .from('pitches')
          .select('id, subject, body, edited_body, status')
          .eq('prospect_id', prospectId)
          .maybeSingle(),
        supabase
          .from('contacts')
          .select(
            'id, full_name, title, seniority, department, email, email_confidence, phone, phone_source, linkedin_url, is_primary'
          )
          .eq('prospect_id', prospectId),
        supabase.from('visibility_audits').select('*').eq('prospect_id', prospectId).maybeSingle(),
        supabase
          .from('channel_recommendations')
          .select(
            'phone_fit_score, email_fit_score, recommended_channel, reasoning, phone_script, generated_at'
          )
          .eq('prospect_id', prospectId)
          .maybeSingle(),
        supabase
          .from('prospect_notes')
          .select('id, body, created_at, updated_at, user_id')
          .eq('prospect_id', prospectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('prospect_followups')
          .select('id, due_at, note, done, done_at, created_at')
          .eq('prospect_id', prospectId)
          .order('done', { ascending: true })
          .order('due_at', { ascending: true }),
      ])

      if (pRes.error) throw new Error(`Prospect load failed: ${pRes.error.message}`)

      // Sent emails are keyed by the pitch row, so the join only happens
      // when a pitch exists for this prospect.
      let sentEmail: ProspectDetail['sentEmail'] = null
      let allSentEmails: ProspectDetail['allSentEmails'] = []
      const pitchId = (pitchRes.data as { id?: string } | null)?.id
      if (pitchId) {
        const { data: sent } = await supabase
          .from('sent_emails')
          .select(
            'id, to_email, sent_at, bounced, bounce_reason, email_opens(opened_at, is_probably_mpp, is_probably_self), email_replies(received_at, classification)'
          )
          .eq('pitch_id', pitchId)
          .order('sent_at', { ascending: false })
        const all = (sent as ProspectDetail['sentEmail'][]) ?? []
        sentEmail = all[0] ?? null
        allSentEmails = all.map((s) => ({
          id: s!.id,
          to_email: s!.to_email,
          sent_at: s!.sent_at,
          bounced: s!.bounced,
          email_opens: s!.email_opens ?? [],
          email_replies: s!.email_replies ?? [],
        }))
      }

      return {
        prospect: pRes.data as ProspectDetail['prospect'],
        enrichment: (eRes.data as ProspectDetail['enrichment']) ?? null,
        analysis: (aRes.data as ProspectDetail['analysis']) ?? null,
        pitch: (pitchRes.data as ProspectDetail['pitch']) ?? null,
        contacts: (cRes.data as ProspectDetail['contacts']) ?? [],
        audit: (vRes.data as ProspectDetail['audit']) ?? null,
        recommendation: (rRes.data as ProspectDetail['recommendation']) ?? null,
        sentEmail,
        notes: (nRes.data as Note[]) ?? [],
        followups: (fRes.data as Followup[]) ?? [],
        allSentEmails,
        prospectCreatedAt: (pRes.data as { created_at?: string | null } | null)?.created_at ?? null,
      }
    },
  })
}

/**
 * Generic PATCH on /api/prospects/[id]. Accepts the same loose body the
 * existing route does (mark_viewed / assigned_to / outreach_status /
 * prospect_status / pitch_edited_body / pitch_status). Optimistic prospect
 * field updates happen in the page via `qc.setQueryData` before mutating.
 */
export function usePatchProspect(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) => apiPatch(`/api/prospects/${prospectId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useDiscoverContacts(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(`/api/prospects/${prospectId}/discover-contacts`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useRegeneratePitch(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(`/api/prospects/${prospectId}/regenerate-pitch`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useRevealContactEmail(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (contactId) =>
      apiPost(`/api/prospects/${prospectId}/contacts/${contactId}/reveal`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

export function useRecommendChannel(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(`/api/prospects/${prospectId}/recommend-channel`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}

/**
 * POST /api/pitches/[pitchId]/send. Pitch id varies per prospect; pass it
 * in at call time. Invalidates the prospect aggregate so the sentEmail
 * strip refreshes.
 */
export function useSendPitch(prospectId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (pitchId) => apiPost(`/api/pitches/${pitchId}/send`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prospect(prospectId) })
    },
  })
}
