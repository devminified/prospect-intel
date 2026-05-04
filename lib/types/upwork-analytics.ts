/**
 * Phase 11D analytics — shapes returned by the dashboard / leaderboard /
 * revenue endpoints. No Zod here: these are read-only aggregations
 * computed server-side, so input validation isn't relevant. Types
 * still live in lib/types/ per CONVENTIONS.
 */

export type AnalyticsWindow = 30 | 90 | 365 | -1 // -1 = all-time

export interface UpworkProfileFunnel {
  jobs_saved: number
  proposals_drafted: number
  proposals_sent: number
  proposals_viewed: number
  proposals_shortlisted: number
  proposals_interview: number
  proposals_hired: number
  proposals_declined: number
  proposals_no_response: number
  proposals_withdrawn: number
}

export interface UpworkProfileConnects {
  current_balance: number
  total_purchased: number
  total_spent: number
  total_refunded: number
  /** Spend per hire — null when no hires yet. */
  spend_per_hire: number | null
}

export interface UpworkProfileContractsSummary {
  active: number
  paused: number
  ended: number
  disputed: number
  total: number
}

export interface UpworkProfileRevenue {
  paid_total_usd: number
  pending_total_usd: number
  /**
   * Combined revenue per ISO yyyy-mm-dd month label, e.g. "2026-04".
   * Last 12 months ascending (oldest first). Months with zero revenue
   * are still emitted so the chart x-axis is continuous.
   */
  monthly_paid_usd: Array<{ month: string; amount_usd: number }>
}

export interface UpworkProfileDashboard {
  profile_id: string
  window_days: number
  funnel: UpworkProfileFunnel
  connects: UpworkProfileConnects
  contracts: UpworkProfileContractsSummary
  revenue: UpworkProfileRevenue
}

// ─── Cross-profile (Upwork landing page) ───────────────────────────

export interface UpworkOverviewProfileRow {
  profile_id: string
  profile_name: string
  status: string
  connects_balance: number
  active_contracts: number
  proposals_sent_window: number
  hires_window: number
  revenue_window_usd: number
  revenue_all_time_usd: number
}

export interface UpworkOverview {
  window_days: number
  per_profile: UpworkOverviewProfileRow[]
  totals: {
    proposals_sent_window: number
    hires_window: number
    revenue_window_usd: number
    revenue_all_time_usd: number
    connects_balance_total: number
  }
  monthly_paid_usd: Array<{ month: string; amount_usd: number }>
}

// ─── Bidder leaderboard ────────────────────────────────────────────

export interface UpworkBidderRow {
  user_id: string
  email: string | null
  /** Profiles they're a member of (manager or bidder). Used for the UI. */
  profile_count: number
  proposals_sent: number
  replies: number
  interviews: number
  hires: number
  reply_rate: number // 0..1
  interview_rate: number // 0..1
  hire_rate: number // 0..1
  connects_spent: number
  hours_logged: number
  revenue_attributed_usd: number
}

export interface UpworkLeaderboard {
  window_days: number
  rows: UpworkBidderRow[]
  /** Profile ids the caller can see — bidders only counted from these. */
  scoped_profile_ids: string[]
}
