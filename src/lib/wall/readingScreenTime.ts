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
// A kid taps Start, reads, taps Stop. The kid page auto-closes after two
// idle minutes, so a timer that lived in React state would die with it —
// this one lives in localStorage keyed by kid and day, so re-opening the
// page finds it still running and the board can show it too.

export interface ReadingTimer {
  startedAt: string // ISO
}

export function readingTimerKey(memberId: string, ymd: string): string {
  return `wall:reading-timer:${memberId}:${ymd}`
}

export function readReadingTimer(storage: Storage | null, key: string): ReadingTimer | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ReadingTimer>
    return typeof parsed.startedAt === 'string' && !Number.isNaN(Date.parse(parsed.startedAt))
      ? { startedAt: parsed.startedAt }
      : null
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

/** Whole minutes on the clock since `startedAt`. */
export function elapsedMinutes(timer: ReadingTimer, now: Date): number {
  const ms = now.getTime() - Date.parse(timer.startedAt)
  return Math.max(0, Math.floor(ms / 60_000))
}

/**
 * What a Stop logs. Whole minutes, but a kid who read for fifty seconds
 * and stopped gets one minute rather than nothing — the timer is there to
 * make reading count, not to be a stopwatch.
 */
export function minutesToLog(timer: ReadingTimer, now: Date): number {
  const ms = now.getTime() - Date.parse(timer.startedAt)
  if (ms < 30_000) return 0
  return Math.max(1, Math.floor(ms / 60_000))
}

/** "7:32" for a running timer. */
export function elapsedLabel(timer: ReadingTimer, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - Date.parse(timer.startedAt)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
