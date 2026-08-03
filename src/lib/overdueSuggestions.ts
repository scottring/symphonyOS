import type { Task } from '@/types/task'

export type OverdueSuggestion = {
  type: 'call' | 'open_link' | 'someday' | 'followup' | 'do_today'
  label: string
  detail?: string
  /** For 'call' type */
  phoneNumber?: string
  /** For 'open_link' type */
  url?: string
}

/**
 * Generate contextual suggestions for an overdue task.
 * Returns up to 2 most relevant suggestions.
 */
export function getOverdueSuggestions(
  task: Task,
  contactName?: string,
): OverdueSuggestion[] {
  if (task.completed) return []

  const suggestions: OverdueSuggestion[] = []
  const daysOverdue = task.scheduledFor
    ? Math.floor((Date.now() - new Date(task.scheduledFor).getTime()) / 86400000)
    : 0

  // Has phone number → suggest calling
  if (task.phoneNumber) {
    suggestions.push({
      type: 'call',
      label: contactName ? `Call ${contactName}` : 'Make the call',
      phoneNumber: task.phoneNumber,
    })
  }

  // Has links → suggest opening
  if (task.links?.length) {
    const link = task.links[0]
    suggestions.push({
      type: 'open_link',
      label: link.title ? `Open ${link.title}` : 'Open link',
      url: link.url,
    })
  }

  // Deferred 3+ times → suggest moving to someday
  if ((task.deferCount ?? 0) >= 3) {
    suggestions.push({
      type: 'someday',
      label: `Deferred ${task.deferCount}× — move to Someday?`,
    })
  }

  // The "Still relevant?" stale check lived here. Removed: a date now expires
  // after GRACE_DAYS, so anything 7+ days overdue is already off Today and in
  // the slipped review queue. The chip asked a question it could not resolve —
  // 57 of them at once on 2026-08-03 — and expiry answers it structurally.

  // Is waiting on someone → suggest follow-up
  if (task.isWaiting && contactName) {
    suggestions.push({
      type: 'followup',
      label: `Follow up with ${contactName}`,
    })
  }

  // Short overdue (1-2 days), has notes → suggest doing today
  if (daysOverdue <= 2 && task.notes && suggestions.length === 0) {
    suggestions.push({
      type: 'do_today',
      label: 'Do today — you have notes ready',
    })
  }

  return suggestions.slice(0, 2)
}
