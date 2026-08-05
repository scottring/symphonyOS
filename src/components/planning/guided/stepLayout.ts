// src/components/planning/guided/stepLayout.ts
//
// Where a guided-session step's content column sits (kept out of
// GuidedSession.tsx so that file only exports a component — react-refresh,
// same reason altitude.ts exists).

import type { StepType } from './types'

/** Step types that need the full width: they render grids — seven day columns,
 *  five week columns, picks beside their shelf — and a reading-measure cap just
 *  re-creates the cramping the wide container existed to fix. */
const WIDE_TYPES: ReadonlySet<string> = new Set(['calendar', 'schedule-grid', 'place-on-weeks'])

export function isWideStep(type: StepType): boolean {
  return WIDE_TYPES.has(type)
}

/**
 * Classes for the step's content column.
 *
 * The left padding on a wide step is load-bearing, not cosmetic: the waypoint
 * rail is absolutely positioned at `left-7` from md up. A narrow step clears it
 * only by accident — `mx-auto` centres a 680px column well clear of the gutter.
 * A wide step is `max-w-none`, so without explicit padding its heading and
 * prose render straight through the step dots, which is exactly what the season
 * wizard's "The season ahead" step did.
 */
export function stepColumnClassName(wide: boolean): string {
  const base = 'w-full mx-auto py-10 md:py-14 space-y-7'
  return wide
    ? `${base} max-w-none px-6 md:pl-20 lg:pl-24 lg:pr-10`
    : `${base} max-w-[680px] px-6`
}
