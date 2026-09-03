// Reading earns screen time, one for one, capped at the day's reading target.
// Read 20, earn 20. Read 10 (and spend the other 10 on something quiet of
// your own), earn 10. Read nothing, earn nothing. Same day only — nothing
// banks, because a bank turns a habit into an account.
//
// The earned minutes are ONE screen_time_adjustments row per kid per day
// (reason READING_REASON), updated in place, so the ledger never shows two
// "Reading" lines for one afternoon. Pure helpers here; the write lives in
// useReadingScreenTime.

export const READING_REASON = 'Reading'

/** Minutes of screen time `minutesRead` earns against a `cap`. */
export function readingEarns(minutesRead: number, cap: number): number {
  if (!Number.isFinite(minutesRead) || minutesRead <= 0) return 0
  return Math.min(Math.floor(minutesRead), Math.max(0, cap))
}

// ── The timer ──────────────────────────────────────────────────────────
//
// A kid taps Start, reads, taps Done. The kid page auto-closes after two
// idle minutes, so a timer that lived in React state would die with it —
// this one lives in localStorage keyed by kid and day, so re-opening the
// page finds it still running and the board can show it too.
//
// Pause keeps what was read so far (`carriedMs`) and stops the clock;
// Resume starts it again; Reset throws the whole thing away unlogged.

export interface ReadingTimer {
  /** Milliseconds read before the current run (0 for a fresh timer). */
  carriedMs: number
  /** When the current run started, or null while paused. */
  runningSince: string | null
}

export function readingTimerKey(memberId: string, ymd: string): string {
  return `wall:reading-timer:${memberId}:${ymd}`
}

export function readReadingTimer(storage: Storage | null, key: string): ReadingTimer | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ReadingTimer> & { startedAt?: string }
    // The first shape was `{ startedAt }` — a timer that could only run.
    if (typeof parsed.startedAt === 'string' && !Number.isNaN(Date.parse(parsed.startedAt))) {
      return { carriedMs: 0, runningSince: parsed.startedAt }
    }
    const carriedMs = typeof parsed.carriedMs === 'number' && parsed.carriedMs >= 0 ? parsed.carriedMs : 0
    const runningSince =
      typeof parsed.runningSince === 'string' && !Number.isNaN(Date.parse(parsed.runningSince)) ? parsed.runningSince : null
    if (carriedMs === 0 && runningSince === null) return null
    return { carriedMs, runningSince }
  } catch {
    return null
  }
}

export function writeReadingTimer(storage: Storage | null, key: string, timer: ReadingTimer | null): void {
  try {
    if (timer) storage?.setItem(key, JSON.stringify(timer))
    else storage?.removeItem(key)
  } catch {
    // storage unavailable — the timer simply won't survive a page close
  }
}

export function startReadingTimer(now: Date): ReadingTimer {
  return { carriedMs: 0, runningSince: now.toISOString() }
}

export function elapsedMs(timer: ReadingTimer, now: Date): number {
  const run = timer.runningSince ? Math.max(0, now.getTime() - Date.parse(timer.runningSince)) : 0
  return timer.carriedMs + run
}

export function pauseReadingTimer(timer: ReadingTimer, now: Date): ReadingTimer {
  return { carriedMs: elapsedMs(timer, now), runningSince: null }
}

export function resumeReadingTimer(timer: ReadingTimer, now: Date): ReadingTimer {
  if (timer.runningSince) return timer
  return { carriedMs: timer.carriedMs, runningSince: now.toISOString() }
}

export const isTimerRunning = (timer: ReadingTimer): boolean => timer.runningSince !== null

/** Whole minutes on the clock. */
export function elapsedMinutes(timer: ReadingTimer, now: Date): number {
  return Math.floor(elapsedMs(timer, now) / 60_000)
}

/**
 * What Done logs. Whole minutes, but a kid who read for fifty seconds and
 * stopped gets one minute rather than nothing — the timer is there to make
 * reading count, not to be a stopwatch.
 */
export function minutesToLog(timer: ReadingTimer, now: Date): number {
  const ms = elapsedMs(timer, now)
  if (ms < 30_000) return 0
  return Math.max(1, Math.floor(ms / 60_000))
}

/** "7:32" for a timer. */
export function elapsedLabel(timer: ReadingTimer, now: Date): string {
  const s = Math.floor(elapsedMs(timer, now) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
