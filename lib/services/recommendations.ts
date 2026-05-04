import { recommendChannel as legacyRecommend } from '@/lib/pipeline/recommend'
import { requireProspectAccess } from './access'

/**
 * Generate (or regenerate) the channel recommendation for a prospect via
 * Sonnet. Open to any team member — recommendations help anyone working
 * the prospect, not just senders.
 */
export async function recommend(userId: string, prospectId: string): Promise<void> {
  await requireProspectAccess(userId, prospectId)
  await legacyRecommend(prospectId)
}
