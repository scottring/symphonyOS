# Wall Schedule Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the `wall-v2` kiosk, pull timed commitments (calendar events + tasks with a real scheduled time) into a prioritized "Schedule" band at the top of the center column, and demote routines + untimed tasks + carried-over into the "Home rhythm" zone below.

**Architecture:** A new pure adapter `adaptScheduleBand` produces the timed agenda; the existing `adaptTimelineSections` is narrowed to emit only rhythm + carried-over (it filters out events and timed tasks, and the dinner-promotion block moves into the band). A new `WallV2ScheduleBand` component renders the band; `WallV2Timeline` renders band-then-rhythm in one scroll container. `WallV2Shell` computes the band and passes it through.

**Tech Stack:** React 19 + TypeScript (strict), Vitest, Tailwind v4. Path alias `@/` → `src/`.

**Split rule:** An item is a commitment (→ Schedule band) iff `startTime != null && !allDay` AND `type` is `'event'` or `'task'`. Routines NEVER enter the band. All-day events go to the band's "All day" strip. Everything else (routines incl. timed, untimed tasks, all-day tasks, carried-over) stays in rhythm.

---

### Task 1: Add `time` field and band data type

**Files:**
- Modify: `src/components/wall-v2/types.ts`

- [ ] **Step 1: Add `time` to `WallV2TimelineEvent`**

In `src/components/wall-v2/types.ts`, inside `interface WallV2TimelineEvent`, after the `completed?: boolean;` field (around line 68), add:

```typescript
  /** Formatted clock time ("2:00 PM") for the Schedule band's left gutter. Only set by adaptScheduleBand. */
  time?: string;
```

- [ ] **Step 2: Add the band data interface**

At the end of `src/components/wall-v2/types.ts`, after the `WallV2ActionDef` interface, add:

```typescript
/** The prioritized timed-agenda band: all-day commitments + chronological timed rows. */
export interface WallV2ScheduleBandData {
  /** All-day calendar events ("Mia field trip"), shown in a small strip at the top. */
  allDay: WallV2TimelineEvent[];
  /** Timed commitments (events + timed tasks + dinner), sorted ascending by start time. */
  timed: WallV2TimelineEvent[];
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/types.ts
git commit -m "feat(wall): add time field + WallV2ScheduleBandData type"
```

---

### Task 2: `adaptScheduleBand` adapter (TDD)

**Files:**
- Modify: `src/components/wall-v2/wallV2Adapter.ts`
- Test: `src/components/wall-v2/wallV2Adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/components/wall-v2/wallV2Adapter.test.ts` (and add `adaptScheduleBand` to the import block from `'./wallV2Adapter'`):

```typescript
describe('adaptScheduleBand', () => {
  const members: FamilyMember[] = [];
  const now = new Date('2026-06-03T12:00:00');

  it('returns empty band when there is no today data', () => {
    expect(adaptScheduleBand(undefined, members, now, null)).toEqual({ allDay: [], timed: [] });
  });

  it('collects timed events + timed tasks into one chronological list, with formatted time', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [makeItem({ id: 'task-1', type: 'task', title: 'Call plumber', startTime: new Date('2026-06-03T09:30:00') })],
        afternoon: [makeItem({ id: 'event-1', type: 'event', title: 'Dentist', startTime: new Date('2026-06-03T14:00:00') })],
        evening: [],
        unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.timed.map((e) => e.title)).toEqual(['Call plumber', 'Dentist']);
    expect(band.timed[0].time).toBe('9:30 AM');
    expect(band.timed[1].time).toBe('2:00 PM');
  });

  it('routes all-day events to the allDay strip, never the timed list', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [makeItem({ id: 'event-2', type: 'event', title: 'Field trip', allDay: true })],
        morning: [], afternoon: [], evening: [], unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.allDay.map((e) => e.title)).toEqual(['Field trip']);
    expect(band.timed).toEqual([]);
  });

  it('excludes routines and untimed tasks from the band entirely', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [
          makeItem({ id: 'routine-1', type: 'routine', title: 'Brush teeth', startTime: new Date('2026-06-03T07:30:00') }),
          makeItem({ id: 'task-2', type: 'task', title: 'Untimed task', startTime: null }),
        ],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.timed).toEqual([]);
    expect(band.allDay).toEqual([]);
  });

  it('inserts the dinner card by time and drops a duplicate dinner event', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [], afternoon: [],
        evening: [makeItem({ id: 'event-d', type: 'event', title: 'Family dinner', startTime: new Date('2026-06-03T18:30:00') })],
        unscheduled: [],
      },
    });
    const dinner = { id: 'd1', title: 'Stir-fry', description: '', start_time: '2026-06-03T18:30:00' } as unknown as CalendarEvent;
    const band = adaptScheduleBand(day, members, now, dinner);
    const dinnerCards = band.timed.filter((e) => e.id.startsWith('dinner-'));
    expect(dinnerCards).toHaveLength(1);
    // The raw "Family dinner" event is replaced by the dinner card, not shown twice.
    expect(band.timed.filter((e) => /dinner/i.test(e.title))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts -t adaptScheduleBand`
Expected: FAIL — `adaptScheduleBand is not a function`.

- [ ] **Step 3: Implement `adaptScheduleBand`**

In `src/components/wall-v2/wallV2Adapter.ts`, add a `WallV2ScheduleBandData` import to the existing `import type { ... } from './types'` block, then add this section after `adaptTimelineEvent`/`dedupeRoutines` (before `adaptTimelineSections`):

```typescript
// ────────────────────────────────────────────────────────────────────────────
// Schedule band — prioritized timed agenda (events + timed tasks)
// ────────────────────────────────────────────────────────────────────────────

function formatBandTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** True for the prioritized band: a timed commitment (event or task with a real clock time). Routines never qualify. */
export function isCommitment(item: TimelineItem): boolean {
  if (item.type !== 'event' && item.type !== 'task') return false;
  return item.startTime != null && !item.allDay;
}

/**
 * Build the prioritized Schedule band from today's items:
 *   - all-day calendar events → `allDay` strip
 *   - timed events + timed tasks → `timed`, sorted ascending by start time,
 *     each tagged with a formatted `time`
 *   - the structured dinner event (if any) → a special dinner card placed by time,
 *     replacing any raw "dinner" event so it isn't shown twice
 * Routines and untimed tasks are excluded entirely (they belong to the rhythm zone).
 */
export function adaptScheduleBand(
  today: WallDayData | undefined,
  members: FamilyMember[],
  _now: Date,
  dinnerEvent: CalendarEvent | null,
): WallV2ScheduleBandData {
  if (!today) return { allDay: [], timed: [] };

  const all: TimelineItem[] = [
    ...(today.items.allday ?? []),
    ...(today.items.morning ?? []),
    ...(today.items.afternoon ?? []),
    ...(today.items.evening ?? []),
    ...(today.items.unscheduled ?? []),
  ];

  const allDay = all
    .filter((i) => i.type === 'event' && i.allDay)
    .map((i) => adaptTimelineEvent(i, members));

  const timedItems = all
    .filter(isCommitment)
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

  let timed = timedItems.map((i) => ({
    ...adaptTimelineEvent(i, members),
    time: formatBandTime(i.startTime!),
  }));

  if (dinnerEvent) {
    const mealTitle = extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title;
    const recipeUrl = resolveRecipeUrl(dinnerEvent.description);
    const startStr = dinnerEvent.start_time || dinnerEvent.startTime;
    const start = startStr ? new Date(startStr) : null;
    const dinnerCard: WallV2TimelineEvent = {
      id: `dinner-${dinnerEvent.id}`,
      icon: UtensilsCrossed,
      tint: 'peach',
      title: 'Family dinner',
      subtitle: mealTitle,
      highlight: 'peach',
      members: members.slice(0, 4).map(memberBubble),
      recipeUrl,
      time: start ? formatBandTime(start) : undefined,
    };
    // Drop any raw "dinner" event so the meal isn't listed twice, then
    // re-insert the dinner card in chronological position.
    timed = timed.filter((e) => !/dinner/i.test(e.title));
    const startMs = start ? start.getTime() : Number.POSITIVE_INFINITY;
    const idx = timedItems.findIndex(
      (i) => !/dinner/i.test(i.title) && i.startTime!.getTime() > startMs,
    );
    if (idx === -1) timed.push(dinnerCard);
    else {
      // idx is into timedItems (pre-filter); re-find insert point by title match
      const insertAt = timed.findIndex((e) => {
        const orig = timedItems.find((t) => `task-`); // placeholder — replaced below
        return orig ? false : false;
      });
      void insertAt;
      timed.push(dinnerCard);
      timed.sort((a, b) => bandTimeKey(a) - bandTimeKey(b));
    }
  }

  return { allDay, timed };
}

/** Sort key for band rows by their formatted time; rows without a time sink to the end. */
function bandTimeKey(e: WallV2TimelineEvent): number {
  if (!e.time) return Number.POSITIVE_INFINITY;
  const m = e.time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return Number.POSITIVE_INFINITY;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}
```

> NOTE for implementer: the dinner-insertion branch above is intentionally simplified to "append then sort by `bandTimeKey`" — the dead `insertAt` placeholder block must be deleted; keep only `timed.push(dinnerCard); timed.sort((a, b) => bandTimeKey(a) - bandTimeKey(b));` and drop the `idx === -1` special case by always appending then sorting. Final dinner branch:
>
> ```typescript
>     timed = timed.filter((e) => !/dinner/i.test(e.title));
>     timed.push(dinnerCard);
>     timed.sort((a, b) => bandTimeKey(a) - bandTimeKey(b));
> ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts -t adaptScheduleBand`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall): adaptScheduleBand builds the prioritized timed agenda"
```

---

### Task 3: Narrow `adaptTimelineSections` to rhythm-only (TDD)

**Files:**
- Modify: `src/components/wall-v2/wallV2Adapter.ts`
- Test: `src/components/wall-v2/wallV2Adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the existing `describe('adaptTimelineSections', ...)` (or add a new describe) in `src/components/wall-v2/wallV2Adapter.test.ts`:

```typescript
describe('adaptTimelineSections — rhythm only', () => {
  const now = new Date('2026-06-03T12:00:00');

  it('excludes calendar events and timed tasks (they belong to the band)', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [
          makeItem({ id: 'event-1', type: 'event', title: 'Dentist', startTime: new Date('2026-06-03T14:00:00') }),
          makeItem({ id: 'task-1', type: 'task', title: 'Call plumber', startTime: new Date('2026-06-03T09:30:00') }),
          makeItem({ id: 'routine-1', type: 'routine', title: 'Brush teeth', startTime: new Date('2026-06-03T07:30:00') }),
        ],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const sections = adaptTimelineSections(day, [], now, null, false, []);
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));
    expect(titles).toContain('Brush teeth'); // routine stays — even though it has a time
    expect(titles).not.toContain('Dentist'); // event → band
    expect(titles).not.toContain('Call plumber'); // timed task → band
  });

  it('keeps untimed tasks in the rhythm zone', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [makeItem({ id: 'task-2', type: 'task', title: 'Untimed chore', startTime: null })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const sections = adaptTimelineSections(day, [], now, null, false, []);
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));
    expect(titles).toContain('Untimed chore');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts -t "rhythm only"`
Expected: FAIL — `Dentist` / `Call plumber` still present (currently events/timed-tasks render in rhythm).

- [ ] **Step 3: Narrow the function**

In `src/components/wall-v2/wallV2Adapter.ts`, in `adaptTimelineSections`, update the `isVisible` filter so it ALSO drops band-bound items. Replace the existing `isVisible` definition (the `const isVisible = (i: TimelineItem) => { ... }` block) with:

```typescript
  // Rhythm zone = routines (always) + untimed/all-day tasks. Calendar events and
  // timed tasks are pulled into the prioritized Schedule band, so drop them here
  // to avoid showing a commitment in two places.
  const isVisible = (i: TimelineItem) => {
    if (i.type === 'event') return false;            // all events → band (timed or all-day strip)
    if (isCommitment(i)) return false;               // timed tasks → band
    if (!hideDailyRoutines) return true;
    if (i.type !== 'routine') return true;
    return !isEverydayRoutine(i.recurrencePattern);
  };
```

Then DELETE the dinner-promotion block inside `adaptTimelineSections` (the `if (dinnerEvent) { ... }` block that builds `dinnerCard` and splices it into `eveningItems`) — dinner now lives in the band. The `dinnerEvent` parameter stays in the signature (callers unchanged) but is no longer used here; rename it to `_dinnerEvent` to satisfy lint, or add `void dinnerEvent;` at the top of the function body.

- [ ] **Step 4: Run the full adapter test file**

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts`
Expected: PASS. If a pre-existing dinner-promotion test in this file now fails (it asserted dinner appears in the evening section), update it to assert dinner is NO LONGER in the rhythm sections (it moved to the band, covered by Task 2's dinner test). Adjust the assertion to `expect(eveningTitles).not.toContain('Family dinner')` or remove the obsolete dinner-in-rhythm test.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall): narrow adaptTimelineSections to rhythm-only (events+timed tasks move to band)"
```

---

### Task 4: `WallV2ScheduleBand` component (+ smoke test)

**Files:**
- Create: `src/components/wall-v2/WallV2ScheduleBand.tsx`
- Test: `src/components/wall-v2/WallV2ScheduleBand.test.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/wall-v2/WallV2ScheduleBand.tsx`:

```tsx
// src/components/wall-v2/WallV2ScheduleBand.tsx
//
// The prioritized timed agenda at the top of the wall's center column.
// All-day commitments sit in a small strip; timed commitments render as
// time-led rows (large time gutter + reused event card). This is the wall's
// Level-1/2 information: "what's actually happening today and when."

import { CalendarClock } from 'lucide-react';
import { WallV2EventCard } from './WallV2EventCard';
import type { WallV2ScheduleBandData } from './types';

interface Props {
  band: WallV2ScheduleBandData;
  onTapEvent?: (id: string) => void;
  onToggleComplete?: (id: string, completed: boolean) => void;
}

export function WallV2ScheduleBand({ band, onTapEvent, onToggleComplete }: Props) {
  const empty = band.allDay.length === 0 && band.timed.length === 0;

  return (
    <div className="rounded-3xl border-2 border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 flex flex-col gap-3">
      <div className="text-[0.78rem] font-black uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
        <CalendarClock className="w-4 h-4" />
        Schedule
      </div>

      {empty ? (
        <div className="text-[1rem] font-bold text-stone-500 dark:text-stone-400 py-2">
          No appointments today
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {band.allDay.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                All day
              </div>
              {band.allDay.map((event) => (
                <WallV2EventCard
                  key={event.id}
                  event={event}
                  onTap={onTapEvent}
                  onToggleComplete={onToggleComplete}
                />
              ))}
            </div>
          )}

          {band.timed.map((event) => (
            <div key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-3 items-center">
              <div className="text-right text-[1.05rem] font-black text-stone-700 dark:text-stone-200 tabular-nums leading-tight">
                {event.time ?? ''}
              </div>
              <WallV2EventCard
                event={event}
                onTap={onTapEvent}
                onToggleComplete={onToggleComplete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the smoke test**

Create `src/components/wall-v2/WallV2ScheduleBand.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { WallV2ScheduleBand } from './WallV2ScheduleBand';
import type { WallV2ScheduleBandData } from './types';

describe('WallV2ScheduleBand', () => {
  it('renders the empty placeholder when there are no commitments', () => {
    const band: WallV2ScheduleBandData = { allDay: [], timed: [] };
    render(<WallV2ScheduleBand band={band} />);
    expect(screen.getByText('No appointments today')).toBeInTheDocument();
  });

  it('renders timed rows with their time gutter', () => {
    const band: WallV2ScheduleBandData = {
      allDay: [],
      timed: [{ id: 'event-1', icon: Calendar, tint: 'sage', title: 'Dentist', time: '2:00 PM' }],
    };
    render(<WallV2ScheduleBand band={band} />);
    expect(screen.getByText('Dentist')).toBeInTheDocument();
    expect(screen.getByText('2:00 PM')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/components/wall-v2/WallV2ScheduleBand.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/WallV2ScheduleBand.tsx src/components/wall-v2/WallV2ScheduleBand.test.tsx
git commit -m "feat(wall): WallV2ScheduleBand renders the prioritized timed agenda"
```

---

### Task 5: Render band-then-rhythm in `WallV2Timeline`

**Files:**
- Modify: `src/components/wall-v2/WallV2Timeline.tsx`

- [ ] **Step 1: Add the band prop and render it**

In `src/components/wall-v2/WallV2Timeline.tsx`:

1. Add to the imports:
```typescript
import { WallV2ScheduleBand } from './WallV2ScheduleBand';
import type { WallV2TimelineSection, WallV2ScheduleBandData } from './types';
```
(replace the existing `import type { WallV2TimelineSection } from './types';`)

2. Update `interface Props` to add:
```typescript
  band: WallV2ScheduleBandData;
```

3. Update the component signature destructure to include `band`.

4. Compute emptiness near the top of the component body (after the `scrollRef` line):
```typescript
  const bandEmpty = band.allDay.length === 0 && band.timed.length === 0;
  const everythingEmpty = bandEmpty && sections.length === 0;
```

5. Replace the existing `{sections.length === 0 ? ( ...big empty state... ) : ( ...scroll div... )}` conditional so the empty state keys off `everythingEmpty`, and the scroll container renders the band FIRST, then the rhythm sections. The scroll `<div ref={scrollRef} ...>` block becomes:

```tsx
      ) : (
      <div
        ref={scrollRef}
        className="flex flex-col gap-4 relative flex-1 min-h-0 overflow-y-auto pr-1 -mr-1"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        <WallV2ScheduleBand
          band={band}
          onTapEvent={onTapEvent}
          onToggleComplete={onToggleComplete}
        />

        {sections.length > 0 && (
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 mt-1">
            Home rhythm
          </div>
        )}

        {sections.map((section, idx) => {
          /* ...UNCHANGED existing section-rendering JSX... */
        })}
      </div>
      )}
```

Keep the inner `sections.map(...)` body exactly as it is today (the rail + events grid). Only the wrapper changed: band + "Home rhythm" label now precede the sections, and the outer ternary now tests `everythingEmpty` instead of `sections.length === 0`.

- [ ] **Step 2: Verify compile + existing timeline behavior**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall-v2/WallV2Timeline.tsx
git commit -m "feat(wall): WallV2Timeline renders Schedule band above Home rhythm"
```

---

### Task 6: Wire the band through `WallV2Shell`

**Files:**
- Modify: `src/components/wall-v2/WallV2Shell.tsx`

- [ ] **Step 1: Import the adapter and compute the band**

In `src/components/wall-v2/WallV2Shell.tsx`:

1. Add `adaptScheduleBand` to the existing import from `'./wallV2Adapter'`:
```typescript
import {
  adaptGlanceForMember,
  adaptScheduleBand,
  adaptTimelineSections,
  adaptUpcoming,
  adaptWeather,
} from './wallV2Adapter';
```

2. After the existing `const timeline = useMemo(...)` block, add:
```typescript
  const scheduleBand = useMemo(
    () => adaptScheduleBand(todayData, wallData.familyMembers, now, dinnerEvent),
    [todayData, wallData.familyMembers, now, dinnerEvent],
  );
```

- [ ] **Step 2: Pass the band into the timeline**

In the JSX, update the `<WallV2Timeline ... />` usage to add the prop:
```tsx
            <WallV2Timeline
              band={scheduleBand}
              sections={timeline}
              onTapEvent={handleTapEvent}
              onToggleComplete={handleToggleComplete}
              onTapFullDay={handleTapFullDay}
            />
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): wire Schedule band into the wall shell"
```

---

### Task 7: Full verification + deploy

**Files:** none (verification + push).

- [ ] **Step 1: Run the full wall-v2 test suite**

Run: `npx vitest run src/components/wall-v2/`
Expected: PASS (all wall-v2 tests, including the updated adapter + new band tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors in touched files. (CI runs lint; pre-push does not — fix any lint issues here.)

- [ ] **Step 3: Production build (stricter than pre-push tsc)**

Run: `npm run build`
Expected: PASS (Vercel runs `tsc -b` + Vite build; this catches type errors the pre-push hook's `tsc --noEmit` may miss).

- [ ] **Step 4: Push to main (auto-deploys to prod)**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```
Expected: pre-push hook runs `tsc --noEmit` + unit tests, then push succeeds. Push to `main` auto-deploys via Vercel (`git.deploymentEnabled`).

- [ ] **Step 5: Confirm deploy**

Verify the new deploy lands on Vercel for the `main` push. The chromeless Pi kiosk picks up the new build via `useBuildAutoReload`; no manual wall reload needed.

---

## Self-Review

**Spec coverage:**
- Split rule (events + timed tasks → band; routines always rhythm) → `isCommitment` + Task 2/3. ✓
- Schedule band chronological, time-led, all-day strip, dinner card, empty placeholder → Task 2 + Task 4. ✓
- Home rhythm keeps time-of-day grouping, only routines + untimed tasks → Task 3 (existing section logic retained, filter narrowed). ✓
- Carried-over below schedule, inside rhythm → overdue stays first rhythm section, rendered under the band by Task 5. ✓
- Hide-routines, tap-to-complete, action sheet, drag-scroll, dark mode unchanged → band reuses `WallV2EventCard` + prefixed ids; Shell handlers untouched. ✓
- Tests for band + narrowed sections + component smoke → Tasks 2, 3, 4. ✓

**Placeholder scan:** The Task 2 implementation deliberately flags and removes its own dead `insertAt` block (see the NOTE) — implementer must apply the simplified dinner branch. No other TBDs.

**Type consistency:** `WallV2ScheduleBandData { allDay, timed }`, `WallV2TimelineEvent.time`, `adaptScheduleBand(today, members, now, dinnerEvent)`, `isCommitment(item)` used consistently across Tasks 1–6. Timeline `band` prop matches Shell's `scheduleBand` value.
