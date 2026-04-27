import type { Task } from '@/types/task'

/**
 * Returns a human-readable message to show as a toast when an update
 * changes a task's privacy/sharing state in a user-noticeable way.
 *
 * Currently only fires when context becomes 'family' from a non-family
 * value — that's the moment a task becomes visible to other household
 * members and trust requires explicit feedback.
 *
 * Returns null when no message should be shown.
 */
export function detectContextSharingChange(
  prev: Task,
  updates: Partial<Task>,
): string | null {
  if (!('context' in updates)) return null
  if (updates.context !== 'family') return null
  if (prev.context === 'family') return null
  return 'Now visible to family members'
}
