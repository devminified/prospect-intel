'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { queryKeys } from './keys'

/**
 * Aggregate query for the prospect detail page. Wraps the original
 * client-side parallel SELECT pattern so other mutations can invalidate
 * `queryKeys.prospect(id)` and trigger a re-fetch.
 *
 * The shape mirrors the legacy `Detail` interface — it stays loose
 * (`unknown` shape parts) intentionally so the page can keep rendering
 * its existing nested objects without a wholesale type rewrite. M58
 * cleanup will tighten this against `lib/types/`.
 */
export function useProspectDetail(prospectId: string) {
  return useQuery({
    queryKey: queryKeys.prospect(prospectId),
    enabled: !!prospectId,
    queryFn: async () => {
      const [pRes, eRes, aRes, pitchRes, cRes, vRes, rRes] = await Promise.all([
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
      ])

      if (pRes.error) throw new Error(`Prospect load failed: ${pRes.error.message}`)

      // Sent emails — keyed by pitch id since pitches.id is required.
      let sentEmail: any = null
      let allSentEmails: any[] = []
      const pitchId = (pitchRes.data as any)?.id
      if (pitchId) {
        const { data: sent } = await supabase
          .from('sent_emails')
          .select(
            'id, to_email, sent_at, bounced, bounce_reason, email_opens(opened_at, is_probably_mpp, is_probably_self), email_replies(received_at, classification)'
          )
          .eq('pitch_id', pitchId)
          .order('sent_at', { ascending: false })
        const all = (sent as any[]) ?? []
        sentEmail = all[0] ?? null
        allSentEmails = all.map((s) => ({
          id: s.id,
          to_email: s.to_email,
          sent_at: s.sent_at,
          bounced: s.bounced,
          email_opens: s.email_opens ?? [],
          email_replies: s.email_replies ?? [],
        }))
      }

      return {
        prospect: pRes.data as any,
        enrichment: (eRes.data as any) ?? null,
        analysis: (aRes.data as any) ?? null,
        pitch: (pitchRes.data as any) ?? null,
        contacts: (cRes.data as any[]) ?? [],
        audit: (vRes.data as any) ?? null,
        recommendation: (rRes.data as any) ?? null,
        sentEmail,
        allSentEmails,
        prospectCreatedAt: (pRes.data as any)?.created_at ?? null,
      }
    },
  })
}
