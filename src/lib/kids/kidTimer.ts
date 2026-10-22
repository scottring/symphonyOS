// A kid's countdown timer (2026-10-21): reading time, math, cooking,
// anything. One at a time per tablet, kept in localStorage so a reload or a
// trip to the thought catcher does not lose it. PURE except the storage
// helpers, which take the Storage in.

export interface KidTimer {
  /** The stop it belongs to (KidStop.key), or null for a plain timer. */
  stopKey: string | null
  label: string
  totalMs: number
  /** When it rings, while running; null while paused. */
  endsAt: number | null
  /** Time left, while paused. */
  leftMs: number
}

export function startTimer(label: string, minutes: number, nowMs: number, stopKey: string | null = null): KidTimer {
  const totalMs = Math.max(1, Math.round(minutes * 60_000))
  return { stopKey, label, totalMs, endsAt: nowMs + totalMs, leftMs: totalMs }
}

export function leftMs(t: KidTimer, nowMs: number): number {
  return t.endsAt == null ? t.leftMs : Math.max(0, t.endsAt - nowMs)
}

export const isRunning = (t: KidTimer) => t.endsAt != null
export const hasRung = (t: KidTimer, nowMs: number) => isRunning(t) && leftMs(t, nowMs) === 0

export function pauseTimer(t: KidTimer, nowMs: number): KidTimer {
  return t.endsAt == null ? t : { ...t, endsAt: null, leftMs: leftMs(t, nowMs) }
}

export function resumeTimer(t: KidTimer, nowMs: number): KidTimer {
  return t.endsAt != null ? t : { ...t, endsAt: nowMs + t.leftMs }
}

/** Fraction of the time still left, 0–1, for the dial. */
export function fractionLeft(t: KidTimer, nowMs: number): number {
  return Math.min(1, Math.max(0, leftMs(t, nowMs) / t.totalMs))
}

/** "14:05" left; a minute or more shows minutes and seconds. */
export function leftLabel(t: KidTimer, nowMs: number): string {
  const s = Math.ceil(leftMs(t, nowMs) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const timerKey = (memberId: string) => `symphony.kidTimer.${memberId}`
export const soundKey = (memberId: string) => `symphony.kidTimerSound.${memberId}`

export function readTimer(storage: Storage | null, key: string): KidTimer | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<KidTimer>
    if (typeof t.label !== 'string' || typeof t.totalMs !== 'number' || typeof t.leftMs !== 'number') return null
    return { stopKey: typeof t.stopKey === 'string' ? t.stopKey : null, label: t.label, totalMs: t.totalMs, leftMs: t.leftMs, endsAt: typeof t.endsAt === 'number' ? t.endsAt : null }
  } catch {
    return null
  }
}

export function writeTimer(storage: Storage | null, key: string, t: KidTimer | null): void {
  try {
    if (t) storage?.setItem(key, JSON.stringify(t))
    else storage?.removeItem(key)
  } catch {
    // A private window: the timer still runs, it just won't survive a reload.
  }
}
