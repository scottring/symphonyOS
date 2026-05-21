# Week View — Side-by-Side Lanes for Overlapping Items: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render overlapping blocks on the Week / Workweek grid side-by-side instead of stacked, so two items at the same time on the same day are both visible.

**Architecture:** Introduce a pure layout function `layoutWeekLanes(items, weekStart, dayCount)` that runs per-day cluster + lane assignment over `TimelineItem[]` and returns `PlacedItem[]` carrying `{dayIdx, laneIdx, laneCount}`. `WeekViewV2` calls it once per render inside the existing `allBlocks` `useMemo`. `WeekEventBlock` consumes `PlacedItem` and uses `laneIdx` / `laneCount` to compute horizontal `left` / `width`. `top` / `height` math is unchanged. Mobile (`WeekViewMobile.tsx`) is untouched (uses per-day bucketed list, no positional overlap).

**Tech Stack:** TypeScript strict, React 19, Vitest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-21-week-overlap-lanes.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/components/home/week/layoutLanes.ts` | **NEW** | Pure layout. `getEffectiveEndMin`, `groupByDay`, `clusterByOverlap`, `assignLanes`, exported `layoutWeekLanes`. |
| `src/components/home/week/layoutLanes.test.ts` | **NEW** | Vitest unit tests for the pure layout function. Algorithm correctness lives here. |
| `src/components/home/week/WeekEventBlock.tsx` | **MODIFY** | Accept `placedItem: PlacedItem` prop; new `computePlacementFromLane` replaces the day-only `computePlacement`. |
| `src/components/home/week/WeekEventBlock.test.tsx` | **MODIFY** | Pass `placedItem` in existing tests; add lane-aware placement test. |
| `src/components/home/week/WeekViewV2.tsx` | **MODIFY** | Wrap routine/task/event item list with `layoutWeekLanes`, pass `PlacedItem` to children. |
| `src/components/home/week/WeekViewMobile.tsx` | **UNCHANGED** | Per-day buckets, no positional overlap. |

---

## Task 1: Create `layoutLanes` module with `PlacedItem` type and empty-input test

**Files:**
- Create: `src/components/home/week/layoutLanes.ts`
- Create: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write the failing test for empty input**

Create `src/components/home/week/layoutLanes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { layoutWeekLanes } from './layoutLanes'

describe('layoutWeekLanes', () => {
  const weekStart = new Date('2026-05-18T00:00:00') // Monday

  it('returns empty array for empty input', () => {
    expect(layoutWeekLanes([], weekStart, 7)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: FAIL — `Failed to resolve import "./layoutLanes"`.

- [ ] **Step 3: Create minimal `layoutLanes.ts` to pass**

Create `src/components/home/week/layoutLanes.ts`:

```ts
import type { TimelineItem } from '@/types/timeline'

/**
 * One item placed in the week grid, with its assigned lane.
 *
 *   dayIdx     0..(dayCount-1)
 *   laneIdx    0..(laneCount-1) within the item's overlap cluster
 *   laneCount  total lanes in this item's cluster (>=1)
 */
export interface PlacedItem {
  item: TimelineItem
  dayIdx: number
  laneIdx: number
  laneCount: number
}

/**
 * Compute side-by-side lane placement for items in a week grid.
 *
 * Algorithm:
 *   1. Group items by day (0..dayCount-1 from weekStart).
 *   2. Within each day, sort by (startMin asc, endMin desc).
 *   3. Sweep to form overlap clusters (groups whose intervals touch transitively).
 *   4. Within each cluster, assign each item to the lowest-index lane whose
 *      previous occupant has already ended; track laneCount = max lanes used.
 *
 * Returns a flat array of PlacedItem with stable ordering: day asc, then
 * cluster-order (which preserves the (startMin asc, endMin desc) input order).
 */
export function layoutWeekLanes(
  items: TimelineItem[],
  weekStart: Date,
  dayCount: number,
): PlacedItem[] {
  return []
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 1 test, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/layoutLanes.ts src/components/home/week/layoutLanes.test.ts
git commit -m "feat(week): scaffold layoutLanes module + empty-input test"
```

---

## Task 2: Single item produces one PlacedItem with `laneIdx=0, laneCount=1`

**Files:**
- Modify: `src/components/home/week/layoutLanes.ts`
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Add a test helper that builds a minimal TimelineItem**

Add to the top of `layoutLanes.test.ts`, inside the `describe` block but above any `it`:

```ts
function makeItem(opts: {
  id: string
  start: Date
  end?: Date | null
  type?: 'task' | 'event' | 'routine'
}): import('@/types/timeline').TimelineItem {
  return {
    id: opts.id,
    type: opts.type ?? 'task',
    title: opts.id,
    startTime: opts.start,
    endTime: opts.end ?? null,
    completed: false,
    notes: undefined,
    context: null,
    recurrencePattern: null,
    assignedTo: null,
  } as unknown as import('@/types/timeline').TimelineItem
}
```

(The `as unknown as TimelineItem` cast is used because the spec only needs a subset of fields. If the real type has extra required fields, fill them with reasonable defaults rather than skipping the cast.)

- [ ] **Step 2: Write the failing test for a single item**

Append to `layoutLanes.test.ts`:

```ts
  it('places a single item in lane 0 with laneCount 1', () => {
    const item = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'), // Monday 9 AM
      end: new Date('2026-05-18T10:00:00'),
    })
    const placed = layoutWeekLanes([item], weekStart, 7)
    expect(placed).toHaveLength(1)
    expect(placed[0]).toMatchObject({
      item,
      dayIdx: 0,
      laneIdx: 0,
      laneCount: 1,
    })
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: FAIL — `expected [] to have a length of 1`.

- [ ] **Step 4: Implement minimal logic — single item per day, single lane**

Replace the body of `layoutWeekLanes` in `layoutLanes.ts`:

```ts
export function layoutWeekLanes(
  items: TimelineItem[],
  weekStart: Date,
  dayCount: number,
): PlacedItem[] {
  const weekStartMidnight = new Date(weekStart)
  weekStartMidnight.setHours(0, 0, 0, 0)

  const placed: PlacedItem[] = []
  for (const item of items) {
    if (!item.startTime) continue
    const dayIdx = daysBetween(weekStartMidnight, item.startTime)
    if (dayIdx < 0 || dayIdx >= dayCount) continue
    placed.push({ item, dayIdx, laneIdx: 0, laneCount: 1 })
  }
  return placed
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/week/layoutLanes.ts src/components/home/week/layoutLanes.test.ts
git commit -m "feat(week): layoutLanes places single-item days in lane 0"
```

---

## Task 3: `getEffectiveEndMin` helper handles null/inverted endTime

**Files:**
- Modify: `src/components/home/week/layoutLanes.ts`
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write failing tests for `getEffectiveEndMin`**

Append to `layoutLanes.test.ts`:

```ts
import { getEffectiveEndMin } from './layoutLanes'

describe('getEffectiveEndMin', () => {
  it('returns startMin + 30 when endTime is null (routine default)', () => {
    const start = new Date('2026-05-18T19:00:00')
    expect(getEffectiveEndMin(start, null)).toBe(19 * 60 + 30)
  })

  it('returns endMin when endTime is a valid later Date', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T10:30:00')
    expect(getEffectiveEndMin(start, end)).toBe(10 * 60 + 30)
  })

  it('returns startMin + 15 when endTime is earlier than startTime (inverted)', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T08:00:00')
    expect(getEffectiveEndMin(start, end)).toBe(9 * 60 + 15)
  })

  it('returns startMin + 15 when endTime equals startTime (zero-length)', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T09:00:00')
    expect(getEffectiveEndMin(start, end)).toBe(9 * 60 + 15)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: FAIL — `getEffectiveEndMin` is not exported.

- [ ] **Step 3: Implement `getEffectiveEndMin`**

Add to `layoutLanes.ts` (above `layoutWeekLanes`):

```ts
const ROUTINE_DEFAULT_DURATION_MIN = 30
const ZERO_LENGTH_FLOOR_MIN = 15

/**
 * Effective end-minute for layout. Routines with endTime: null default to 30
 * min (matches WeekEventBlock.computePlacement's existing default). Zero-
 * length or inverted endTime falls back to a 15-min floor so layout is sane.
 */
export function getEffectiveEndMin(start: Date, end: Date | null): number {
  const startMin = start.getHours() * 60 + start.getMinutes()
  if (!end) return startMin + ROUTINE_DEFAULT_DURATION_MIN
  const endMin = end.getHours() * 60 + end.getMinutes()
  if (endMin <= startMin) return startMin + ZERO_LENGTH_FLOOR_MIN
  return endMin
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 6 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/layoutLanes.ts src/components/home/week/layoutLanes.test.ts
git commit -m "feat(week): getEffectiveEndMin handles null and inverted endTime"
```

---

## Task 4: Cluster + lane assignment — two overlapping items

**Files:**
- Modify: `src/components/home/week/layoutLanes.ts`
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write the failing test for two overlapping items**

Append to the `describe('layoutWeekLanes', ...)` block:

```ts
  it('assigns two overlapping items to lanes 0 and 1 with laneCount 2', () => {
    const a = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const b = makeItem({
      id: 'b',
      start: new Date('2026-05-18T09:30:00'),
      end: new Date('2026-05-18T10:30:00'),
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed).toHaveLength(2)

    const placedA = placed.find(p => p.item.id === 'a')!
    const placedB = placed.find(p => p.item.id === 'b')!
    expect(placedA.laneIdx).toBe(0)
    expect(placedB.laneIdx).toBe(1)
    expect(placedA.laneCount).toBe(2)
    expect(placedB.laneCount).toBe(2)
  })

  it('keeps non-overlapping items at laneCount 1 (separate clusters)', () => {
    const a = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const b = makeItem({
      id: 'b',
      start: new Date('2026-05-18T11:00:00'),
      end: new Date('2026-05-18T12:00:00'),
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed.find(p => p.item.id === 'a')!.laneCount).toBe(1)
    expect(placed.find(p => p.item.id === 'b')!.laneCount).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: FAIL — both items get `laneCount: 1` from the placeholder implementation.

- [ ] **Step 3: Implement per-day grouping + cluster + lane assignment**

Replace the body of `layoutWeekLanes` in `layoutLanes.ts`:

```ts
export function layoutWeekLanes(
  items: TimelineItem[],
  weekStart: Date,
  dayCount: number,
): PlacedItem[] {
  const weekStartMidnight = new Date(weekStart)
  weekStartMidnight.setHours(0, 0, 0, 0)

  // Bucket valid items by day.
  const byDay: Map<number, Array<{ item: TimelineItem; startMin: number; endMin: number }>> = new Map()
  for (const item of items) {
    if (!item.startTime) continue
    const dayIdx = daysBetween(weekStartMidnight, item.startTime)
    if (dayIdx < 0 || dayIdx >= dayCount) continue
    const startMin = item.startTime.getHours() * 60 + item.startTime.getMinutes()
    const endMin = getEffectiveEndMin(item.startTime, item.endTime)
    if (!byDay.has(dayIdx)) byDay.set(dayIdx, [])
    byDay.get(dayIdx)!.push({ item, startMin, endMin })
  }

  const placed: PlacedItem[] = []
  // Stable day order: 0..dayCount-1.
  for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
    const dayItems = byDay.get(dayIdx)
    if (!dayItems) continue

    // Sort by (startMin asc, endMin desc) so ties are broken by longer-first.
    dayItems.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

    // Sweep to form clusters; assign lanes within each cluster.
    let clusterStart = 0
    let clusterMaxEnd = -Infinity
    for (let i = 0; i <= dayItems.length; i++) {
      const cur = dayItems[i]
      if (i < dayItems.length && (clusterMaxEnd === -Infinity || cur.startMin < clusterMaxEnd)) {
        // Extend (or open) current cluster.
        clusterMaxEnd = Math.max(clusterMaxEnd, cur.endMin)
        continue
      }
      // Close cluster [clusterStart, i): assign lanes.
      const cluster = dayItems.slice(clusterStart, i)
      const laneEnds: number[] = []
      const laneIdxByItem: number[] = []
      for (const entry of cluster) {
        let lane = laneEnds.findIndex(e => e <= entry.startMin)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(entry.endMin)
        } else {
          laneEnds[lane] = entry.endMin
        }
        laneIdxByItem.push(lane)
      }
      const laneCount = laneEnds.length
      for (let j = 0; j < cluster.length; j++) {
        placed.push({
          item: cluster[j].item,
          dayIdx,
          laneIdx: laneIdxByItem[j],
          laneCount,
        })
      }
      // Open next cluster starting at i.
      clusterStart = i
      clusterMaxEnd = cur ? cur.endMin : -Infinity
    }
  }

  return placed
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 8 tests, 0 fail. If the empty-input or single-item test fails, the cluster sweep has an off-by-one in the closing condition; check the `cur ? cur.endMin : -Infinity` fallback.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/layoutLanes.ts src/components/home/week/layoutLanes.test.ts
git commit -m "feat(week): cluster sweep + lane assignment for overlapping items"
```

---

## Task 5: Three-item true 3-lane case + chain that compresses to 2 lanes

**Files:**
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write tests for both 3-concurrent and chain-compressed cases**

Append to the `describe('layoutWeekLanes', ...)` block:

```ts
  it('produces 3 lanes when 3 items are concurrent', () => {
    // All three active at 10:00–10:30.
    const a = makeItem({ id: 'a', start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T11:00:00') })
    const b = makeItem({ id: 'b', start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00') })
    const c = makeItem({ id: 'c', start: new Date('2026-05-18T10:00:00'), end: new Date('2026-05-18T10:45:00') })
    const placed = layoutWeekLanes([a, b, c], weekStart, 7)
    const counts = new Set(placed.map(p => p.laneCount))
    expect(counts).toEqual(new Set([3]))
    expect(placed.find(p => p.item.id === 'a')!.laneIdx).toBe(0)
    expect(placed.find(p => p.item.id === 'b')!.laneIdx).toBe(1)
    expect(placed.find(p => p.item.id === 'c')!.laneIdx).toBe(2)
  })

  it('compresses chain overlaps to fewer lanes when lanes free up', () => {
    // a: 9–10, b: 9:30–10:30, c: 10:15–11. Max concurrent = 2.
    // c can reuse lane 0 after a ends at 10:00.
    const a = makeItem({ id: 'a', start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T10:00:00') })
    const b = makeItem({ id: 'b', start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00') })
    const c = makeItem({ id: 'c', start: new Date('2026-05-18T10:15:00'), end: new Date('2026-05-18T11:00:00') })
    const placed = layoutWeekLanes([a, b, c], weekStart, 7)
    const counts = new Set(placed.map(p => p.laneCount))
    expect(counts).toEqual(new Set([2]))
    expect(placed.find(p => p.item.id === 'a')!.laneIdx).toBe(0)
    expect(placed.find(p => p.item.id === 'b')!.laneIdx).toBe(1)
    expect(placed.find(p => p.item.id === 'c')!.laneIdx).toBe(0) // reuses lane 0
  })
```

- [ ] **Step 2: Run tests to verify they pass without code change**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 10 tests, 0 fail. The Task 4 algorithm already handles these correctly.

If a test fails: the algorithm's `findIndex(e => e <= entry.startMin)` is using strict inequality — `<=` is correct (touching, not overlapping, can share a lane). Verify the code matches Task 4 Step 3 exactly.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/week/layoutLanes.test.ts
git commit -m "test(week): chain compression + 3-concurrent lane cases"
```

---

## Task 6: Routines with `endTime: null` overlap correctly via the 30-min default

**Files:**
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write the failing test for two routines at the same minute**

Append to the `describe('layoutWeekLanes', ...)` block:

```ts
  it('treats two routines at the same time as overlapping (30-min default)', () => {
    // Both routines have endTime null → effective end = startMin + 30.
    // Same startMin → overlap → lane 1 for the second.
    const a = makeItem({
      id: 'routine-a',
      type: 'routine',
      start: new Date('2026-05-18T19:00:00'),
      end: null,
    })
    const b = makeItem({
      id: 'routine-b',
      type: 'routine',
      start: new Date('2026-05-18T19:00:00'),
      end: null,
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed).toHaveLength(2)
    expect(new Set(placed.map(p => p.laneCount))).toEqual(new Set([2]))
    expect(new Set(placed.map(p => p.laneIdx))).toEqual(new Set([0, 1]))
  })

  it('treats two routines 31 minutes apart as non-overlapping', () => {
    // 19:00 → effective end 19:30. 19:31 starts after → separate cluster.
    const a = makeItem({ id: 'a', type: 'routine', start: new Date('2026-05-18T19:00:00'), end: null })
    const b = makeItem({ id: 'b', type: 'routine', start: new Date('2026-05-18T19:31:00'), end: null })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed.find(p => p.item.id === 'a')!.laneCount).toBe(1)
    expect(placed.find(p => p.item.id === 'b')!.laneCount).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 12 tests, 0 fail. The `getEffectiveEndMin` already returns `startMin + 30` for `endTime: null`.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/week/layoutLanes.test.ts
git commit -m "test(week): routine 30-min default produces correct overlap"
```

---

## Task 7: Workweek `dayCount=5` excludes Saturday and Sunday

**Files:**
- Modify: `src/components/home/week/layoutLanes.test.ts`

- [ ] **Step 1: Write the failing test for dayCount=5 filtering**

Append to the `describe('layoutWeekLanes', ...)` block:

```ts
  it('excludes items on day >= dayCount (workweek filters Sat/Sun)', () => {
    // weekStart is Monday 2026-05-18. Saturday is dayIdx 5.
    const monday = makeItem({
      id: 'mon',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const saturday = makeItem({
      id: 'sat',
      start: new Date('2026-05-23T09:00:00'),
      end: new Date('2026-05-23T10:00:00'),
    })
    const placed = layoutWeekLanes([monday, saturday], weekStart, 5)
    expect(placed).toHaveLength(1)
    expect(placed[0].item.id).toBe('mon')
  })

  it('includes Saturday when dayCount=7', () => {
    const saturday = makeItem({
      id: 'sat',
      start: new Date('2026-05-23T09:00:00'),
      end: new Date('2026-05-23T10:00:00'),
    })
    const placed = layoutWeekLanes([saturday], weekStart, 7)
    expect(placed).toHaveLength(1)
    expect(placed[0].dayIdx).toBe(5)
  })
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/layoutLanes.test.ts
```

Expected: PASS — 14 tests, 0 fail. The Task 4 algorithm already enforces `dayIdx >= dayCount` filtering.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/week/layoutLanes.test.ts
git commit -m "test(week): layoutLanes respects dayCount for workweek/week"
```

---

## Task 8: Refactor `WeekEventBlock` to consume `PlacedItem`

**Files:**
- Modify: `src/components/home/week/WeekEventBlock.tsx`
- Modify: `src/components/home/week/WeekEventBlock.test.tsx`

- [ ] **Step 1: Read the current `WeekEventBlock` tests to confirm what they assert**

Run:
```bash
cat src/components/home/week/WeekEventBlock.test.tsx
```

Expected: a small test file (3 tests per the existing repo state). Note which props the existing tests pass; you'll need to update those.

- [ ] **Step 2: Update existing tests to pass `placedItem` instead of (or in addition to) `item`**

In `src/components/home/week/WeekEventBlock.test.tsx`, replace each render call's prop set so it builds a `PlacedItem` wrapper. Example transformation:

Before:
```tsx
render(<WeekEventBlock item={item} weekStart={weekStart} onSelect={onSelect} />)
```

After:
```tsx
render(<WeekEventBlock
  placedItem={{ item, dayIdx: 0, laneIdx: 0, laneCount: 1 }}
  weekStart={weekStart}
  onSelect={onSelect}
/>)
```

Apply the same change to every `render(<WeekEventBlock ... />)` call in the file. For tests that don't care about lane layout, use `dayIdx: 0, laneIdx: 0, laneCount: 1` (single-lane). For tests that need to verify lane behavior, set `laneCount` and `laneIdx` explicitly.

- [ ] **Step 3: Add a new test asserting lane-aware width**

Append to `WeekEventBlock.test.tsx` (inside the existing `describe` block):

```tsx
  it('halves the block width when laneCount is 2', () => {
    const item = makeTaskTimelineItem({
      id: 'task-a',
      title: 'Lane test',
      startTime: new Date('2026-05-18T09:00:00'),
      endTime: new Date('2026-05-18T10:00:00'),
    })
    const { container } = render(
      <DndContext sensors={useSensors(useSensor(PointerSensor))}>
        <WeekEventBlock
          placedItem={{ item, dayIdx: 0, laneIdx: 1, laneCount: 2 }}
          weekStart={new Date('2026-05-18T00:00:00')}
          onSelect={() => {}}
        />
      </DndContext>
    )
    const block = container.querySelector('[role="button"]') as HTMLElement
    // Width is in a `calc()` expression; assert the laneCount divisor is present.
    expect(block.style.width).toContain('/ 2')
    // laneIdx 1 of 2 → left offset includes the half-column shift.
    expect(block.style.left).toContain('+ ')
  })
```

(Adjust imports and the `makeTaskTimelineItem` helper to match what the existing tests already use. If the file doesn't have a helper, build a minimal `TimelineItem` inline.)

- [ ] **Step 4: Run tests to verify they fail because `placedItem` prop does not exist**

Run:
```bash
npx vitest run src/components/home/week/WeekEventBlock.test.tsx
```

Expected: FAIL — TypeScript errors on `placedItem` prop (or `item` prop missing depending on how the change is staged).

- [ ] **Step 5: Modify `WeekEventBlock.tsx` to consume `placedItem`**

In `src/components/home/week/WeekEventBlock.tsx`, change the props interface and the placement computation. Replace the existing `interface WeekEventBlockProps` block:

```tsx
import type { PlacedItem } from './layoutLanes'

interface WeekEventBlockProps {
  placedItem: PlacedItem
  weekStart: Date
  onSelect: (id: string) => void
  onResizeCommit?: (itemId: string, updates: { scheduledFor: Date; endTime: Date }) => void
}
```

In the component body, replace `const placement = computePlacement(item, weekStart)` and the `item` reference. Use `placedItem.item` everywhere `item` was used, and replace the placement function. Replace the existing `computePlacement` function with this lane-aware version:

```tsx
interface Placement {
  dayIdx: number
  laneIdx: number
  laneCount: number
  top: number
  height: number
}

function computePlacementFromLane(placedItem: PlacedItem, weekStart: Date): Placement | null {
  const item = placedItem.item
  if (!item.startTime) return null
  const start = item.startTime
  const end = item.endTime ?? new Date(start.getTime() + 30 * 60 * 1000)

  const dayIdx = daysBetween(weekStart, start)
  if (dayIdx !== placedItem.dayIdx) return null // defensive: layout disagrees

  const startMins = start.getHours() * 60 + start.getMinutes()
  const endMins = end.getHours() * 60 + end.getMinutes()
  const firstMinute = FIRST_HOUR * 60
  const pxPerMin = HOUR_ROW_HEIGHT / 60

  const top = Math.max(0, (startMins - firstMinute) * pxPerMin)
  const height = Math.max(HOUR_ROW_HEIGHT / 4, (endMins - startMins) * pxPerMin)

  return {
    dayIdx,
    laneIdx: placedItem.laneIdx,
    laneCount: placedItem.laneCount,
    top,
    height,
  }
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
```

Replace the `style` prop of the rendered block. The new `style` uses lane-aware `left` and `width`, with a 2px intra-lane gap:

```tsx
const LANE_GAP_PX = 2

// ...
style={{
  top: placement.top + previewTopOffset,
  left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${placement.dayIdx} / 7 + ((100% - ${TIME_COL_WIDTH}px) / 7 - 4px) * ${placement.laneIdx} / ${placement.laneCount})`,
  width: `calc(((100% - ${TIME_COL_WIDTH}px) / 7 - 4px) / ${placement.laneCount} - ${LANE_GAP_PX}px)`,
  height: Math.max(HOUR_ROW_HEIGHT / 4, placement.height - previewTopOffset + previewBottomOffset),
}}
```

Note that this still hard-codes `/ 7` for full-week layout. In Task 9 we thread `dayCount` through.

Also update all references inside the component:
- `item` → `placedItem.item`
- `const isRoutine = item.type === 'routine'` → `const isRoutine = placedItem.item.type === 'routine'`
- `aria-label={isRoutine ? `Routine — view only: ${item.title}` : item.title}` → use `placedItem.item.title`
- `onSelect(item.id)` → `onSelect(placedItem.item.id)`
- `colorFor(item)` → `colorFor(placedItem.item)`
- Drag id → `placedItem.item.id`

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/WeekEventBlock.test.tsx
```

Expected: PASS — original tests + new lane-width test pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/week/WeekEventBlock.tsx src/components/home/week/WeekEventBlock.test.tsx
git commit -m "feat(week): WeekEventBlock consumes PlacedItem for lane-aware width"
```

---

## Task 9: Thread `dayCount` into `WeekEventBlock`'s `/7` divisor

**Files:**
- Modify: `src/components/home/week/WeekEventBlock.tsx`
- Modify: `src/components/home/week/WeekEventBlock.test.tsx`

- [ ] **Step 1: Write a failing test for Workweek (dayCount=5) placement**

Append to `WeekEventBlock.test.tsx`:

```tsx
  it('uses dayCount=5 in the column divisor for Workweek', () => {
    const item = makeTaskTimelineItem({
      id: 'task-w',
      title: 'Workweek test',
      startTime: new Date('2026-05-18T09:00:00'),
      endTime: new Date('2026-05-18T10:00:00'),
    })
    const { container } = render(
      <DndContext sensors={useSensors(useSensor(PointerSensor))}>
        <WeekEventBlock
          placedItem={{ item, dayIdx: 0, laneIdx: 0, laneCount: 1 }}
          weekStart={new Date('2026-05-18T00:00:00')}
          dayCount={5}
          onSelect={() => {}}
        />
      </DndContext>
    )
    const block = container.querySelector('[role="button"]') as HTMLElement
    // dayCount=5 means the divisor in width/left is '5', not '7'.
    expect(block.style.left).toContain('/ 5')
    expect(block.style.width).toContain('/ 5')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/components/home/week/WeekEventBlock.test.tsx
```

Expected: FAIL — TypeScript error: `dayCount` prop does not exist on `WeekEventBlockProps`.

- [ ] **Step 3: Add `dayCount` prop and thread it through placement math**

In `WeekEventBlock.tsx`, update the props:

```tsx
interface WeekEventBlockProps {
  placedItem: PlacedItem
  weekStart: Date
  dayCount?: number  // defaults to 7 for full Week view
  onSelect: (id: string) => void
  onResizeCommit?: (itemId: string, updates: { scheduledFor: Date; endTime: Date }) => void
}
```

In the component, destructure `dayCount = 7` and use it in the style expression. Replace the two `/ 7` literals in the `style` prop with `/ ${dayCount}`:

```tsx
const { placedItem, weekStart, dayCount = 7, onSelect, onResizeCommit } = props
// ...
style={{
  top: placement.top + previewTopOffset,
  left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${placement.dayIdx} / ${dayCount} + ((100% - ${TIME_COL_WIDTH}px) / ${dayCount} - 4px) * ${placement.laneIdx} / ${placement.laneCount})`,
  width: `calc(((100% - ${TIME_COL_WIDTH}px) / ${dayCount} - 4px) / ${placement.laneCount} - ${LANE_GAP_PX}px)`,
  height: Math.max(HOUR_ROW_HEIGHT / 4, placement.height - previewTopOffset + previewBottomOffset),
}}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/components/home/week/WeekEventBlock.test.tsx
```

Expected: PASS — all WeekEventBlock tests pass with dayCount-aware placement.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekEventBlock.tsx src/components/home/week/WeekEventBlock.test.tsx
git commit -m "feat(week): WeekEventBlock honors dayCount for column division"
```

---

## Task 10: Wire `layoutWeekLanes` into `WeekViewV2`

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx`

- [ ] **Step 1: Read the current `allBlocks` useMemo to understand the structure**

Run:
```bash
grep -n "allBlocks\|layoutWeekLanes\|WeekEventBlock" src/components/home/week/WeekViewV2.tsx | head -30
```

Note the line numbers of `allBlocks` and where `<WeekEventBlock>` is rendered.

- [ ] **Step 2: Import `layoutWeekLanes` and `PlacedItem`**

Add to the imports block at the top of `WeekViewV2.tsx`:

```tsx
import { layoutWeekLanes, type PlacedItem } from './layoutLanes'
```

- [ ] **Step 3: Wrap `allBlocks` with the layout pass and rename it**

Replace the existing `const allBlocks = useMemo(() => { ... }, [...])` with two memos:

```tsx
const allItems = useMemo(() => {
  // (existing body of allBlocks goes here — produces TimelineItem[])
  // ...
  return blocks
}, [scheduledTasks, weekEvents, routines, weekStart, hideRoutines, dayCount, drag.activeDragId, tasks, events])

const placedItems = useMemo<PlacedItem[]>(
  () => layoutWeekLanes(allItems, weekStart, dayCount),
  [allItems, weekStart, dayCount],
)
```

- [ ] **Step 4: Update the render loop to use `placedItems`**

Replace the `.map(item => <WeekEventBlock item={item} ... />)` with:

```tsx
{placedItems.map((p) => (
  <WeekEventBlock
    key={p.item.id}
    placedItem={p}
    weekStart={weekStart}
    dayCount={dayCount}
    onSelect={handleSelectBlock}
    onResizeCommit={(itemId, updates) => {
      if (itemId.startsWith('task-')) {
        void onUpdateTask(itemId.slice('task-'.length), updates as Partial<Task>)
      }
    }}
  />
))}
```

- [ ] **Step 5: Type-check the file**

Run:
```bash
npx tsc --noEmit
```

Expected: clean (no errors). If TypeScript complains about removed `item` references, ensure every read of `item` inside `WeekEventBlock` was renamed to `placedItem.item` in Task 8.

- [ ] **Step 6: Run all week-view tests**

Run:
```bash
npx vitest run src/components/home/week/
```

Expected: PASS — every test in the week folder passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx
git commit -m "feat(week): WeekViewV2 calls layoutWeekLanes for lane-aware layout"
```

---

## Task 11: Manual verification on dev server

**Files:**
- None modified

- [ ] **Step 1: Start the dev server**

Run:
```bash
npm run dev
```

Expected: Vite starts on `localhost:5173`. Leave it running.

- [ ] **Step 2: Open the Week view in a browser**

Navigate to `http://localhost:5173`, sign in, click **Today** → **Week** in the view switcher.

- [ ] **Step 3: Verify the 7 PM stack now renders side-by-side**

Look at any weekday with multiple 19:00-ish routines (e.g. "Clean kitchen after dinner" + "Put clothes in hamper" if you re-enable the latter via the routine detail). They should appear as two narrower side-by-side blocks within the same day column, both fully readable.

Expected: two distinct rectangles, each ~half the day-column width, no overlap.

- [ ] **Step 4: Verify a non-overlapping day still uses full width**

Look at a day with only one routine at a given hour. It should occupy the full day-column width (minus the 4px gutter) — no lane shrinkage.

- [ ] **Step 5: Verify Workweek view (5-day)**

Click **Workweek** in the view switcher (or, if Workweek is hidden, set `localStorage.setItem('symphony-home-view', 'workweek')` in DevTools and reload). Confirm 5 columns render and that side-by-side lane splitting still works within each day.

- [ ] **Step 6: Stop the dev server**

In the terminal running `npm run dev`, press `Ctrl+C`.

- [ ] **Step 7: No commit needed for manual verification**

If anything looked off, note it as a follow-up task — do not fix mid-plan without spec amendment.

---

## Task 12: Final test sweep + push

**Files:**
- None modified

- [ ] **Step 1: Run the full unit-test suite**

Run:
```bash
npx vitest run
```

Expected: PASS — all tests in the repo pass (no regression in unrelated suites).

- [ ] **Step 2: Run TypeScript**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run ESLint**

Run:
```bash
npm run lint
```

Expected: clean (or only pre-existing warnings — fix any new errors introduced by this work).

- [ ] **Step 4: Push the branch**

Run:
```bash
git push -u origin <branch-name>
```

Expected: branch published. PR URL appears in output.

- [ ] **Step 5: Open the PR**

Run:
```bash
gh pr create --base main --head <branch-name> \
  --title "feat(week): side-by-side lanes for overlapping items" \
  --body "Implements docs/superpowers/specs/2026-05-21-week-overlap-lanes.md. New layoutLanes module assigns overlap clusters to lanes; WeekEventBlock consumes PlacedItem for lane-aware width. Mobile unchanged."
```

Expected: PR opens, URL printed.

---

## Out of scope (do not implement here)

- **+N more overflow pill** when lane count produces sub-40px lane widths. The lane math will still produce sliver-thin blocks if 5+ items overlap on one day — that is acceptable for v1. Add a follow-up issue if it becomes a real problem with Scott's data.
- **Multi-day spanning events.** Currently each item is assigned to its start day; an event spanning Mon→Tue renders only on Mon. Same as today; out of scope.
- **Resize-aware re-layout during in-flight drags.** Resize is feature-flagged off; layout snapshots at render time only.
- **Mobile (`WeekViewMobile.tsx`).** Uses per-day bucketed list; no positional overlap.
- **Routine duration as a first-class user-editable field.** The 30-min default in `getEffectiveEndMin` is shared with `WeekEventBlock.computePlacement`'s existing default; keep them in sync if either changes.

## Self-review notes

- Every step that adds code shows the code.
- Test cases match spec table 1:1 (Tasks 1–7 cover empty, single, non-overlap, two-overlap, three-chain, true-three-concurrent, routines null-end, dayCount=5).
- Cluster-close fallback `cur ? cur.endMin : -Infinity` handles the last-iteration boundary; the loop runs `i = 0..dayItems.length` inclusive so the final cluster gets closed.
- `findIndex(e => e <= entry.startMin)` uses `<=` so an item starting exactly when another ends can share that lane — correct per the spec's "touching = not overlapping" implication.
- `WeekEventBlock.tsx` task 8 renames every `item` → `placedItem.item`; task 9 threads `dayCount`. Existing `useDraggable` / drag id paths unaffected.
- `WeekViewV2.tsx` task 10 splits `allBlocks` into `allItems` + `placedItems`. The drag-mount fallback that preserves out-of-week items (`if (activeId.startsWith('block:')) { ... blocks.push(...) }`) lands in `allItems` so it still flows through the layout pass.

---

**End of plan.**
