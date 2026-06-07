import type { TaskContext } from '@/types/task'

/**
 * Scope = WHO can see an item (the sharing ladder: atom → molecule → compound).
 * - individual: private to the owner
 * - couple:     shared with the partner (the "us" layer)
 * - compound:   shared with the whole household (the kitchen-wall layer)
 *
 * Scope is orthogonal to life-area (work/personal/family) and to assignment
 * (who does it). Always user-overridable; the default below just keeps capture
 * one-tap.
 */
export type Scope = 'individual' | 'couple' | 'compound'

/**
 * Default sharing scope for a life-area. `family` is shared with the household
 * (compound); `work`/`personal`/untagged are private to the owner (individual).
 * The user can always override (e.g. bump a personal item to couple).
 */
export function defaultScopeForArea(area: TaskContext | null | undefined): Scope {
  return area === 'family' ? 'compound' : 'individual'
}
