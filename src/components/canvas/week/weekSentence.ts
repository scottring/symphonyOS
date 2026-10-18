// src/components/canvas/week/weekSentence.ts
//
// What the Week header's fact line says about today: "Today: {first item}"
// (calm pass 2, 2026-10-18). The longer sentence that once stood under the
// title ("Thursday is wide open. Friday is the full one.") is gone; only its
// first part stays. Rules decide it (wall philosophy rule 5); nothing here is
// generated.

import type { CanvasDay } from './WeekCanvas'

/** Today's first calendar event, or null when today has none (or is not in
 *  the week). */
export function todayItem(days: CanvasDay[], todayKey: string): string | null {
  return days.find((d) => d.key === todayKey)?.events[0]?.title ?? null
}
