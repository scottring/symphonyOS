// Minutes-of-day math for drag-reordering placed items in the Daily Plan.
// Each slot has a base time (where a fresh placement lands) and a band it owns.
// Reordering assigns the dropped item a time *between* its new neighbours, so a
// single write persists the new order without retiming everything else.

import type { TimeOfDay } from '@/lib/timeUtils'

export const SLOT_BASE_MINS: Record<TimeOfDay, number> = { morning: 540, afternoon: 840, evening: 1140 }
const SLOT_BAND: Record<TimeOfDay, [number, number]> = { morning: [360, 719], afternoon: [720, 1079], evening: [1080, 1439] }

export function minsToSlot(mins: number): TimeOfDay {
  if (mins < 720) return 'morning'
  if (mins < 1080) return 'afternoon'
  return 'evening'
}

export function clampToBand(mins: number, slot: TimeOfDay): number {
  const [lo, hi] = SLOT_BAND[slot]
  return Math.max(lo, Math.min(hi, mins))
}

/**
 * The time (minutes since midnight) for an item dropped between `prev` and
 * `next` in `slot`. Midpoint when both neighbours exist; ±15 at the edges;
 * the slot base when the slot is empty. Always clamped to the slot's band.
 */
export function dropMins(prevMins: number | null, nextMins: number | null, slot: TimeOfDay): number {
  let mins: number
  if (prevMins != null && nextMins != null) mins = Math.round((prevMins + nextMins) / 2)
  else if (prevMins != null) mins = prevMins + 15
  else if (nextMins != null) mins = nextMins - 15
  else mins = SLOT_BASE_MINS[slot]
  return clampToBand(mins, slot)
}
