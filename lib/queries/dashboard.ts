'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type {
  ActivityEvent,
  DashFollowup,
  DashboardData,
  OutreachState,
  ProspectLite,
} from '@/lib/types'

/**
 * Aggregate query for /dashboard. Pulls prospects + pitches + recs +
 * open follow-ups + recent notes in parallel (RLS-filtered to the
 * user's team), then folds them into the four shapes the page renders:
 *   - prospects: ProspectLite[]    (for KPI counts)
 *   - followups: DashFollowup[]    (for the Today/Overdue/Upcoming widget)
 *   - stateByProspect: Map         (computed outreach stage per prospect)
 *   - events: ActivityEvent[]      (last 20 cross-prospect events)
 */
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [prospectsRes, pitchesRes, recsRes, followupsRes, notesRes] = await Promise.all([
        supabase
          .from('prospects')
          .select('id, name, status, outreach_status, last_viewed_at')
          .limit(2000),
        supabase
          .from('pitches')
          .select(
            'prospect_id, sent_emails(id, sent_at, to_email, email_opens(opened_at, is_probably_self, is_probably_mpp), email_replies(id, received_at, classification))'
          ),
        supabase.from('channel_recommendations').select('prospect_id, recommended_channel'),
        supabase
          .from('prospect_followups')
          .select('id, prospect_id, due_at, note, done, done_at, created_at')
          .eq('done', false)
          .order('due_at', { ascending: true })
          .limit(100),
        supabase
          .from('prospect_notes')
          .select('id, prospect_id, body, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      if (prospectsRes.error) throw new Error(`Load failed: ${prospectsRes.error.message}`)

      const prospects: ProspectLite[] = ((prospectsRes.data as ProspectLite[]) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        outreach_status: p.outreach_status ?? null,
        last_viewed_at: p.last_viewed_at ?? null,
      }))
      const nameById = new Map(prospects.map((p) => [p.id, p.name]))

      const state = new Map<string, OutreachState>()
      const acts: ActivityEvent[] = []

      for (const pitch of (pitchesRes.data as any[]) ?? []) {
        const sent = (pitch.sent_emails ?? []) as any[]
        const has_sent = sent.length > 0
        const has_real_open = sent.some((s) =>
          (s.email_opens ?? []).some((o: any) => !o.is_probably_self && !o.is_probably_mpp)
        )
        const has_reply = sent.some((s) => (s.email_replies ?? []).length > 0)
        state.set(pitch.prospect_id, {
          has_pitch: true,
          has_sent,
          has_real_open,
          has_reply,
          recommended_channel: null,
        })
        const pname = nameById.get(pitch.prospect_id) ?? '(unknown)'
        for (const s of sent) {
          if (s.sent_at) {
            acts.push({ ts: s.sent_at, icon: '→', text: `Email sent to ${pname}`, prospectId: pitch.prospect_id })
          }
          for (const o of s.email_opens ?? []) {
            if (o.is_probably_self || o.is_probably_mpp) continue
            acts.push({
              ts: o.opened_at,
              icon: '◉',
              text: `${pname} opened your email`,
              prospectId: pitch.prospect_id,
              cls: 'text-blue-700',
            })
          }
          for (const r of s.email_replies ?? []) {
            if (!r.received_at) continue
            const tag = r.classification ? ` (${r.classification})` : ''
            acts.push({
              ts: r.received_at,
              icon: '↩',
              text: `Reply from ${pname}${tag}`,
              prospectId: pitch.prospect_id,
              cls: r.classification === 'interested' ? 'text-emerald-700 font-medium' : '',
            })
          }
        }
      }

      for (const r of (recsRes.data as any[]) ?? []) {
        const existing = state.get(r.prospect_id) ?? {
          has_pitch: false,
          has_sent: false,
          has_real_open: false,
          has_reply: false,
          recommended_channel: null as OutreachState['recommended_channel'],
        }
        existing.recommended_channel = r.recommended_channel ?? null
        state.set(r.prospect_id, existing)
      }

      for (const n of (notesRes.data as any[]) ?? []) {
        const pname = nameById.get(n.prospect_id) ?? '(unknown)'
        const preview = n.body.length > 60 ? `${n.body.slice(0, 60).trim()}…` : n.body
        acts.push({
          ts: n.created_at,
          icon: '✎',
          text: `Note on ${pname}: "${preview.replace(/\s+/g, ' ')}"`,
          prospectId: n.prospect_id,
        })
      }

      for (const f of (followupsRes.data as DashFollowup[]) ?? []) {
        const pname = nameById.get(f.prospect_id) ?? '(unknown)'
        acts.push({
          ts: f.created_at,
          icon: '⏰',
          text: `Follow-up scheduled for ${pname}`,
          prospectId: f.prospect_id,
          cls: 'text-muted-foreground',
        })
      }

      acts.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))

      return {
        prospects,
        followups: (followupsRes.data as DashFollowup[]) ?? [],
        stateByProspect: state,
        events: acts.slice(0, 20),
      }
    },
  })
}
