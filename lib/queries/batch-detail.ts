'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

interface OutreachState {
  has_pitch: boolean
  has_sent: boolean
  has_real_open: boolean
  has_reply: boolean
  recommended_channel: 'phone' | 'email' | 'either' | null
}

export interface BatchProspect {
  id: string
  name: string
  status: string
  website: string | null
  rating: number | null
  review_count: number | null
  outreach_status: string | null
  last_viewed_at: string | null
  analyses: { opportunity_score: number | null; best_angle: string | null } | null
  last_error?: string | null
  failed_stage?: string | null
  outreach: OutreachState
}

export interface BatchHeader {
  id: string
  city: string
  category: string
  count_requested: number
  count_completed: number
  count_filtered_below_icp: number
  count_duplicates_skipped: number
  status: string
}

export interface BatchDetail {
  batch: BatchHeader
  prospects: BatchProspect[]
}

/**
 * Aggregate query for /batches/[id]. Fetches batch header + prospects +
 * failed jobs (for inline error display) + pitches/recs (for derived
 * outreach state). Sorts prospects by opportunity_score desc.
 */
export function useBatchDetail(batchId: string) {
  return useQuery<BatchDetail>({
    queryKey: ['batch-detail', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data: b, error: bErr } = await supabase
        .from('batches')
        .select(
          'id, city, category, count_requested, count_completed, count_filtered_below_icp, count_duplicates_skipped, status'
        )
        .eq('id', batchId)
        .single()
      if (bErr) throw new Error(`Batch load failed: ${bErr.message}`)

      const { data: p, error: pErr } = await supabase
        .from('prospects')
        .select(
          'id, name, status, website, rating, review_count, outreach_status, last_viewed_at, analyses(opportunity_score, best_angle)'
        )
        .eq('batch_id', batchId)
      if (pErr) throw new Error(`Prospects load failed: ${pErr.message}`)

      const prospectIds = ((p as unknown as { id: string }[]) ?? []).map((x) => x.id)

      const [failedJobsRes, pitchesRes, recsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('prospect_id, job_type, last_error, status')
          .eq('batch_id', batchId)
          .eq('status', 'failed'),
        prospectIds.length === 0
          ? Promise.resolve({ data: [] as any[] })
          : supabase
              .from('pitches')
              .select(
                'prospect_id, sent_emails(id, email_opens(is_probably_self, is_probably_mpp), email_replies(id))'
              )
              .in('prospect_id', prospectIds),
        prospectIds.length === 0
          ? Promise.resolve({ data: [] as any[] })
          : supabase
              .from('channel_recommendations')
              .select('prospect_id, recommended_channel')
              .in('prospect_id', prospectIds),
      ])

      const errorByProspect = new Map<string, { stage: string; message: string }>()
      for (const j of (failedJobsRes.data as any[]) ?? []) {
        if (j.last_error) {
          errorByProspect.set(j.prospect_id, { stage: j.job_type, message: j.last_error })
        }
      }

      const stateByProspect = new Map<string, OutreachState>()
      for (const pitch of (pitchesRes.data as any[]) ?? []) {
        const sent = (pitch.sent_emails ?? []) as any[]
        const has_sent = sent.length > 0
        const has_real_open = sent.some((s) =>
          (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
        )
        const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)
        stateByProspect.set(pitch.prospect_id, {
          has_pitch: true,
          has_sent,
          has_real_open,
          has_reply,
          recommended_channel: null,
        })
      }
      for (const r of (recsRes.data as any[]) ?? []) {
        const existing = stateByProspect.get(r.prospect_id) ?? {
          has_pitch: false,
          has_sent: false,
          has_real_open: false,
          has_reply: false,
          recommended_channel: null as OutreachState['recommended_channel'],
        }
        existing.recommended_channel = r.recommended_channel ?? null
        stateByProspect.set(r.prospect_id, existing)
      }

      const decorated = ((p as unknown as BatchProspect[]) ?? []).map((x) => {
        const err = errorByProspect.get(x.id)
        const outreach = stateByProspect.get(x.id) ?? {
          has_pitch: false,
          has_sent: false,
          has_real_open: false,
          has_reply: false,
          recommended_channel: null as OutreachState['recommended_channel'],
        }
        return {
          ...x,
          outreach,
          ...(err ? { failed_stage: err.stage, last_error: err.message } : {}),
        }
      })
      const sorted = decorated.sort((a, b) => {
        const sa = a.analyses?.opportunity_score ?? -1
        const sb = b.analyses?.opportunity_score ?? -1
        return sb - sa
      })

      return { batch: b as BatchHeader, prospects: sorted }
    },
  })
}
