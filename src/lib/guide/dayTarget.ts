// Which day a Day session plans (spec 2026-11-01): in the morning, today,
// looking back on yesterday; from 4 pm, tomorrow, looking back on today.
// The two steps that name the day say which one.

import { wordsIn, type GuideStep, type StepWords } from './steps'

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
  return wordsIn(s.title, dayWords(isTomorrow))
}

/** The day a session plans, and the one before it, for the steps' words. */
export function dayWords(isTomorrow: boolean): StepWords {
  return isTomorrow ? { day: 'tomorrow', Day: 'Tomorrow', before: 'today' } : { day: 'today', Day: 'Today', before: 'yesterday' }
}

/** Three to five a day: stated, never enforced. */
export const DAY_COUNT_OF = '3–5'

/** The day's count: the tasks on it as the page shows them, not its events
 *  or routines, each once. */
export function dayCount(items: readonly { key: string; kind: string }[]): number {
  return new Set(items.filter((i) => i.kind === 'task').map((i) => i.key)).size
}
