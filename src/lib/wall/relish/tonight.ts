// Tonight's question on the kitchen wall's Relish stage.
//
// Everyone at the table sees the same question all day: the pick comes from
// the local date alone. "Another" walks on from there and comes back round
// after the last one. The walk strides through the list rather than taking
// the next row, so the library's themes (five courage prompts, then five
// gratitude …) don't arrive in a run.
//
// PURE: no React, no storage, no clock reads. The day arrives as a Date.

import { DINNER_PROMPTS, type DinnerPrompt, type RelishAudience } from './dinnerPrompts'

/** "Kids at the table" asks the kid prompts; "Just grown-ups" the adult ones. */
export function promptsFor(audience: RelishAudience, prompts: readonly DinnerPrompt[] = DINNER_PROMPTS): DinnerPrompt[] {
  return prompts.filter((p) => p.audiences.includes(audience))
}

/** Whole days since 1970-01-01 for the date as the wall's clock reads it
 *  (local year, month, day; the time of day and DST don't matter). */
export function localDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** The step through a list of `len`: the first number from 7 up that shares
 *  no factor with it, so the walk visits every prompt once before repeating. */
export function strideFor(len: number): number {
  if (len <= 1) return 1
  let s = 7
  while (gcd(s, len) !== 1) s++
  return s % len || 1
}

const mod = (n: number, m: number) => ((n % m) + m) % m

/** Which prompt shows: the day's own pick, then `step` taps of Another on. */
export function promptIndex(len: number, day: number, step = 0): number {
  if (len <= 0) return -1
  return mod((day + step) * strideFor(len), len)
}

/** Tonight's question for this audience, `step` taps of Another on. */
export function tonightsPrompt(date: Date, audience: RelishAudience, step = 0, prompts: readonly DinnerPrompt[] = DINNER_PROMPTS): DinnerPrompt | null {
  const list = promptsFor(audience, prompts)
  const i = promptIndex(list.length, localDayNumber(date), step)
  return i < 0 ? null : list[i]
}
