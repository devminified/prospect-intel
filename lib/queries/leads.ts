'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Lead, OutreachState } from '@/lib/types'

export type { Lead }

/**
 * Aggregate query for /leads. Pulls prospects + pitches + recs in
 * parallel (RLS-filtered to team), then folds them into Lead[] with
 * the derived outreach state attached.
 *
 * The filter / sort / saved-view logic stays in the page — those are
 * UI state, not server state, so they don't belong here.
 */
export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data: pData, error: pErr } = await supabase
        .from('prospects')
        .select(
          'id, name, status, outreach_status, last_viewed_at, website, rating, review_count, created_at, batch_id, assigned_to, batches!inner(city, category), analyses(opportunity_score, best_angle)'
        )
        .order('created_at', { ascending: false })
        .limit(1000)

      if (pErr) throw new Error(`Leads load failed: ${pErr.message}`)

      const prospects = (pData as any[]) ?? []
      const ids = prospects.map((p) => p.id)
      if (ids.length === 0) return []

      const [pitchesRes, recsRes] = await Promise.all([
        supabase
          .from('pitches')
          .select(
            'prospect_id, sent_emails(id, sent_at, email_opens(opened_at, is_probably_self, is_probably_mpp), email_replies(id, received_at))'
          )
          .in('prospect_id', ids),
        supabase
          .from('channel_recommendations')
          .select('prospect_id, recommended_channel')
          .in('prospect_id', ids),
      ])

      const stateByProspect = new Map<string, OutreachState>()
      for (const pitch of (pitchesRes.data as any[]) ?? []) {
        const sent = (pitch.sent_emails ?? []) as any[]
        const has_sent = sent.length > 0
        const has_real_open = sent.some((s) =>
          (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
        )
        const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)

        let latest = 0
        for (const s of sent) {
          if (s.sent_at) latest = Math.max(latest, Date.parse(s.sent_at))
          for (const o of s.email_opens ?? []) {
            if (o.opened_at) latest = Math.max(latest, Date.parse(o.opened_at))
          }
          for (const r of s.email_replies ?? []) {
            if (r.received_at) latest = Math.max(latest, Date.parse(r.received_at))
          }
        }

        stateByProspect.set(pitch.prospect_id, {
          has_pitch: true,
          has_sent,
          has_real_open,
          has_reply,
          recommended_channel: null,
          last_activity_at: latest > 0 ? new Date(latest).toISOString() : null,
        })
      }
      for (const r of (recsRes.data as any[]) ?? []) {
        const existing = stateByProspect.get(r.prospect_id) ?? {
          has_pitch: false,
          has_sent: false,
          has_real_open: false,
          has_reply: false,
          recommended_channel: null as OutreachState['recommended_channel'],
          last_activity_at: null as string | null,
        }
        existing.recommended_channel = r.recommended_channel ?? null
        stateByProspect.set(r.prospect_id, existing)
      }

      return prospects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        outreach_status: p.outreach_status ?? null,
        last_viewed_at: p.last_viewed_at ?? null,
        website: p.website ?? null,
        rating: p.rating ?? null,
        review_count: p.review_count ?? null,
        created_at: p.created_at,
        batch_id: p.batch_id,
        batch_city: p.batches?.city ?? null,
        batch_category: p.batches?.category ?? null,
        best_angle: p.analyses?.best_angle ?? null,
        opportunity_score: p.analyses?.opportunity_score ?? null,
        assigned_to: p.assigned_to ?? null,
        outreach: stateByProspect.get(p.id) ?? {
          has_pitch: false,
          has_sent: false,
          has_real_open: false,
          has_reply: false,
          recommended_channel: null,
          last_activity_at: null,
        },
      }))
    },
  })
}
