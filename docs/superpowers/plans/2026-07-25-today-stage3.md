# Today Stage 3 — Cap, Sweep, Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a long day readable — cap the page with an honest count, let the user sweep duplicates on demand, and tighten the rows to a touch-safe floor.

**Architecture:** Two new pure modules (`lib/today/duplicates.ts`, `lib/today/pageCap.ts`), each unit-tested without a DOM, consumed by `TodaySectionList` and a small `DuplicateSweep` surface. Density is a Tailwind pass over existing rows with a hard 44px mobile floor. No schema change.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md`, moves **#4** (page cap), **#6** (duplicate sweep), **#7** (density). Move **#8** (assistant proposes an order) is explicitly NOT in this plan — see Self-Review.
- **Branch:** `today-stage3`, stacked on `today-drag-gestures` (Stage 2b, unmerged). Worktree `.worktrees/today-drag-gestures`. **Never** edit or commit in the main worktree.
- **Node:** prefix EVERY command, in the same invocation, with:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Never run `npm test`** — watch mode. Always `npx vitest run`.
- **Baseline entering Stage 3:** `tsc` clean · **4016 passed, 3 skipped** · build clean · lint **8 errors**.
- **Walkthroughs hit PRODUCTION data.** Create throwaway rows and act on those. The duplicate sweep DELETES — it is the most dangerous surface in this plan, so its destructive path gets tested against fixtures, never against Scott's day.
- TypeScript strict. `@/` → `src/`. **Lucide icons, never emojis.** Nordic Journal; unlayered CSS beats every Tailwind utility, so overridable defaults belong in `@layer base`.
- `TodayView.tsx` is 996 lines and **must not grow**. New surfaces are their own files.

---

### Task 1: `duplicates.ts` — normalise and pair

**Files:**
- Create: `src/lib/today/duplicates.ts`
- Test: `src/lib/today/duplicates.test.ts`

**Interfaces:**
- Consumes: `TimelineItem`.
- Produces:
  ```typescript
  export function normalizeTitle(title: string): string
  export interface DuplicatePair { key: string; items: TimelineItem[]; keeper: TimelineItem; crossType: boolean }
  export function findDuplicates(items: TimelineItem[]): DuplicatePair[]
  export function contextScore(item: TimelineItem): number
  ```

**The rules, from the spec, none of which may be softened:**
- **Exact normalized matches only.** Lowercase, strip punctuation and emoji, collapse whitespace. Fuzzy matching is excluded on purpose: *a false positive here deletes real work.*
- **The context-richer copy is pre-selected as keeper** — notes, links, attachments, a project. That is almost always the real one; the other is the accident.
- **Cross-type pairs are surfaced but never deleted.** A task and a routine with the same title are a real duplicate to the eye, but deleting the routine is destructive and wrong.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { normalizeTitle, findDuplicates, contextScore } from './duplicates'

const item = (over: Partial<TimelineItem> & { id: string; title: string }): TimelineItem => ({
  type: 'task', startTime: null, endTime: null, completed: false, ...over,
} as TimelineItem)

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeTitle('  Buy   MILK!! ')).toBe('buy milk')
  })
  it('strips emoji', () => {
    expect(normalizeTitle('Buy milk 🥛')).toBe('buy milk')
  })
  it('keeps distinct titles distinct', () => {
    expect(normalizeTitle('Buy milk')).not.toBe(normalizeTitle('Buy bread'))
  })
})

describe('findDuplicates', () => {
  it('pairs exact normalized matches', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'buy  MILK' }),
      item({ id: 'task-3', title: 'Buy bread' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].items.map((i) => i.id).sort()).toEqual(['task-1', 'task-2'])
  })

  it('does NOT pair near-misses — a false positive deletes real work', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: 'Call the dentist' }),
      item({ id: 'task-2', title: 'Call the dentist back' }),
    ])).toEqual([])
  })

  it('pre-selects the context-richer copy as keeper', () => {
    const bare = item({ id: 'task-1', title: 'Buy milk' })
    const rich = item({ id: 'task-2', title: 'Buy milk', notes: 'oat, not skim', projectId: 'p1' })
    expect(findDuplicates([bare, rich])[0].keeper.id).toBe('task-2')
  })

  it('flags a task/routine pair as cross-type', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Water plants' }),
      item({ id: 'routine-r1', title: 'Water plants', type: 'routine' }),
    ])
    expect(pairs[0].crossType).toBe(true)
  })

  it('a same-type pair is not cross-type', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Water plants' }),
      item({ id: 'task-2', title: 'Water plants' }),
    ])
    expect(pairs[0].crossType).toBe(false)
  })

  it('ignores completed items — they are history, not clutter', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'Buy milk', completed: true }),
    ])).toEqual([])
  })

  it('groups three copies into ONE pair, not three', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'Buy milk' }),
      item({ id: 'task-3', title: 'buy milk' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].items).toHaveLength(3)
  })

  it('returns nothing for an empty or single-item day', () => {
    expect(findDuplicates([])).toEqual([])
    expect(findDuplicates([item({ id: 'task-1', title: 'Buy milk' })])).toEqual([])
  })

  it('ignores a blank normalized title rather than pairing every emoji-only row', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: '🎉' }),
      item({ id: 'task-2', title: '!!!' }),
    ])).toEqual([])
  })
})

describe('contextScore', () => {
  it('counts each kind of context once', () => {
    expect(contextScore(item({ id: 'a', title: 'x' }))).toBe(0)
    expect(contextScore(item({ id: 'b', title: 'x', notes: 'n' }))).toBe(1)
    expect(contextScore(item({ id: 'c', title: 'x', notes: 'n', projectId: 'p' }))).toBe(2)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/duplicates.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
import type { TimelineItem } from '@/types/timeline'

/**
 * Finding near-duplicates on Today: prep tasks regenerated from templates, the
 * Reminders bridge, meal upserts, the same errand captured twice on two
 * surfaces. They inflate the row count with things that are not real work.
 *
 * EXACT normalized matches only. Fuzzy matching is excluded deliberately — the
 * resolution offered here deletes, and a false positive deletes real work.
 */

/** Lowercase, strip punctuation and emoji, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** How much context a copy carries. The richer one is almost always the real one. */
export function contextScore(item: TimelineItem): number {
  let score = 0
  if (item.notes) score += 1
  if (item.projectId) score += 1
  if (item.links?.length) score += 1
  if (item.phoneNumber) score += 1
  if (item.contactId) score += 1
  if (item.location) score += 1
  return score
}

export interface DuplicatePair {
  key: string
  items: TimelineItem[]
  /** Pre-selected keeper: the copy carrying the most context. */
  keeper: TimelineItem
  /** True when the group spans types (task + routine). NEVER offer delete. */
  crossType: boolean
}

export function findDuplicates(items: TimelineItem[]): DuplicatePair[] {
  const byKey = new Map<string, TimelineItem[]>()
  for (const item of items) {
    if (item.completed) continue // history, not clutter
    const key = normalizeTitle(item.title)
    if (!key) continue // an emoji-only or punctuation-only title matches everything
    const arr = byKey.get(key) ?? []
    arr.push(item)
    byKey.set(key, arr)
  }

  const pairs: DuplicatePair[] = []
  for (const [key, group] of byKey) {
    if (group.length < 2) continue
    const keeper = [...group].sort((a, b) => contextScore(b) - contextScore(a))[0]
    const crossType = new Set(group.map((i) => i.type)).size > 1
    pairs.push({ key, items: group, keeper, crossType })
  }
  return pairs
}
```

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/duplicates.test.ts && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/duplicates.ts src/lib/today/duplicates.test.ts
git commit -m "feat(today): duplicates.ts — exact normalized pairing only

Fuzzy matching is excluded on purpose: the resolution this feeds deletes, and
a false positive deletes real work. Cross-type groups are flagged so the UI can
refuse to delete a routine. The context-richer copy is pre-selected as keeper."
```

---

### Task 2: `pageCap.ts` — bound the page, state the truth

**Files:**
- Create: `src/lib/today/pageCap.ts`
- Test: `src/lib/today/pageCap.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export const DEFAULT_SECTION_CAP = 8
  export interface CappedSection<T> { visible: T[]; hiddenCount: number }
  export function capItems<T extends { completed: boolean }>(items: T[], cap: number, expanded: boolean): CappedSection<T>
  ```

**The rule that makes this honest:** *"A cap that hides its own truncation is worse than a long page. The count is always visible."* And incomplete work is never what gets hidden first — a cap that buries a to-do behind a done item has inverted the page's purpose.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { capItems, DEFAULT_SECTION_CAP } from './pageCap'

const rows = (n: number, completed = false) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, completed }))

describe('capItems', () => {
  it('passes everything through when under the cap', () => {
    const out = capItems(rows(3), 8, false)
    expect(out.visible).toHaveLength(3)
    expect(out.hiddenCount).toBe(0)
  })

  it('caps and reports exactly how many it hid', () => {
    const out = capItems(rows(20), 8, false)
    expect(out.visible).toHaveLength(8)
    expect(out.hiddenCount).toBe(12)
  })

  it('shows everything when expanded, and reports nothing hidden', () => {
    const out = capItems(rows(20), 8, true)
    expect(out.visible).toHaveLength(20)
    expect(out.hiddenCount).toBe(0)
  })

  it('hides COMPLETED rows before incomplete ones', () => {
    // Burying a to-do behind a done item inverts the point of the page.
    const items = [...rows(6, true), ...rows(6, false).map((r) => ({ ...r, id: 'todo' + r.id }))]
    const out = capItems(items, 6, false)
    expect(out.visible.every((i) => !i.completed)).toBe(true)
    expect(out.hiddenCount).toBe(6)
  })

  it('keeps the original order among what it shows', () => {
    const items = [{ id: 'a', completed: false }, { id: 'b', completed: false }, { id: 'c', completed: false }]
    expect(capItems(items, 2, false).visible.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('treats a cap of 0 or less as no cap rather than an empty page', () => {
    expect(capItems(rows(5), 0, false).visible).toHaveLength(5)
  })

  it('exports a sane default', () => {
    expect(DEFAULT_SECTION_CAP).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/today/pageCap.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
/**
 * Bounding a long section without lying about it.
 *
 * "A cap that hides its own truncation is worse than a long page. The count is
 * always visible." Completed rows are hidden first: burying a to-do behind a
 * done item inverts the point of the page.
 */
export const DEFAULT_SECTION_CAP = 8

export interface CappedSection<T> {
  visible: T[]
  hiddenCount: number
}

export function capItems<T extends { completed: boolean }>(
  items: T[],
  cap: number,
  expanded: boolean,
): CappedSection<T> {
  if (expanded || cap <= 0 || items.length <= cap) {
    return { visible: items, hiddenCount: 0 }
  }
  const incomplete = items.filter((i) => !i.completed)
  const done = items.filter((i) => i.completed)
  // Fill from incomplete first, then top up with completed if there is room.
  const kept = [...incomplete.slice(0, cap), ...done.slice(0, Math.max(0, cap - incomplete.length))]
  const keptIds = new Set(kept)
  // Preserve the caller's ordering rather than the incomplete/done split.
  const visible = items.filter((i) => keptIds.has(i))
  return { visible, hiddenCount: items.length - visible.length }
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/today/pageCap.test.ts && npx tsc -b`

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/pageCap.ts src/lib/today/pageCap.test.ts
git commit -m "feat(today): pageCap.ts — bound a section, always state the count

Completed rows are hidden first; capping away a to-do while a done item stays
visible inverts the point of the page. Ordering is preserved, so a cap never
also reshuffles."
```

---

### Task 3: Wire the cap into the section list

**Files:**
- Modify: `src/components/schedule/TodaySectionList.tsx`
- Test: `src/components/schedule/TodaySectionList.cap.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// Renders TodaySectionList through TodayView's harness (see TodayView.test.tsx
// for the provider setup) with 20 all-day tasks, and asserts:
//   - only DEFAULT_SECTION_CAP rows render
//   - a control reading "+12 more" is present
//   - clicking it reveals the rest and the control disappears
```

Write it against the real component, following `TodayView.test.tsx`'s
`renderView` harness. **Do not assert on a count you did not compute** — derive
the expected hidden count from `DEFAULT_SECTION_CAP`.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

In `TodaySectionList`, per section, after the hero filter:

```tsx
const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set())
// …inside the map, replacing `items.map(...)`:
const { visible, hiddenCount } = capItems(items, DEFAULT_SECTION_CAP, expandedSections.has(key))
```

Render `visible` instead of `items`, and after the trailing insert point:

```tsx
{hiddenCount > 0 && (
  <button
    type="button"
    onClick={() => setExpandedSections((prev) => new Set(prev).add(key))}
    className="w-full text-left px-3 md:px-0 py-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
  >
    +{hiddenCount} more today
  </button>
)}
```

**The section header keeps showing the FULL count**, not the visible one — the
header is where the truth lives, and `itemCount={items.length}` already does
this. Do not change it to `visible.length`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/components/schedule/ && npx tsc -b && npm run lint 2>&1 | tail -3`

- [ ] **Step 5: Look at it on :5173**

Morning currently holds 19 rows. It must render 8 plus a "+11 more today" control, the header must still read "· 19 · 3 done", and clicking must reveal all 19.

- [ ] **Step 6: Commit**

---

### Task 4: The duplicate sweep surface

**Files:**
- Create: `src/components/schedule/DuplicateSweep.tsx`
- Modify: `src/components/schedule/TodayView.tsx` — a stats-row action + passive count
- Test: `src/components/schedule/DuplicateSweep.test.tsx`

**Interfaces:**
- Consumes: `findDuplicates`, `DuplicatePair` (Task 1); `ctx.onDeleteTask`, `ctx.onSkipRoutine`.
- Produces: `export function DuplicateSweep(props: { pairs: DuplicatePair[]; open: boolean; onClose: () => void; onKeepOne: (keepId: string, dropIds: string[]) => void; onSkipRoutineToday: (routineId: string) => void })`

**Rules that must hold in the UI, not just the module:**
- **On demand, not nagging.** A `Find duplicates` action in the stats row plus a passive count when any exist. No auto-prompt — auto-prompting on a page whose whole problem is noise is self-defeating.
- **Resolution is always one tap, never automatic.** Each group offers *keep this one* / *keep both*.
- **A cross-type group offers *skip the routine today*, never delete.**

- [ ] **Step 1: Write the failing tests**

```typescript
// - renders one card per duplicate group, with the keeper pre-selected
// - "Keep both" dismisses the group without calling onKeepOne
// - "Keep this one" calls onKeepOne(keeper.id, [the others])
// - a crossType group renders NO delete affordance, and offers skip-today
// - renders nothing when pairs is empty
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement** the component. Lucide icons only (`Copy`, `Check`, `X`). Nordic Journal card styling.

- [ ] **Step 4: Wire it into `TodayView`** — a `Find duplicates` button in the stats row `endControls`, plus `{dupCount > 0 && <span>{dupCount} possible duplicates</span>}`. Compute `pairs` with a `useMemo` over `data.grouped`.

- [ ] **Step 5: Verify** — `npx tsc -b && npx vitest run && npm run lint`

- [ ] **Step 6: Look at it on :5173 with THROWAWAY rows only.** Create two `zzDup` tasks with the same title, run the sweep, keep one, confirm the other is gone — then delete the survivor. **Never resolve a duplicate among Scott's real tasks.**

- [ ] **Step 7: Commit**

---

### Task 5: Density, with a touch floor

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — row padding
- Modify: `src/components/schedule/TodaySectionList.tsx` — inter-row spacing

**The floor is touch, not taste.** Today is the mobile-primary surface. Rows can
go considerably tighter on desktop, but **~44px stays the minimum tappable
height on mobile**. A blanket reduction improves the desktop and degrades the
phone, so every reduction is `md:`-scoped.

- [ ] **Step 1: Measure before**

On :5173, record the rendered height of a standard row at desktop width and at a
375px-wide viewport. Write both numbers down — "it looks tighter" is not a
measurement.

- [ ] **Step 2: Tighten desktop only**

`ScheduleItem`'s full variant is `px-3 py-2`. Make the vertical padding
responsive: `px-3 py-2 md:py-1.5`. In `TodaySectionList`, `space-y-1` →
`space-y-1 md:space-y-0.5`.

- [ ] **Step 3: Measure after, and check the floor**

Desktop row height must drop. **Mobile row height must not fall below 44px.** If
it does, revert the mobile side — the floor is not negotiable.

- [ ] **Step 4: Verify** — `npx vitest run src/components/schedule/ && npx tsc -b`

- [ ] **Step 5: Commit**, quoting both measurements in the message.

---

### Task 6: Full verification

- [ ] `git fetch origin && git rebase origin/main` (Stage 3 sits on Stage 2b; expect Stage 2b's commits to come along)
- [ ] `npx tsc -b && npx vitest run && npm run build && npm run lint 2>&1 | tail -3`
- [ ] `wc -l src/components/schedule/TodayView.tsx` — must not exceed 996.
- [ ] Walk the spec's Stage 3 verification bullets on :5173 and write the result of each into `docs/superpowers/notes/2026-07-25-stage3-walkthrough.md`, including what was not performed.
- [ ] `git push origin HEAD:today-stage3` — **not `main`**.

---

## Self-Review

**Spec coverage:**

| Spec move | Task |
|---|---|
| #4 cap the page, hidden count always visible | Tasks 2, 3 |
| #4 Unscheduled collapses to one row | Already shipped in Stage 1 (default-collapsed) |
| #4 carried-over keeps its collapsed treatment | Unchanged — `OverdueSection` already does this |
| #6 duplicate sweep, on demand | Tasks 1, 4 |
| #6 exact normalized matches only | Task 1 |
| #6 context-richer copy pre-selected | Task 1 |
| #6 cross-type surfaced, never deleted | Tasks 1, 4 |
| #7 density with a 44px mobile floor | Task 5 |

**Deliberately NOT in this plan — move #8, the assistant's proposed order.**
The spec sequences it last and says why: *"An optimizer needs durations, fixed
anchors and some notion of energy or location to beat a guess."* Stage 2b has
only just made it possible to put real times on things, and **no time has
actually been put on anything yet** — Scott's day is still 27 all-day items. An
optimizer shipped today would reason over the same empty inputs and "produce a
confident-sounding shuffle". It needs a week of real usage first, then its own
plan. Building it now would be building it blind.

**Known risks:**
1. **The sweep deletes.** It is the only destructive surface in this plan. Task 4
   Step 6 forbids exercising it on real data, and cross-type groups can never
   reach a delete at all.
2. **The cap interacts with the drag work.** A capped-away row cannot be a drop
   target. Dropping onto a section whose overflow is collapsed is fine (the band
   is still a target), but reorder indices are computed against the FULL list
   while the gaps rendered are only for visible rows — Task 3 must pass the
   uncapped `items` length to the trailing gap's index, not `visible.length`.
3. **Density is the most subjective task here** and the easiest to get wrong on a
   phone. Hence measuring rather than eyeballing.

**Type consistency:** `DuplicatePair` is defined in Task 1 and consumed unchanged
by Task 4. `CappedSection`/`capItems` are defined in Task 2 and used only in
Task 3. Neither module imports the other.
