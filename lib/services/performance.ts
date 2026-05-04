import { computeRecentPerformance } from '@/lib/plans'
import { ValidationError } from './errors'

/**
 * Per-(category, city) outreach reply aggregates over the last N days.
 * Wraps lib/plans.ts::computeRecentPerformance — the heavy lifting
 * lives there since the planner cron also consumes it.
 */
export async function getRecent(
  userId: string,
  daysRaw: string | null
): Promise<{ days: number; rows: unknown[] }> {
  let days = 30
  if (daysRaw != null) {
    const parsed = parseInt(daysRaw, 10)
    if (!Number.isFinite(parsed)) {
      throw new ValidationError('days must be an integer')
    }
    days = Math.max(1, Math.min(365, parsed))
  }
  const rows = await computeRecentPerformance(userId, days)
  return { days, rows }
}
