# Today: Five Day Divisions + Collapsible Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Today five honest day divisions (early morning, morning, afternoon, evening, night) whose printed labels match the code that buckets into them, and make all seven sections collapsible with state that survives reload.

**Architecture:** One exported boundary table (`DAY_SECTION_BOUNDS`) becomes the single source for both bucketing logic and displayed labels, so they cannot drift apart again. `DaySection` gains two members; `TimeOfDay` is deliberately **not** widened — the codebase already treats ambience-time (`wallBackground.ts`'s own 7-value local type) as a separate concept from item bucketing. Collapse state moves into its own persisted module modelled on `hideRoutinesSignal.ts`, and the section-rendering loop is lifted out of `TodayView.tsx` into `DaySectionGroup.tsx` so that file shrinks rather than grows.

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, Tailwind v4 (Nordic Journal), Vite 7.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md` (Stage 1 = moves #5 collapse/divisions only; no drag, no migration, no duplicate sweep).
- **Worktree:** `.worktrees/today-time`, branch `today-what-time`. **Never** edit or commit in the main worktree.
- **Tests:** `npx vitest run` — **never `npm test`** (watch mode). Node 22.14.0.
- **Lint baseline:** 8 pre-existing errors. Confirm the count is unchanged before blaming your work.
- **Test baseline before starting:** 3,966 passing.
- **Icons:** lucide-react only. **No emojis** — standing UI rule.
- **Type-checks are not inspection.** Six UI defects shipped green under `tsc` on 2026-07-25. Open port 5173 and look.
- **Dev server must be port 5173** — the browser session is bound to that origin. Do not sign in as Scott.
- **`TodayView.tsx` is ~1199 lines and must not grow.** Task 6 removes more than it adds.
- **Do not widen `TimeOfDay`.** Only `DaySection` gains members.

**The boundary table — the single source of truth used by every task:**

| Section | Hours | Label | Range shown |
|---|---|---|---|
| `earlyMorning` | 0–7 | Early morning | `Before 8:00 AM` |
| `morning` | 8–11 | Morning | `8:00 AM – 12:00 PM` |
| `afternoon` | 12–16 | Afternoon | `12:00 PM – 5:00 PM` |
| `evening` | 17–20 | Evening | `5:00 PM – 9:00 PM` |
| `night` | 21–23 | Night | `After 9:00 PM` |

Bands do not wrap midnight — see the spec for why (strict chronology beats naming purity).

**Section order:** `allday`, `earlyMorning`, `morning`, `afternoon`, `evening`, `night`, `unscheduled`.

---

### Task 1: The boundary table and five-way bucketing

**Files:**
- Modify: `src/lib/timeUtils.ts:3-4` (types), `:228-233` (`getTimeOfDay`), `:264-277` (`getDaySection`), `:299-326` (`groupByDaySection`), `getDaySectionLabel`
- Test: `src/lib/timeUtils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type DaySection = 'allday' | 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'unscheduled'`
  - `export type TimeOfDay = 'morning' | 'afternoon' | 'evening'` — **unchanged**
  - `export interface DaySectionBound { section: DaySection; startHour: number; endHour: number; label: string; range: string }`
  - `export const DAY_SECTION_BOUNDS: DaySectionBound[]` — the five timed bands, in order
  - `export function getSectionForHour(hour: number): DaySection`
  - `getDaySection`, `getDaySectionLabel`, `groupByDaySection` — same signatures, new behaviour

- [ ] **Step 1: Write the failing test**

Add to `src/lib/timeUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getSectionForHour,
  getDaySectionLabel,
  DAY_SECTION_BOUNDS,
  type DaySection,
} from '@/lib/timeUtils'

describe('day section boundaries', () => {
  // Every boundary hour maps to the band its own label claims.
  const cases: [number, DaySection][] = [
    [0, 'earlyMorning'], [3, 'earlyMorning'], [7, 'earlyMorning'],
    [8, 'morning'], [11, 'morning'],
    [12, 'afternoon'], [16, 'afternoon'],
    [17, 'evening'], [20, 'evening'],
    [21, 'night'], [23, 'night'],
  ]
  it.each(cases)('hour %i is in %s', (hour, section) => {
    expect(getSectionForHour(hour)).toBe(section)
  })

  it('covers all 24 hours with no gaps or overlaps', () => {
    for (let h = 0; h < 24; h++) {
      const matches = DAY_SECTION_BOUNDS.filter(b => h >= b.startHour && h <= b.endHour)
      expect(matches, `hour ${h}`).toHaveLength(1)
    }
  })

  it('labels every section', () => {
    const all: DaySection[] = ['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled']
    for (const s of all) expect(getDaySectionLabel(s)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timeUtils.test.ts`
Expected: FAIL — `getSectionForHour` and `DAY_SECTION_BOUNDS` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/timeUtils.ts`, replace the type declarations at lines 3-4:

```typescript
/** Ambience only ("This Morning" in FocusMode). Deliberately NOT widened:
 *  wallBackground.ts already keeps its own richer local time-of-day type,
 *  because "what does the sky look like" is a different question from
 *  "which band does this item render in". */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export type DaySection =
  | 'allday'
  | 'earlyMorning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'unscheduled'

export interface DaySectionBound {
  section: DaySection
  /** Inclusive. */
  startHour: number
  /** Inclusive. */
  endHour: number
  label: string
  /** Human window shown in the header. Must describe startHour..endHour truthfully. */
  range: string
}

/**
 * THE single source of truth for both bucketing and displayed labels.
 *
 * Before this table, `getTimeOfDay` and `daySectionMeta.RANGE` disagreed on
 * every band: Morning's header read "6:00 AM" while the code took everything
 * under hour 12; Afternoon claimed to end at 5 but ran to 17:59; Evening was
 * wrong at both ends. Derive both from here so they cannot drift again.
 *
 * Bands do not wrap midnight — a 2 AM item belongs at the TOP of a
 * chronological page, not the bottom.
 */
export const DAY_SECTION_BOUNDS: DaySectionBound[] = [
  { section: 'earlyMorning', startHour: 0,  endHour: 7,  label: 'Early morning', range: 'Before 8:00 AM' },
  { section: 'morning',      startHour: 8,  endHour: 11, label: 'Morning',       range: '8:00 AM – 12:00 PM' },
  { section: 'afternoon',    startHour: 12, endHour: 16, label: 'Afternoon',     range: '12:00 PM – 5:00 PM' },
  { section: 'evening',      startHour: 17, endHour: 20, label: 'Evening',       range: '5:00 PM – 9:00 PM' },
  { section: 'night',        startHour: 21, endHour: 23, label: 'Night',         range: 'After 9:00 PM' },
]

export function getSectionForHour(hour: number): DaySection {
  const bound = DAY_SECTION_BOUNDS.find(b => hour >= b.startHour && hour <= b.endHour)
  return bound ? bound.section : 'earlyMorning'
}
```

Leave `getTimeOfDay` (line ~228) exactly as it is — `FocusMode` depends on its three-way result.

Replace the final line of `getDaySection` (currently `return getTimeOfDay(item.startTime)`):

```typescript
  return getSectionForHour(item.startTime.getHours())
```

Replace `getDaySectionLabel` entirely:

```typescript
export function getDaySectionLabel(section: DaySection): string {
  switch (section) {
    case 'allday': return 'All Day'
    case 'unscheduled': return 'Unscheduled'
    default: {
      const bound = DAY_SECTION_BOUNDS.find(b => b.section === section)
      return bound ? bound.label : 'Unscheduled'
    }
  }
}
```

Replace the `groups` object and the sort block in `groupByDaySection`:

```typescript
  const groups: Record<DaySection, TimelineItem[]> = {
    allday: [],
    earlyMorning: [],
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
    unscheduled: [],
  }
```

and, after the loop, replace the three per-section sorts with:

```typescript
  // All-day has no times to sort by, so it reads alphabetically.
  groups.allday.sort((a, b) => a.title.localeCompare(b.title))
  for (const { section } of DAY_SECTION_BOUNDS) groups[section].sort(sortByTime)
```

**Note on meal inference:** `MEAL_TIME_INFERENCE` maps to `TimeOfDay` values (`morning`/`afternoon`/`evening`) which all remain valid `DaySection` members — breakfast at hour 8 still lands in `morning`, dinner at 18:30 still lands in `evening`. No change needed there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/timeUtils.test.ts`
Expected: PASS.

Then: `npx vitest run src/lib/`
Expected: failures in `daySectionMeta.test.tsx`, `today/types.test.ts`, `today/grouping.test.ts` — those are Tasks 2 and 3. Note which fail; do not fix them here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeUtils.ts src/lib/timeUtils.test.ts
git commit -m "feat(today): one boundary table for five day divisions

getTimeOfDay and daySectionMeta.RANGE disagreed on every band. Both now derive
from DAY_SECTION_BOUNDS, and a test asserts every boundary hour maps to the band
its own label claims. TimeOfDay stays three-valued for ambience."
```

---

### Task 2: Labels, ranges and icons from the same table

**Files:**
- Modify: `src/lib/daySectionMeta.tsx`
- Test: `src/lib/daySectionMeta.test.tsx`

**Interfaces:**
- Consumes: `DAY_SECTION_BOUNDS`, `DaySection`, `getDaySectionLabel` from Task 1.
- Produces: `daySectionMeta(section: DaySection): { label: string; range: string; Icon: LucideIcon }` — unchanged signature.

- [ ] **Step 1: Write the failing test**

Replace the body of `src/lib/daySectionMeta.test.tsx` with:

```typescript
import { describe, it, expect } from 'vitest'
import { daySectionMeta } from '@/lib/daySectionMeta'
import { DAY_SECTION_BOUNDS } from '@/lib/timeUtils'

describe('daySectionMeta', () => {
  it('takes its range verbatim from the boundary table', () => {
    for (const bound of DAY_SECTION_BOUNDS) {
      expect(daySectionMeta(bound.section).range).toBe(bound.range)
      expect(daySectionMeta(bound.section).label).toBe(bound.label)
    }
  })

  it('gives the two untimed sections no range', () => {
    expect(daySectionMeta('allday').range).toBe('')
    expect(daySectionMeta('unscheduled').range).toBe('')
  })

  it('gives every section an icon', () => {
    for (const s of ['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled'] as const) {
      expect(daySectionMeta(s).Icon).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/daySectionMeta.test.tsx`
Expected: FAIL — `RANGE` has no `earlyMorning`/`night` keys, so `Record<DaySection, string>` no longer type-checks and the ranges don't match the table.

- [ ] **Step 3: Write the implementation**

Replace `src/lib/daySectionMeta.tsx` entirely:

```tsx
import { Sunrise, Sun, Sunset, Moon, MoonStar, Clock, Inbox, type LucideIcon } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel, DAY_SECTION_BOUNDS } from '@/lib/timeUtils'

export interface DaySectionMeta {
  label: string
  /** Human time window, '' for sections without one. */
  range: string
  Icon: LucideIcon
}

/** Ranges come from the boundary table so a header can never claim a window
 *  the bucketing code doesn't implement. */
const RANGE: Record<DaySection, string> = {
  allday: '',
  unscheduled: '',
  earlyMorning: '',
  morning: '',
  afternoon: '',
  evening: '',
  night: '',
}
for (const bound of DAY_SECTION_BOUNDS) RANGE[bound.section] = bound.range

const ICON: Record<DaySection, LucideIcon> = {
  allday: Clock,
  earlyMorning: Sunrise,
  morning: Sun,
  afternoon: Sun,
  evening: Sunset,
  night: MoonStar,
  unscheduled: Inbox,
}

// `Moon` is retained in the import list only if used; remove it if not.

export function daySectionMeta(section: DaySection): DaySectionMeta {
  return { label: getDaySectionLabel(section), range: RANGE[section], Icon: ICON[section] }
}
```

Then delete the unused `Moon` import if lint flags it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/daySectionMeta.test.tsx && npx eslint src/lib/daySectionMeta.tsx`
Expected: PASS, no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/daySectionMeta.tsx src/lib/daySectionMeta.test.tsx
git commit -m "feat(today): section labels and ranges derive from the boundary table"
```

---

### Task 3: Section order and the empty-data shape

**Files:**
- Modify: `src/lib/today/types.ts:62`, `:68-77`
- Test: `src/lib/today/types.test.ts`

**Interfaces:**
- Consumes: `DaySection`, `DAY_SECTION_BOUNDS` from Task 1.
- Produces: `SECTIONS_ORDER: DaySection[]` (7 entries), `EMPTY_TODAY_DATA` with all 7 keys.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/today/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SECTIONS_ORDER, EMPTY_TODAY_DATA } from '@/lib/today/types'

describe('SECTIONS_ORDER', () => {
  it('runs all-day, then chronologically, then unscheduled', () => {
    expect(SECTIONS_ORDER).toEqual([
      'allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled',
    ])
  })

  it('EMPTY_TODAY_DATA has a bucket for every section', () => {
    for (const s of SECTIONS_ORDER) {
      expect(EMPTY_TODAY_DATA.grouped[s], s).toEqual([])
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/types.test.ts`
Expected: FAIL — order has 5 entries, `grouped` is missing two keys.

- [ ] **Step 3: Write the implementation**

In `src/lib/today/types.ts`, replace line 62:

```typescript
export const SECTIONS_ORDER: DaySection[] = [
  'allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled',
]
```

and inside `EMPTY_TODAY_DATA` replace the `grouped` line:

```typescript
  grouped: {
    allday: [], earlyMorning: [], morning: [], afternoon: [], evening: [], night: [], unscheduled: [],
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/today/ && npx tsc -b`
Expected: `types.test.ts` and `grouping.test.ts` PASS. `tsc` now reports errors in the consumer files handled by Task 4 — record that list; it is Task 4's worklist.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/types.ts src/lib/today/types.test.ts
git commit -m "feat(today): seven sections in chronological order"
```

---

### Task 4: Bring every other `Record<DaySection, …>` consumer back to green

**Files:**
- Modify: `src/components/triage/TimePickerPopover.tsx:57-58`, `:80`, `:87`
- Modify: `src/components/triage/SchedulePopover.tsx:102-103`, `:138`
- Modify: `src/components/wall/today/todayItem.ts:29`
- Modify: `src/components/wall/now/buildDayGrid.ts:47`
- Modify: `src/components/wall-v2/WallV2NowNext.tsx:25`
- Modify: `src/hooks/useWallData.ts:41`
- Delete: `src/components/schedule/TimeGroup.tsx` (dead — no importers)
- Test: existing suites for each, plus `src/components/wall/now/buildDayGrid.test.ts`

**Interfaces:**
- Consumes: the widened `DaySection` from Task 1, `SECTIONS_ORDER` from Task 3.
- Produces: no new exports. **Behaviour must be visually unchanged** on the wall and in both pickers.

**Containment rule for this task:** the wall and the triage pickers **fold** the two new sections into their existing three-band display — `earlyMorning` renders with `morning`, `night` renders with `evening`. Stage 1 does not redesign the kitchen wall (a shipped, family-facing surface with its own design pass and skill). Leave a comment saying so at each fold site.

- [ ] **Step 1: Confirm the failing surface**

Run: `npx tsc -b`
Expected: errors in exactly the files listed above — each a `Record<DaySection, …>` missing the `earlyMorning` and `night` keys.

- [ ] **Step 2: Delete the dead file and verify nothing imports it**

```bash
grep -rn "TimeGroup" src/ --include=*.tsx --include=*.ts | grep -v "TimeGroup.tsx"
```
Expected: no output. Then:
```bash
git rm src/components/schedule/TimeGroup.tsx
```

- [ ] **Step 3: Fix the two triage pickers**

Both files declare their own local `getTimeOfDay` returning three values, and group into a `Record<DaySection, …>`. They only need the two new keys present so the Record type-checks; nothing routes into them because the local functions still return three values.

In `src/components/triage/TimePickerPopover.tsx`, in `groupItemsBySection` (line ~58):

```typescript
  const groups: Record<DaySection, ScheduleContextItem[]> = {
    allday: [], morning: [], afternoon: [], evening: [], unscheduled: [],
    // Today's five-band split doesn't apply here: this popover keeps its own
    // three-way local getTimeOfDay, so these two never receive items.
    earlyMorning: [], night: [],
  }
```

Add to `SECTION_LABELS` (line ~80): `earlyMorning: 'Early morning', night: 'Night',`
Add to `SECTION_DEFAULT_TIMES` (line ~87): `earlyMorning: 7, night: 21,`

In `src/components/triage/SchedulePopover.tsx`, apply the same two additions to `groups` (line ~103) and `SECTION_LABELS` (line ~138), with the same comment.

- [ ] **Step 4: Fix the wall consumers**

`src/hooks/useWallData.ts:41` and `src/components/wall/today/todayItem.ts:29` type a `Record<DaySection, TimelineItem[]>` that is populated by `groupByDaySection`, so they now receive seven keys automatically — they need no change unless `tsc` says otherwise. If a literal is constructed there, add `earlyMorning: []` and `night: []`.

`src/components/wall/now/buildDayGrid.ts:47` — the wall folds, it does not gain bands:

```typescript
// The wall keeps its three-band face. Today's earlyMorning/night fold into the
// neighbours so this family-facing surface is visually unchanged by the Today
// split; revisit in a dedicated wall pass (see kiosk-design skill).
const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']
const FOLD_INTO: Partial<Record<DaySection, DaySection>> = {
  earlyMorning: 'morning',
  night: 'evening',
}
```

Then, wherever this file reads `sections[s]` for `s` of `SECTION_ORDER`, concatenate any folded source:

```typescript
function itemsFor(sections: Record<DaySection, TimelineItem[]>, s: DaySection): TimelineItem[] {
  const folded = (Object.keys(FOLD_INTO) as DaySection[]).filter(k => FOLD_INTO[k] === s)
  return [...sections[s], ...folded.flatMap(k => sections[k])]
}
```

`src/components/wall-v2/WallV2NowNext.tsx:25` — same intent, one line:

```typescript
// earlyMorning/night included so nothing silently disappears from the wall.
const TIMED_SECTIONS: DaySection[] = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night']
```

- [ ] **Step 5: Verify green and nothing vanished from the wall**

Run: `npx tsc -b && npx vitest run`
Expected: `tsc` clean; the full suite passes. If `buildDayGrid.test.ts` or the wall-v2 suites fail, the fold is dropping items — fix the fold, do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: consumers absorb the two new day sections without changing face

The kitchen wall and both triage pickers fold earlyMorning/night into their
existing bands, so a family-facing surface is untouched by the Today split.
Deletes TimeGroup.tsx, which had no importers."
```

---

### Task 5: Persisted collapse state

**Files:**
- Create: `src/lib/today/sectionCollapse.ts`
- Test: `src/lib/today/sectionCollapse.test.ts`

**Interfaces:**
- Consumes: `DaySection` from Task 1.
- Produces:
  - `readCollapsed(): Set<string>`
  - `writeCollapsed(next: Set<string>): void`
  - `toggleCollapsed(key: string): Set<string>` — reads, flips, writes, returns the new set
  - `onCollapsedChange(cb: (value: Set<string>) => void): () => void`
  - `sectionKey(section: DaySection): string` and `groupKey(wrapperId: string): string` — namespacing so Stage 2's group collapse reuses this module without a second storage key.

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/sectionCollapse.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readCollapsed, writeCollapsed, toggleCollapsed,
  onCollapsedChange, sectionKey, groupKey,
} from '@/lib/today/sectionCollapse'

describe('sectionCollapse', () => {
  beforeEach(() => localStorage.clear())

  it('starts with Unscheduled collapsed — it is the slab', () => {
    expect(readCollapsed().has(sectionKey('unscheduled'))).toBe(true)
  })

  it('round-trips through localStorage', () => {
    writeCollapsed(new Set([sectionKey('evening')]))
    expect(readCollapsed().has(sectionKey('evening'))).toBe(true)
    expect(readCollapsed().has(sectionKey('morning'))).toBe(false)
  })

  it('toggle flips and persists', () => {
    const after = toggleCollapsed(sectionKey('morning'))
    expect(after.has(sectionKey('morning'))).toBe(true)
    expect(readCollapsed().has(sectionKey('morning'))).toBe(true)
    toggleCollapsed(sectionKey('morning'))
    expect(readCollapsed().has(sectionKey('morning'))).toBe(false)
  })

  it('namespaces sections and groups so they cannot collide', () => {
    expect(sectionKey('morning')).not.toBe(groupKey('morning'))
  })

  it('notifies subscribers in the same tab', () => {
    const cb = vi.fn()
    const off = onCollapsedChange(cb)
    toggleCollapsed(sectionKey('night'))
    expect(cb).toHaveBeenCalled()
    off()
  })

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('nope') })
    expect(() => readCollapsed()).not.toThrow()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/sectionCollapse.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/today/sectionCollapse.ts`:

```typescript
import type { DaySection } from '@/lib/timeUtils'

/**
 * Which Today sections (and, from Stage 2, which groups) the user has folded
 * shut. Persisted so a collapse survives reload.
 *
 * Modelled on lib/hideRoutinesSignal.ts: native 'storage' events don't fire in
 * the tab that wrote the value, so we dispatch an in-tab custom event too.
 *
 * Per-device by design — a view preference, not user data. If cross-device
 * collapse is ever wanted, move it to a column then.
 */
const KEY = 'symphony-today-collapsed'
const EVENT = 'symphony-today-collapsed-changed'

/** Unscheduled holds the untimed-routine slab (21 rows on a normal Saturday),
 *  so it opens folded. Everything else opens as the user left it. */
const DEFAULT_COLLAPSED = ['section:unscheduled']

export function sectionKey(section: DaySection): string {
  return `section:${section}`
}

export function groupKey(wrapperId: string): string {
  return `group:${wrapperId}`
}

export function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return new Set(DEFAULT_COLLAPSED)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLLAPSED)
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set(DEFAULT_COLLAPSED)
  }
}

export function writeCollapsed(next: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { value: next } }))
  } catch { /* localStorage unavailable — silent fail, same as hideRoutinesSignal */ }
}

export function toggleCollapsed(key: string): Set<string> {
  const next = readCollapsed()
  if (next.has(key)) next.delete(key)
  else next.add(key)
  writeCollapsed(next)
  return next
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onCollapsedChange(cb: (value: Set<string>) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ value: Set<string> }>).detail
    cb(detail?.value ?? readCollapsed())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readCollapsed())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/today/sectionCollapse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/sectionCollapse.ts src/lib/today/sectionCollapse.test.ts
git commit -m "feat(today): persisted collapse state, namespaced for sections and groups"
```

---

### Task 6: Lift the section loop out of TodayView and wire collapse

**Files:**
- Create: `src/components/schedule/DaySectionHeader.tsx`
- Test: `src/components/schedule/DaySectionHeader.test.tsx`
- Modify: `src/components/schedule/TodayView.tsx:313-320` (state), `:747-806+` (the loop)

**Interfaces:**
- Consumes: `daySectionMeta` (Task 2), `sectionKey`/`toggleCollapsed`/`readCollapsed`/`onCollapsedChange` (Task 5).
- Produces:
  ```typescript
  export interface DaySectionHeaderProps {
    section: DaySection
    /** Items remaining after the Up Next hero is lifted out. */
    itemCount: number
    completedCount: number
    collapsed: boolean
    /** True when the section's only item was lifted into the hero. */
    emptyBecauseHero: boolean
    onToggle: () => void
  }
  export function DaySectionHeader(props: DaySectionHeaderProps): JSX.Element
  ```

**This task must make `TodayView.tsx` shorter.** Record `wc -l` before and after; if it grew, the header extraction was not complete.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/DaySectionHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DaySectionHeader } from '@/components/schedule/DaySectionHeader'

describe('DaySectionHeader', () => {
  it('shows the label and its true range', () => {
    render(<DaySectionHeader section="evening" itemCount={3} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByText('5:00 PM – 9:00 PM')).toBeInTheDocument()
  })

  it('keeps count and progress visible when collapsed', () => {
    render(<DaySectionHeader section="morning" itemCount={5} completedCount={2}
      collapsed emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
    expect(screen.getByText(/2 done/)).toBeInTheDocument()
  })

  it('reports its collapsed state to assistive tech', () => {
    const { rerender } = render(<DaySectionHeader section="night" itemCount={1} completedCount={0}
      collapsed emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    rerender(<DaySectionHeader section="night" itemCount={1} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles on click', async () => {
    const onToggle = vi.fn()
    render(<DaySectionHeader section="afternoon" itemCount={2} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is inert when the section is empty only because of the hero', () => {
    render(<DaySectionHeader section="morning" itemCount={0} completedCount={0}
      collapsed={false} emptyBecauseHero onToggle={() => {}} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/up next/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/DaySectionHeader.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

Create `src/components/schedule/DaySectionHeader.tsx`:

```tsx
import { createElement } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'

export interface DaySectionHeaderProps {
  section: DaySection
  /** Items remaining after the Up Next hero is lifted out. */
  itemCount: number
  completedCount: number
  collapsed: boolean
  /** True when the section's only item was lifted into the hero. */
  emptyBecauseHero: boolean
  onToggle: () => void
}

/**
 * One section header for Today. Extracted from TodayView so the day list stops
 * carrying its own chrome.
 *
 * Collapsing must never hide completion state — the count and "N done" stay on
 * the row, same honesty rule as the page cap.
 */
export function DaySectionHeader({
  section, itemCount, completedCount, collapsed, emptyBecauseHero, onToggle,
}: DaySectionHeaderProps) {
  const meta = daySectionMeta(section)
  const allDone = itemCount > 0 && completedCount === itemCount

  return (
    <button
      type="button"
      onClick={emptyBecauseHero ? undefined : onToggle}
      disabled={emptyBecauseHero}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${meta.label}`}
      className={`w-full flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 px-3 md:px-0 py-0.5 text-left ${
        emptyBecauseHero ? 'cursor-default' : 'hover:text-neutral-600 transition-colors'
      }`}
    >
      {createElement(meta.Icon, {
        className: `w-4 h-4 shrink-0 ${collapsed ? 'text-amber-500/60' : 'text-amber-500'}`,
      })}
      <span>{meta.label}</span>
      {meta.range && (
        <span className="text-neutral-300 normal-case font-normal">{meta.range}</span>
      )}

      {emptyBecauseHero ? (
        <span className="text-primary-600/70 normal-case font-normal">· up next</span>
      ) : (
        <span className="text-neutral-400 normal-case font-normal tabular-nums">
          · {itemCount}
          {completedCount > 0 && (
            <span className="text-primary-600/70"> · {completedCount} done</span>
          )}
          {allDone && <span className="text-primary-600/70"> · complete</span>}
        </span>
      )}

      {!emptyBecauseHero && (
        collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-neutral-300" />
          : <ChevronDown className="w-3.5 h-3.5 text-neutral-300" />
      )}
    </button>
  )
}
```

- [ ] **Step 4: Run the component test**

Run: `npx vitest run src/components/schedule/DaySectionHeader.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit the component before touching TodayView**

```bash
git add src/components/schedule/DaySectionHeader.tsx src/components/schedule/DaySectionHeader.test.tsx
git commit -m "feat(today): extract DaySectionHeader with count and progress"
```

- [ ] **Step 6: Record TodayView's size, then rewire it**

```bash
wc -l src/components/schedule/TodayView.tsx   # note this number
```

Replace the state block at `TodayView.tsx:313-320`. The old `expandedSections` tracked re-expansions of auto-collapsed complete sections; the new state is the inverse and persisted, so **explicit collapse and auto-collapse become one mechanism** rather than two:

```tsx
// Which sections the user has folded shut. Persisted; Unscheduled starts
// collapsed because it holds the untimed-routine slab. A section whose
// remaining items are all complete also renders collapsed unless the user
// has explicitly opened it — one mechanism, not two.
const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => readCollapsed())
const [openedByUser, setOpenedByUser] = useState<Set<string>>(new Set())
useEffect(() => onCollapsedChange(setCollapsedKeys), [])
const toggleSection = useCallback((section: DaySection) => {
  const key = sectionKey(section)
  setCollapsedKeys(toggleCollapsed(key))
  setOpenedByUser((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}, [])
```

Add the imports:

```tsx
import { readCollapsed, toggleCollapsed, onCollapsedChange, sectionKey } from '@/lib/today/sectionCollapse'
import { DaySectionHeader } from '@/components/schedule/DaySectionHeader'
```

Then replace the whole block from line 747 (`{data.sectionsOrder.map((section) => {`) through the end of the two `<h3>` headers (~line 820) with:

```tsx
{data.sectionsOrder.map((section) => {
  const allSectionItems = data.grouped[section]
  if (!allSectionItems || allSectionItems.length === 0) return null

  // The hero item is lifted out of its section.
  const items = upNextId
    ? allSectionItems.filter((i) => i.id !== upNextId)
    : allSectionItems
  const completedCount = items.filter((i) => i.completed).length
  const restAllDone = items.length > 0 && completedCount === items.length
  const emptyBecauseHero = items.length === 0
  const key = sectionKey(section)

  // Collapsed when explicitly folded, or auto-folded because everything in
  // it is done and the user hasn't opened it.
  const collapsed = emptyBecauseHero
    || collapsedKeys.has(key)
    || (restAllDone && !openedByUser.has(key))

  return (
    <section key={section}>
      <DaySectionHeader
        section={section}
        itemCount={items.length}
        completedCount={completedCount}
        collapsed={collapsed}
        emptyBecauseHero={emptyBecauseHero}
        onToggle={() => toggleSection(section)}
      />
      {!collapsed && (
        <>
```

…and close that fragment (`</>\n      )}`) immediately before the existing `</section>` that ends the loop body, leaving every row-rendering branch inside it untouched.

**Do not change** the `EveningMealCard` / `RoutineCollectionRow` / `ScheduleItem` / `TimelineInsertPoint` rendering inside the loop. Only the header and the collapse gate change.

- [ ] **Step 7: Verify TodayView shrank and everything still passes**

```bash
wc -l src/components/schedule/TodayView.tsx   # MUST be lower than Step 6
npx vitest run src/components/schedule/
npx tsc -b
```

Expected: the file is shorter; suites pass. `TodayView.test.tsx` assertions about the old collapsed-header markup will need updating to the new `DaySectionHeader` output — update the assertions, do not weaken them.

- [ ] **Step 8: Full verification**

```bash
npx tsc -b && npx vitest run && npm run build && npm run lint
```

Expected: `tsc` clean; suite green; build clean; lint at **8 pre-existing errors, no more**.

- [ ] **Step 9: Look at it — type-checks are not inspection**

```bash
pkill -f vite; rm -rf node_modules/.vite; npm run dev
```

On **port 5173**, open Today and confirm by eye:
- Seven sections in order: All day, Early morning, Morning, Afternoon, Evening, Night, Unscheduled.
- Unscheduled starts **collapsed**, showing its count — the ~21-row slab is one row.
- Each header's printed range matches where items actually land. Spot-check an item near a boundary (something at 5:00–5:59 PM must be under Evening, not Afternoon).
- Collapse two sections, reload the page: still collapsed.
- The kitchen wall view is visually unchanged.

- [ ] **Step 10: Commit and push**

```bash
git add -A
git commit -m "feat(today): all seven sections collapse, and the state survives reload

Explicit collapse and the existing all-complete auto-collapse become one
mechanism. Unscheduled opens folded because it holds the untimed-routine slab.
Section chrome moves out of TodayView, which is now shorter than before."
git push
```

---

## Self-Review

**Spec coverage (Stage 1 scope only):**
- Five divisions with honest labels → Tasks 1, 2
- One shared boundary table so labels/logic can't drift → Task 1, enforced by the Task 2 test
- Boundary test asserting every hour maps to its own label's band → Task 1
- No midnight wrapping → encoded in `DAY_SECTION_BOUNDS`; the 24-hour coverage test proves no gaps/overlaps
- All seven sections collapsible → Tasks 5, 6
- Persistence modelled on `hideRoutinesSignal.ts` → Task 5
- Extends existing all-complete collapse rather than duplicating → Task 6, Step 6
- Collapsed sections keep count and progress → Task 6 component + test
- Unscheduled defaults collapsed → Task 5 `DEFAULT_COLLAPSED`
- `TodayView.tsx` must not grow → Task 6 Steps 6 and 7 measure it

**Deferred to Stage 2 by design, not omission:** empty bands materializing during a drag (needs the DnD context), group collapse (the `groupKey` namespace exists ready for it), the page cap, the duplicate sweep.

**Type consistency:** `DaySection` gains exactly `earlyMorning` and `night` in Task 1 and every later task uses those spellings (camelCase `earlyMorning`, not `early-morning`). `sectionKey`/`groupKey`/`toggleCollapsed`/`readCollapsed`/`onCollapsedChange` are defined in Task 5 and consumed with those exact names in Task 6. `daySectionMeta` keeps its Task 2 signature where Task 6 calls it.

**Known test debt:** every suite asserting three bands, old `getTimeOfDay` boundaries, or `SECTIONS_ORDER.length` fails until updated — Tasks 3 and 4 handle the library ones, Task 6 Step 7 the component ones. That is the change working, not a regression.
