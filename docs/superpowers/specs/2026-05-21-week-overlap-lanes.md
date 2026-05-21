# Week View — Side-by-Side Lanes for Overlapping Items

**Date:** 2026-05-21
**Status:** Draft spec, ready for plan
**Surface:** Week view (`WeekViewV2`) + Workweek (`dayCount=5`)
**Owner:** Scott

---

## Problem

The Week view's blocks are absolute-positioned by start time and occupy the **full column width** of their day. There is no side-by-side splitting for overlapping items, so two blocks at the same time on the same day occupy identical rectangles. Whichever renders later in the DOM lands on top and completely hides the others.

The rendering logic lives in `src/components/home/week/WeekEventBlock.tsx`:

```
top    = (startTime − firstMinute) × pxPerMin
left   = TIME_COL_WIDTH + (100% − TIME_COL_WIDTH) × dayIdx / 7
width  = (100% − TIME_COL_WIDTH) / 7 − 4px
height = max(15-min, (endTime − startTime) × pxPerMin)
```

Routines are the worst offenders: `routineToTimelineItem` returns `endTime: null`, so every routine gets the 30-min default in `computePlacement`. Two routines at the same `time_of_day` on the same day are *identical* rectangles — invisible to each other.

**Concrete examples (Scott's data):**

- "Clean kitchen after dinner" (19:00) + "Put clothes in hamper" (19:01) — visible as a faint stack because the 1-minute offset gives a few pixels of peek.
- Two `daily` routines at the same `time_of_day` would be indistinguishable.
- A timed event and a routine at the same hour fully obscure each other.

## Goal

Render overlapping items **side-by-side** within their day column, calendar-app style. When N items overlap on a day, each item's horizontal slot becomes 1/N of the column width, positioned so all are visible at once.

Non-goals:

- Multi-day spanning events (out of scope; treat each event as belonging to its start day).
- Resize-aware re-layout during an in-flight drag (current resize is feature-flagged off; lane layout snapshots at render time only).
- Drag-between-lanes UX (just visual layout, not interaction).
- All-day items (already excluded from the time grid).
- Mobile (`WeekViewMobile.tsx`) — uses a different per-day bucketed list, no positional overlap problem.

## Approach: Lane Assignment Algorithm

Standard "sweep-line" calendar layout, scoped per day.

### Definitions

- **Item interval:** `[startMin, endMin)` where `endMin = startMin + duration`. For routines with `endTime: null`, use a 30-min default (same as today's placement code).
- **Overlap cluster:** A connected group of items where each item overlaps at least one other in the same group (transitively).
- **Lane:** A vertical track within the cluster. Two items can share a lane only if their intervals do not overlap.
- **Lane count for a cluster:** The max number of concurrently-overlapping items across the cluster's lifespan.

### Algorithm

For each day (1..7):

1. Filter items to that day's items with a `startTime`. Skip all-day, skip items without a valid start.
2. Compute `endMin` for each item (use 30-min default if `endTime === null`).
3. Sort items by `(startMin asc, endMin desc)` — earlier first, longer first for stable cluster anchoring.
4. **Cluster sweep:** Walk the sorted list. Open a new cluster when the next item's `startMin` is `>=` the running `clusterMaxEnd` of the open cluster. Otherwise extend the open cluster (update `clusterMaxEnd = max(clusterMaxEnd, item.endMin)`).
5. **Within each cluster, assign lanes:**
   - Maintain an array `laneEnds: number[]` where `laneEnds[i]` is the end-minute of the latest item placed in lane `i`.
   - For each item, find the lowest-index lane `i` such that `laneEnds[i] <= item.startMin`. If none, push a new lane.
   - Set `item.laneIdx = i`; update `laneEnds[i] = item.endMin`.
   - After all items in the cluster are placed, set `item.laneCount = laneEnds.length` for every item in the cluster.

Complexity: O(N log N) per day for the sort, O(N × L) for lane assignment where L ≤ N. With Scott's data, N ≤ ~30 per day; this is trivially fast.

### Layout math (changes to `computePlacement`)

```
columnLeftPx = TIME_COL_WIDTH + (gridWidth − TIME_COL_WIDTH) × dayIdx / dayCount
columnWidthPx = (gridWidth − TIME_COL_WIDTH) / dayCount

laneWidthPx = (columnWidthPx − 4px gutter) / laneCount      // 4px keeps day-column gap
itemLeft = columnLeftPx + laneIdx × laneWidthPx
itemWidth = laneWidthPx − INTRA_LANE_GAP                    // see Visual rules
```

`dayCount` already exists as a prop on `WeekViewV2` / `WeekGrid` to support Workweek vs full Week.

## Visual rules

- **Intra-lane gap:** 2px between adjacent lanes within the same day. Keeps blocks visually distinct without wasting space.
- **Minimum lane width floor:** 40px. If `laneWidthPx < 40px`, cap `laneCount` at `floor(columnWidthPx / 40)` and overflow items go to a "+N more" pill anchored at the top of the cluster. Defer the +N more interaction to a follow-up; for the first pass, just clamp so the grid never produces unreadable slivers.
- **Z-order within a lane:** later-rendered items still land on top. Since lanes don't overlap horizontally, this only matters at the moment of a drag preview, which uses the existing `DragOverlay`.
- **Routines vs tasks vs events:** lane assignment is type-agnostic. A routine at 7 PM and an event at 7 PM share lanes the same way two events would. The existing color tinting (`colorFor(item)`) keeps types visually distinct.

## Data shape changes

Add a thin "placed" wrapper that carries lane info alongside the original item, computed by the layout pass and consumed by `WeekEventBlock`.

```ts
// src/components/home/week/layoutLanes.ts (new)
export interface PlacedItem {
  item: TimelineItem
  dayIdx: number       // 0..(dayCount-1)
  laneIdx: number      // 0..(laneCount-1)
  laneCount: number    // total lanes in this item's cluster
}

export function layoutWeekLanes(
  items: TimelineItem[],
  weekStart: Date,
  dayCount: number,
): PlacedItem[]
```

`computePlacement` in `WeekEventBlock.tsx` is replaced with a prop-driven version that consumes `laneIdx` / `laneCount` and emits absolute `left` / `width` / `top` / `height`. The startTime-only fallback is kept for items that arrive without lane info (defensive — should not happen after the layout pass).

## Files touched

| File | Change |
|---|---|
| `src/components/home/week/layoutLanes.ts` | **New.** Pure function `layoutWeekLanes` + helpers (`getEffectiveEndMin`, `clusterByOverlap`, `assignLanes`). |
| `src/components/home/week/layoutLanes.test.ts` | **New.** Unit tests for the layout algorithm. |
| `src/components/home/week/WeekViewV2.tsx` | Wrap `allBlocks` in a `layoutWeekLanes(allBlocks, weekStart, dayCount)` call; pass `PlacedItem` to children instead of raw `TimelineItem`. |
| `src/components/home/week/WeekEventBlock.tsx` | Accept `placedItem: PlacedItem`. Replace `computePlacement` with `computePlacementFromLane(placedItem)` that uses `laneIdx` / `laneCount` for `left` / `width`. Keep `top` / `height` math unchanged. |
| `src/components/home/week/WeekGrid.tsx` | No logic change. Expose `dayCount` (already does) so the layout call can pass it through. |
| `src/components/home/week/WeekViewMobile.tsx` | No change. Mobile uses per-day bucketed list, no positional overlap. |
| `src/components/home/week/WeekEventBlock.test.tsx` | Update existing tests to pass `placedItem` props. |
| `src/components/home/week/WeekViewV2.test.tsx` | New test: render 3 overlapping items on the same day, assert distinct `left` values. |

## Tests

### `layoutLanes.test.ts`

| Case | Setup | Expectation |
|---|---|---|
| Empty | `[]` | `[]` |
| Single item | one task at 9 AM | `laneIdx=0, laneCount=1` |
| Non-overlapping items | tasks at 9 AM, 11 AM, 1 PM | each `laneCount=1` (separate clusters) |
| Two overlapping items | events 9-10 AM and 9:30-10:30 AM | both in same cluster, lanes 0 and 1, `laneCount=2` |
| Three-item chain | 9-10, 9:30-10:30, 10:15-11 AM | three lanes within one cluster |
| Routines default duration | two routines at 19:00 | both at lane 0/1, `laneCount=2`, treated as 30-min each |
| Cross-day | two events on Mon and Tue at 9 AM | independent clusters, each `laneCount=1` |
| Workweek dayCount=5 | overlapping items on Saturday | filtered out (no Saturday in 5-day view) |
| Stable ordering | overlap-tied items | sorted by `(startMin asc, endMin desc)` produces deterministic lane indices |

### `WeekViewV2.test.tsx`

Render component with three timed items at the same start time on Monday; query rendered blocks; assert that their `style.left` values differ and their combined `style.width` values sum to (roughly) the column width.

### Visual regression

Manual on preview deploy — eyeball the 7 PM stack on Scott's actual data: confirm two distinct side-by-side blocks for "Clean kitchen after dinner" + "Put clothes in hamper" instead of stacked overlap.

## Edge cases & decisions

- **Routines with explicit `time_of_day` but no duration**: 30-min default (unchanged from current placement code). Document in the algorithm comment that this default determines overlap detection — two routines within 30 min of each other will share a cluster.
- **Items with `endTime` set but earlier than `startTime`**: treat as zero-length, use 15-min minimum (matches the existing `Math.max(HOUR_ROW_HEIGHT / 4, ...)` floor).
- **Items at day boundary** (e.g. event starting at 23:30 running into next day): clip to `endMin = min(endMin, 24 × 60)` for layout. The next day's portion is not currently rendered (single-day blocks); preserve that.
- **Drag preview**: during a drag, dnd-kit's `DragOverlay` is what the user sees moving. The underlying item retains its computed lane. Re-layout is not re-triggered mid-drag; on drop, the updated `scheduledFor` flows through state and the next render re-runs `layoutWeekLanes`.
- **Workweek vs Week**: `dayCount` is already threaded. Layout is per-day, so Workweek just skips days 5-6.

## Open questions

1. **+N more clamp behavior**: when `laneCount` exceeds the 40px-floor cap, do we drop excess items entirely, show a "+N more" pill, or expand the column vertically? **Recommendation:** for v1, show all items (let lanes get narrow) and add a TODO for the +N more pill. Width clamp is a v2 polish.
2. **Should events get visual priority over routines** when both occupy a cluster? **Recommendation:** no — type-agnostic lane assignment keeps the algorithm simple. Color/border already distinguishes types.
3. **Should the layout function be memoized inside the hook tree** or computed inline in `WeekViewV2`? **Recommendation:** compute inside the existing `allBlocks` `useMemo` — the deps are already correct (`tasks, events, routines, weekStart, dayCount, hideRoutines`).

## Effort estimate

- Layout module + tests: ~3-4 hours
- WeekViewV2 + WeekEventBlock wiring: ~1-2 hours
- Existing test fixes: ~30-60 min
- Manual verification on preview: 15 min

**Total: ~5-7 hours of focused work, one PR.**

## Not in this spec

- Mobile overlap handling (`WeekViewMobile.tsx`).
- Routine duration as a first-class user-editable field.
- "+N more" overflow UI when too many lanes.
- Drag-between-lanes interaction.
- Multi-day spanning events.
- All-day row layout (current all-day row is a single horizontal track and has its own overlap question).
