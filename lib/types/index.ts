/**
 * Re-export every domain type + Zod schema. Consumers should import
 * from `@/lib/types` rather than the per-file modules so renames
 * stay cheap.
 */
export * from './prospect'
export * from './note'
export * from './followup'
export * from './contact'
export * from './team'
export * from './batch'
export * from './pitch'
export * from './sent-email'
export * from './recommendation'
export * from './icp'
export * from './lead-plan'
export * from './enrichment'
export * from './views'
export * from './prospect-detail'
export * from './email-account'
export * from './job'
export * from './upwork'
