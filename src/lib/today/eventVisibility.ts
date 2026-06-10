// src/lib/today/eventVisibility.ts
import type { TaskContext } from '@/types/task'

/**
 * Whether a calendar event should appear on the family/shared timeline.
 * Family-tagged and untagged events always show; private work/personal events
 * show only when explicitly shared via the "add to family timeline" flow.
 */
export function isEventVisibleToFamily(
  resolvedContext: TaskContext | null,
  sharedWithFamily: boolean,
): boolean {
  return resolvedContext === 'family' || resolvedContext == null || sharedWithFamily
}
