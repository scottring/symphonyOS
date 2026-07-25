// src/lib/planning/allDayLane.ts
//
// How tall the planning grid's all-day lane is, and how many chips that height
// can show.
//
// This used to be a single fixed constant, which was fine when the lane held the
// odd all-day item. The week rung now places by DAY — every week placement lands
// here — so a two-chip lane would hide the third thing planned for a day behind
// "+1": written, but invisible, which reads as data loss.
//
// The height must be UNIFORM across the grid's columns (they're independent flex
// children, so a per-column height would desynchronize the hour rows below), so
// the grid sizes the lane from its busiest day and passes one value to all seven.

/** One row of chips: the original lane height. */
export const ALL_DAY_LANE_HEIGHT = 44

/** Two chips per row is what fits legibly in a day column's width. */
export const ALL_DAY_CHIPS_PER_ROW = 2

/** Each additional row of chips costs this much height (chip h-5 + gap). */
const ALL_DAY_ROW_HEIGHT = 24

/** The lane stops growing here — taller than this and it eats the hour grid. */
export const ALL_DAY_MAX_ROWS = 4

/** Height needed to show `maxCount` chips without hiding any (up to the cap). */
export function allDayLaneHeight(maxCount: number): number {
  const rows = Math.min(Math.max(Math.ceil(maxCount / ALL_DAY_CHIPS_PER_ROW), 1), ALL_DAY_MAX_ROWS)
  return ALL_DAY_LANE_HEIGHT + (rows - 1) * ALL_DAY_ROW_HEIGHT
}

/** How many chips a lane of that height can actually show. */
export function allDayLaneCapacity(laneHeight: number): number {
  const rows = Math.round((laneHeight - ALL_DAY_LANE_HEIGHT) / ALL_DAY_ROW_HEIGHT) + 1
  return Math.min(Math.max(rows, 1), ALL_DAY_MAX_ROWS) * ALL_DAY_CHIPS_PER_ROW
}
