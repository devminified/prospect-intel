import {
  generatePlan as legacyGeneratePlan,
  executePlan as legacyExecutePlan,
  executePlanItem as legacyExecutePlanItem,
} from '@/lib/pipeline/plans'
import { canCreateBatch, canGeneratePlan, roleForbiddenMessage } from '@/lib/rbac'
import type { Role } from '@/lib/types'
import { requireTeamAccess } from './access'
import { ForbiddenError } from './errors'

/**
 * Generate today's lead plan via Opus. Owner / manager / lead_gen only —
 * planning is part of the lead-generation pipeline.
 */
export async function generate(userId: string): Promise<{ plan_id: string }> {
  const { role } = await requireTeamAccess(userId)
  if (!canGeneratePlan(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'generate a plan'))
  }
  const planId = await legacyGeneratePlan(userId)
  return { plan_id: planId }
}

/**
 * Execute every un-executed item on a plan. Each item creates a batch
 * (so canCreateBatch gates this).
 */
export async function execute(
  userId: string,
  planId: string
): Promise<{ executed: number; skipped: number; errors: string[] }> {
  const { role } = await requireTeamAccess(userId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'execute a plan'))
  }
  return legacyExecutePlan(planId, userId)
}

/**
 * Execute a single plan item (creates one batch). Same role gate as
 * full execute since each item is a batch creation.
 */
export async function executeItem(
  userId: string,
  itemId: string
): Promise<{ batch_id: string }> {
  const { role } = await requireTeamAccess(userId)
  if (!canCreateBatch(role as Role)) {
    throw new ForbiddenError(roleForbiddenMessage(role as Role, 'execute a plan item'))
  }
  const batchId = await legacyExecutePlanItem(itemId, userId)
  return { batch_id: batchId }
}
