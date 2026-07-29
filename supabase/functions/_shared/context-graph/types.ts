import type { Facet } from '../facets.ts'

export type ContextEntityType = 'task' | 'calendar_event' | 'project'
export interface EntityRef { entityType: ContextEntityType; entityId: string; userId: string }

export interface BundlePerson { id: string; name: string; role: 'about' | 'owner'; phone?: string; email?: string; relationship?: string }
export interface BundleLineage { projectId?: string; projectName?: string; projectStatus?: string; goalId?: string; goalTitle?: string }
export interface BundleFact { facet: Facet; attachmentId: string }
export interface BundleNote { id: string; title: string; snippet: string; source: 'linked' | 'semantic'; similarity?: number; vaultPath?: string }
export interface BundleAction { actionType: string; detail?: string; outcome?: string; createdAt: string }
export interface BundleTime { scheduledFor?: string; bucket?: string; isWaiting?: boolean; waitingSince?: string; deferCount?: number; ageDays: number }

export interface ContextBundle {
  ref: EntityRef
  entity: { id: string; title: string; notes?: string; links: { url: string; title?: string }[]; phoneNumber?: string; location?: string }
  people: BundlePerson[]
  lineage: BundleLineage
  facts: BundleFact[]
  knowledge: BundleNote[]
  history: BundleAction[]
  time: BundleTime
  /** Part names that failed to load — consumers degrade gracefully, never throw. */
  degraded: string[]
}

export const KNOWLEDGE_K = 5
export const SIMILARITY_FLOOR = 0.55
export const HISTORY_N = 10
export const SNIPPET_LEN = 200
