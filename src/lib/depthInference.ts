import type { Task } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'

export type TaskDepth = 'quick' | 'standard' | 'deep'

// Title keywords that signal "just get it done" (capped payoff)
const QUICK_KEYWORDS = [
  'call', 'pick up', 'drop off', 'schedule', 'pay', 'order',
  'book', 'cancel', 'return', 'renew', 'submit', 'send',
  'buy', 'grab', 'mail', 'deposit', 'refill',
]

// Title keywords that signal "pour your soul in" (uncapped payoff)
const DEEP_KEYWORDS = [
  'plan', 'design', 'research', 'brainstorm', 'conversation',
  'date night', 'discuss', 'review', 'strategy', 'reflect',
  'explore', 'create', 'write', 'teach', 'practice',
]

function titleMatchesKeywords(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase()
  return keywords.some(kw => {
    // Match at word boundary: start of string, after space, or after punctuation
    const idx = lower.indexOf(kw)
    if (idx === -1) return false
    if (idx === 0) return true
    const charBefore = lower[idx - 1]
    return charBefore === ' ' || charBefore === ':' || charBefore === '-'
  })
}

/**
 * Infer the "depth" of a task — how much presence and attention it deserves.
 *
 * - quick: Capped payoff. Satisfice and move on. (errands, admin, short calls)
 * - standard: Default. Normal treatment.
 * - deep: Uncapped payoff. Be fully present. (planning, conversations, creative work)
 */
export function getEffectiveDepth(task: Task): TaskDepth {
  // Rule 1: Category → quick (errands and chores are dispatch-and-done)
  if (task.category === 'errand' || task.category === 'chore') {
    return 'quick'
  }

  // Rule 2: Category → deep (activities are engagement-rich)
  if (task.category === 'activity') {
    return 'deep'
  }

  // Rule 3: Duration → deep (60+ min signals deep work)
  if (task.estimatedDuration && task.estimatedDuration >= 60) {
    return 'deep'
  }

  // Rule 4: Duration → quick (15 min or less is a quick dispatch)
  if (task.estimatedDuration && task.estimatedDuration <= 15) {
    return 'quick'
  }

  // Rule 5: Rich context → deep (notes + links = planning-heavy)
  if (task.notes && task.links && task.links.length > 0) {
    return 'deep'
  }

  // Rule 6: Title keywords → quick
  if (titleMatchesKeywords(task.title, QUICK_KEYWORDS)) {
    return 'quick'
  }

  // Rule 7: Title keywords → deep
  if (titleMatchesKeywords(task.title, DEEP_KEYWORDS)) {
    return 'deep'
  }

  // Rule 8: Default
  return 'standard'
}

/**
 * Get the depth for a timeline item (tasks, events, routines, playbook blocks).
 */
export function getTimelineItemDepth(item: TimelineItem): TaskDepth {
  // Playbook blocks are inherently deep-engagement items
  if (item.type === 'playbook') {
    return 'deep'
  }

  // Tasks: run full inference
  if (item.type === 'task' && item.originalTask) {
    return getEffectiveDepth(item.originalTask)
  }

  // Events and routines: standard by default
  return 'standard'
}

/** Numeric depth for sorting (lower = higher priority in timeline) */
export function depthSortOrder(depth: TaskDepth): number {
  switch (depth) {
    case 'deep': return 0
    case 'standard': return 1
    case 'quick': return 2
  }
}
