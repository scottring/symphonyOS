// Which day a Day session plans (spec 2026-11-01): in the morning, today,
// looking back on yesterday; from 4 pm, tomorrow, looking back on today.
// The two steps that name the day say which one.

import type { GuideStep } from './steps'

/** From this hour the session plans tomorrow. */
export const EVENING_HOUR = 16

export function dayTarget(now: Date): { target: Date; lookBackOn: Date; isTomorrow: boolean } {
  const isTomorrow = now.getHours() >= EVENING_HOUR
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (isTomorrow ? 1 : 0))
  const lookBackOn = new Date(target.getFullYear(), target.getMonth(), target.getDate() - 1)
  return { target, lookBackOn, isTomorrow }
}

/** "Look back at today" and "Tomorrow's calendar" in the evening. */
export function dayStepTitle(s: GuideStep, isTomorrow: boolean): string {
  if (!isTomorrow) return s.title
  if (s.id === 'look-back') return 'Look back at today'
  if (s.id === 'calendar') return 'Tomorrow\'s calendar'
  return s.title
}

/** Three to five a day: stated, never enforced. */
export const DAY_COUNT_OF = '3–5'

/** The day's count: the tasks on it as the page shows them, not its events
 *  or routines, each once. */
export function dayCount(items: readonly { key: string; kind: string }[]): number {
  return new Set(items.filter((i) => i.kind === 'task').map((i) => i.key)).size
}
