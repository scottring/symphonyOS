// Freshness state for the always-on kiosk.
//
// The wall is trusted at a glance from across the kitchen, so a stalled fetch is
// worse than an obvious error: on 2026-07-21 and again on 2026-07-29 the Pi lost
// WiFi and the wall kept looking authoritative for hours. `useWallData` detected
// both failures correctly; nothing rendered them. This module turns the hook's
// `lastRefresh` + `error` into a level the shell can actually show.

import { isQuietHours } from '@/lib/quietHours';

export type FreshnessLevel = 'fresh' | 'stale' | 'critical';

/** Poll interval is 12 min, so 30 min means two missed polls — not one blip. */
export const STALE_AFTER_MIN = 30;
export const CRITICAL_AFTER_MIN = 60;

export interface FreshnessInput {
  /** Timestamp of the last *successful* data fetch, or null before the first. */
  lastRefresh: Date | null;
  /** Message from the most recent failed fetch, or null when the last one worked. */
  error: string | null;
  now: Date;
}

export interface Freshness {
  level: FreshnessLevel;
  /** Rail copy — "Updated 5:53 PM", or "Updating…" before the first fetch lands. */
  label: string;
  minutesStale: number;
}

/**
 * Formatted manually rather than via `toLocaleTimeString`, which emits a narrow
 * no-break space (U+202F) before AM/PM on ICU 72+ and varies by runtime locale.
 */
function formatClockTime(date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours12}:${minutes} ${hours24 < 12 ? 'AM' : 'PM'}`;
}

export function computeFreshness({ lastRefresh, error, now }: FreshnessInput): Freshness {
  if (!lastRefresh) {
    // Cold boot: the first fetch is still in flight, so there is nothing to warn about.
    return { level: 'fresh', label: 'Updating…', minutesStale: 0 };
  }

  const minutesStale = Math.floor((now.getTime() - lastRefresh.getTime()) / 60_000);

  // Polling is deliberately suspended overnight (lib/quietHours.ts), so age alone
  // would report ~7 hours stale every morning at 6am. Age-based escalation is
  // suppressed during that window; a real fetch error still escalates, because no
  // fetches run overnight to produce a spurious one.
  const ageEscalates = !isQuietHours(now);

  let level: FreshnessLevel = 'fresh';
  if (ageEscalates && minutesStale >= CRITICAL_AFTER_MIN) {
    level = 'critical';
  } else if (ageEscalates && minutesStale >= STALE_AFTER_MIN) {
    level = 'stale';
  }

  if (error) {
    // A failed fetch is visible immediately but calmly; it only takes over the
    // whole wall once it has persisted past the stale threshold, so a single
    // dropped poll during dinner doesn't throw up a banner.
    const errorLevel: FreshnessLevel =
      ageEscalates && minutesStale >= STALE_AFTER_MIN ? 'critical' : 'stale';
    if (level !== 'critical') level = errorLevel;
  }

  return { level, label: `Updated ${formatClockTime(lastRefresh)}`, minutesStale };
}
