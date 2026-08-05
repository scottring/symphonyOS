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

/**
 * Scope to write when an item's life-area CHANGES and the caller didn't set a
 * scope explicitly. Returns null to leave the existing scope alone.
 *
 * The coupling used to run one way only — family made a row compound, and
 * nothing ever walked it back ("never auto-unshare"). That produced the leak
 * this function exists to stop: re-tagging a shared household task as
 * `personal` left `scope='compound'`, so a partner kept read access to
 * medical and job-search items that every surface now called private. Three of
 * Scott's open tasks were in exactly that state on 2026-08-05.
 *
 * It walks scope back only when the row still carries the compound scope that
 * the family tag itself applied. A scope the user chose deliberately —
 * `couple` on a personal item, the case scope.ts calls out as legitimate — is
 * never touched, because moving to a private area should not silently undo an
 * explicit share.
 */
export function scopeForContextChange(
  previousArea: TaskContext | null | undefined,
  nextArea: TaskContext | null | undefined,
  currentScope: Scope | null | undefined,
): Scope | null {
  if (previousArea === nextArea) return null

  // Into family: share with the household. This half always applied.
  if (nextArea === 'family') return 'compound'

  // Out of family, into a private area, still carrying the scope the family
  // tag gave it — take the share back.
  if (previousArea === 'family' && currentScope === 'compound') return 'individual'

  return null
}
