// When a finished kitchen timer rings, now that the wall has a speaker (the
// EMEET, 2026-10-19). A timer that finishes while the wall is watching keeps
// ringing until someone stops it or adds a minute — quickly at first, then
// every so often — and goes quiet after five minutes, still showing Done.
// A timer that finished while the page was closed never rings on load.
//
// PURE: every function takes `now` (epoch ms) explicitly.

import { isTimerDone, type KioskTimer } from './kioskTimers'

/** A timer counts as finishing "live" if the wall sees it within this long. */
export const LIVE_FINISH_MS = 5_000
/** Ring for this long after the timer ends, then show Done quietly. */
export const ALARM_RING_MS = 5 * 60_000
/** Ring every 4 s for the first minute, then every 15 s. */
export const FAST_RING_MS = 4_000
export const SLOW_RING_MS = 15_000
const FAST_FOR_MS = 60_000

export function finishedLive(timer: KioskTimer, now: number): boolean {
  return isTimerDone(timer, now) && now - timer.endsAt < LIVE_FINISH_MS
}

/** The gap before the next ring, given how long ago the oldest ringing timer ended. */
export function ringInterval(sinceEndMs: number): number {
  return sinceEndMs < FAST_FOR_MS ? FAST_RING_MS : SLOW_RING_MS
}

/** Timers that should still be ringing: they finished live (`live` holds
 *  their ids) and ended less than ALARM_RING_MS ago. */
export function ringingTimers(timers: KioskTimer[], live: ReadonlySet<string>, now: number): KioskTimer[] {
  return timers.filter((t) => live.has(t.id) && isTimerDone(t, now) && now - t.endsAt < ALARM_RING_MS)
}

/** Whether to ring on this tick. `lastRang` is when the alarm last sounded
 *  (0 if never). A timer that has just finished rings at once, and the pace
 *  follows the most recent finish. */
export function ringDue(ringing: KioskTimer[], lastRang: number, now: number): boolean {
  if (!ringing.length) return false
  const newestEnd = ringing.reduce((m, t) => Math.max(m, t.endsAt), -Infinity)
  return lastRang < newestEnd || now - lastRang >= ringInterval(now - newestEnd)
}

/** What the wall says out loud when a timer finishes. Labels come as
 *  "10 min", "10 min · step 3", "Step 3 · 10 min" or a name ("Rice"). */
export function doneAnnouncement(timer: KioskTimer): string {
  const parts = timer.label.split('·').map((x) => x.trim()).filter(Boolean)
  const minutes = parts.find((x) => /^\d+(\.\d+)? ?min$/i.test(x))
  const rest = parts.filter((x) => x !== minutes).join(', ')
  if (minutes) {
    const n = parseFloat(minutes)
    const what = rest ? ` for ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : ''
    return `The ${n}-minute timer${what} is done.`
  }
  if (!rest) return 'Your timer is done.'
  return /timer$/i.test(rest) ? `${rest} is done.` : `${rest} timer is done.`
}
