// Kitchen timers on the kiosk (conversational canvas, slice 7).
//
// A timer is stored as an ABSOLUTE end time, never as "seconds left": the
// wall reloads itself for new builds (useBuildAutoReload) and the Pi can be
// power-cycled mid-simmer, so remaining time is always recomputed from the
// clock. A finished timer stays on screen as "Done" until someone stops it or
// adds a minute; it never disappears on its own.
//
// PURE: every function takes `now` (epoch ms) explicitly.

export interface KioskTimer {
  id: string
  /** "Simmer · step 3" — what the timer is for, in the cook's words. */
  label: string
  /** Epoch ms when it rings. */
  endsAt: number
  /** What it was set for, in ms (for the progress ring). Grows with +1 min. */
  totalMs: number
}

export const MINUTE_MS = 60_000

export function startTimer(id: string, label: string, minutes: number, now: number): KioskTimer {
  const ms = Math.max(1, Math.round(minutes * MINUTE_MS))
  return { id, label, endsAt: now + ms, totalMs: ms }
}

export function remainingMs(timer: KioskTimer, now: number): number {
  return Math.max(0, timer.endsAt - now)
}

export function isTimerDone(timer: KioskTimer, now: number): boolean {
  return timer.endsAt <= now
}

/** +1 min. A timer that already rang restarts from now, so "+1 min" on a
 *  finished timer always means "one more minute from this moment". */
export function addMinute(timer: KioskTimer, now: number): KioskTimer {
  if (isTimerDone(timer, now)) return { ...timer, endsAt: now + MINUTE_MS, totalMs: MINUTE_MS }
  return { ...timer, endsAt: timer.endsAt + MINUTE_MS, totalMs: timer.totalMs + MINUTE_MS }
}

/** "6:12", "0:09", "1:02:05". Rounds UP so a timer never reads 0:00 while it
 *  still has time on it. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The timer that matters most right now: a finished one first (it is
 *  ringing), then the one with the least time left. */
export function soonestTimer(timers: KioskTimer[], now: number): KioskTimer | null {
  if (!timers.length) return null
  const done = timers.filter((t) => isTimerDone(t, now))
  if (done.length) return done.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b))
  return timers.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b))
}

/** Fraction of the timer already elapsed, 0..1. */
export function timerProgress(timer: KioskTimer, now: number): number {
  if (timer.totalMs <= 0) return 1
  return Math.min(1, Math.max(0, 1 - remainingMs(timer, now) / timer.totalMs))
}

/** Durations a recipe step names, in minutes: "simmer 20 minutes" → [20],
 *  "bake for 5–7 min" → [5] (the low end — check early, add a minute),
 *  "1 hour" → [60], "1 1/2 hours" → [90]. Distinct, in order. */
export function durationsInStep(step: string): number[] {
  const out: number[] = []
  const re = /(\d+(?:\.\d+)?)(?:\s+(\d)\/(\d))?(?:\s*(?:[–-]|to)\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|minutes?|mins?)\b/gi
  for (const m of step.matchAll(re)) {
    let n = Number(m[1])
    if (m[2] && m[3]) n += Number(m[2]) / Number(m[3])
    const minutes = /^h/i.test(m[4]) ? n * 60 : n
    const rounded = Math.round(minutes)
    if (rounded > 0 && rounded <= 24 * 60 && !out.includes(rounded)) out.push(rounded)
  }
  return out
}
