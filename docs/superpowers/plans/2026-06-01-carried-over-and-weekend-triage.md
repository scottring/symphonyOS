# Carried-Over Rename + Weekend Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Today "Overdue" section to a calm "Carried over," and make "This/Next Weekend" available everywhere tasks are scheduled.

**Architecture:** This is a small set of targeted edits, NOT a new component. Investigation showed the existing `OverdueSection` already does oldest-first ordering, expanded display, Drop→`quarter` (`onPushTask(id,'quarter')`), and Do-today/Reschedule (via `ScheduleItem` → `SchedulePopover`). The weekend date helpers (`getNextWeekend`, `getWeekendAfterNext`) already exist and are fully unit-tested in `dateHelpers.test.ts`. `SchedulePopover` (the picker used by overdue rows + 5 other surfaces) already has a "This Weekend" button; it's missing "Next Weekend". The legacy `WhenPicker` (1 remaining usage) has neither. So the work is: (1) rename + neutralize tone, (2) add one button to `SchedulePopover`, (3) add two buttons to `WhenPicker` for consistency.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library. Run tests with `npx vitest run <path>` (NOT `npm test`, which is watch mode).

**Scope explicitly EXCLUDED:** No new `CarriedOverSection` component. No "+N more" cap. No collapse toggle. No wall/`wall-v2` changes (the wall keeps its existing "Overdue" glance — its tests in `wallV2Adapter.test.ts` and `WallNowQuadrant.test.tsx` must continue to pass unchanged). No consolidation of `WhenPicker` into `SchedulePopover` (separate future refactor).

---

### Task 1: Rename "Overdue" → "Carried over" (calm tone)

**Files:**
- Modify: `src/components/schedule/OverdueSection.tsx` (header `<h3>` + region `aria-label`)
- Modify (test): `src/components/schedule/TodayView.test.tsx:182-188`

- [ ] **Step 1: Update the failing test first**

In `src/components/schedule/TodayView.test.tsx`, the existing block (around lines 182–190) currently reads:

```tsx
    // OverdueSection renders with the aria-label region
    expect(screen.getByRole('region', { name: /overdue tasks/i })).toBeInTheDocument()
    expect(screen.getByText('Wired overdue task')).toBeInTheDocument()
    // The "Overdue" h3 heading is present — rendered by OverdueSection
    // (use getAllByText since the region aria-label also contains "overdue")
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(0)
    // onToggleWaiting was passed into context — ScheduleItem renders a waiting toggle
    // when onToggleWaiting is provided; verify it's reachable (no prop-threading crash)
    expect(screen.getByRole('region', { name: /overdue tasks/i })).toBeInTheDocument()
```

Replace it with:

```tsx
    // CarriedOver (overdue) section renders with its aria-label region
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
    expect(screen.getByText('Wired overdue task')).toBeInTheDocument()
    // The "Carried over" h3 heading is present — rendered by OverdueSection
    expect(screen.getByText('Carried over')).toBeInTheDocument()
    // onToggleWaiting was passed into context — ScheduleItem renders a waiting toggle
    // when onToggleWaiting is provided; verify it's reachable (no prop-threading crash)
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "region" and name /carried over tasks/i` (component still says "Overdue").

- [ ] **Step 3: Rename header text, neutralize color, and update aria-label in the component**

In `src/components/schedule/OverdueSection.tsx`, the section currently renders:

```tsx
    <div
      role="region"
      aria-label="Overdue tasks"
      className="mb-10 animate-fade-in-up"
    >
      {/* Section header — warm but subtle */}
      <h3 className="time-group-header mb-4" style={{ color: 'hsl(32 60% 50%)' }}>
        Overdue
      </h3>
```

Change it to (calm, plain neutral tone — no amber):

```tsx
    <div
      role="region"
      aria-label="Carried over tasks"
      className="mb-10 animate-fade-in-up"
    >
      {/* Section header — calm, plain. These are obligations, not emergencies. */}
      <h3 className="time-group-header mb-4" style={{ color: 'hsl(220 9% 46%)' }}>
        Carried over
      </h3>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Confirm the wall tests are untouched**

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts src/components/wall/now/WallNowQuadrant.test.tsx`
Expected: PASS — both still assert the wall's "Overdue" label, which we did NOT change. (If either fails, you edited the wrong surface — revert.)

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/OverdueSection.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): rename Overdue section to calm 'Carried over'"
```

---

### Task 2: Add "Next Weekend" to SchedulePopover

`SchedulePopover` is the picker used by `ScheduleItem` (carried-over rows + timeline), `TriageCard`, `InboxTaskCard`, `TaskQuickActions`, `BulkActionToolbar`, and `PanelActions`. It already renders a "This Weekend" button (`getNextWeekend()`); add a sibling "Next Weekend" button (`getWeekendAfterNext()`, which already exists and is tested).

**Files:**
- Modify: `src/components/triage/SchedulePopover.tsx` (import + one button in the date-step grid)

> **Testing note:** There is no `SchedulePopover.test.tsx` (this portal-heavy component has never had a unit test), and the new button is an exact structural mirror of the already-shipping, untested "This Weekend" button. The date math it calls is already covered by `dateHelpers.test.ts` (`getWeekendAfterNext`). Creating a bespoke portal test harness here is disproportionate to a one-button wiring change, so this task is verified by typecheck + manual render (Step 4). Do not add a brittle new test file.

- [ ] **Step 1: Add `getWeekendAfterNext` to the dateHelpers import**

In `src/components/triage/SchedulePopover.tsx`, the import currently reads:

```tsx
import {
  getBaseDate,
  getNextWeekend,
  getNextMonday,
  parseDateInput,
  formatDateLabel,
} from '@/lib/dateHelpers'
```

Change to:

```tsx
import {
  getBaseDate,
  getNextWeekend,
  getWeekendAfterNext,
  getNextMonday,
  parseDateInput,
  formatDateLabel,
} from '@/lib/dateHelpers'
```

- [ ] **Step 2: Add the "Next Weekend" button after "This Weekend"**

In the date-step preset grid, immediately AFTER the existing "This Weekend" button:

```tsx
                <button
                  onClick={() => handleDateSelect(getNextWeekend())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>This Weekend</span>
                </button>
```

insert this sibling button:

```tsx
                <button
                  onClick={() => handleDateSelect(getWeekendAfterNext())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Next Weekend</span>
                </button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the app, click a task's schedule (calendar) affordance to open `SchedulePopover`. Confirm both "This Weekend" and "Next Weekend" appear, and that selecting "Next Weekend" schedules the task to the Saturday one week after "This Weekend".

- [ ] **Step 5: Commit**

```bash
git add src/components/triage/SchedulePopover.tsx
git commit -m "feat(schedule): add 'Next Weekend' preset to SchedulePopover"
```

---

### Task 3: Add "This Weekend" + "Next Weekend" to WhenPicker

`WhenPicker` (bucket-first legacy picker, 1 usage in `ScheduleWithTimeline.tsx`) lacks both weekend options. Add them to the bucket step for consistency with `SchedulePopover`. They behave like "Today"/"Tomorrow": set the Saturday date via `handleBucketSelect('timed', <date>)`, which advances to the time-selection step.

**Files:**
- Modify: `src/components/triage/WhenPicker.tsx` (import + two buttons)
- Modify (test): `src/components/triage/WhenPicker.test.tsx` (mock + new assertions)

- [ ] **Step 1: Update the test mock and add failing tests**

In `src/components/triage/WhenPicker.test.tsx`, the `vi.mock('@/lib/dateHelpers', ...)` factory currently stubs only `getBaseDate`, `parseDateInput`, `parseTimeInput`, `formatDateLabel`. Add two weekend stubs inside that returned object:

```tsx
  getNextWeekend: () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilSat = day === 0 ? 6 : 6 - day
    d.setDate(d.getDate() + daysUntilSat)
    d.setHours(0, 0, 0, 0)
    return d
  },
  getWeekendAfterNext: () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilSat = day === 0 ? 6 : 6 - day
    d.setDate(d.getDate() + daysUntilSat + 7)
    d.setHours(0, 0, 0, 0)
    return d
  },
```

Then add these tests inside the existing `describe` block (alongside the "shows bucket options" / "selecting Today advances to time selection" tests):

```tsx
    it('shows This Weekend and Next Weekend in bucket options', () => {
      render(<WhenPicker onChange={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Set when'))
      expect(screen.getByText('This Weekend')).toBeInTheDocument()
      expect(screen.getByText('Next Weekend')).toBeInTheDocument()
    })

    it('selecting This Weekend advances to time selection', () => {
      render(<WhenPicker onChange={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Set when'))
      fireEvent.click(screen.getByText('This Weekend'))
      expect(screen.getByText('All Day')).toBeInTheDocument()
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/triage/WhenPicker.test.tsx`
Expected: FAIL — `Unable to find an element with the text: This Weekend` (buttons don't exist yet).

- [ ] **Step 3: Add the weekend imports to WhenPicker**

In `src/components/triage/WhenPicker.tsx`, the import currently reads:

```tsx
import { getBaseDate, parseDateInput, parseTimeInput, formatDateLabel } from '@/lib/dateHelpers'
```

Change to:

```tsx
import { getBaseDate, getNextWeekend, getWeekendAfterNext, parseDateInput, parseTimeInput, formatDateLabel } from '@/lib/dateHelpers'
```

- [ ] **Step 4: Add the two buttons after "Tomorrow"**

In the `step === 'bucket'` block, immediately AFTER the existing "Tomorrow" button:

```tsx
              <button
                onClick={() => handleBucketSelect('timed', getBaseDate(1))}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Tomorrow
              </button>
```

insert:

```tsx
              <button
                onClick={() => handleBucketSelect('timed', getNextWeekend())}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                This Weekend
              </button>
              <button
                onClick={() => handleBucketSelect('timed', getWeekendAfterNext())}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Next Weekend
              </button>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/triage/WhenPicker.test.tsx`
Expected: PASS (all existing + the two new tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/triage/WhenPicker.tsx src/components/triage/WhenPicker.test.tsx
git commit -m "feat(triage): add This/Next Weekend presets to WhenPicker"
```

---

### Task 4: Full verification and push

- [ ] **Step 1: Typecheck (matches Vercel's stricter build)**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: Vercel runs `tsc -b`; if any doubt, also run `npm run build`.)

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (suite is green except a known-flaky `useNotes` test; if only that fails, re-run it once).

- [ ] **Step 3: Lint (CI gates on this; pre-push does not)**

Run: `npm run lint`
Expected: no new errors in the files touched.

- [ ] **Step 4: Push the feature branch**

This branch (`feat/overdue-triage-gate`) is NOT `main`, so the pre-push `main` gate doesn't apply and it deploys only as a harmless preview.

```bash
git push -u origin feat/overdue-triage-gate
```

- [ ] **Step 5: Open a PR (or report back for review before merge to main)**

Do not push directly to `main`. Surface the branch for review; merge to `main` (which auto-deploys to prod) only after approval.

---

## Self-Review

**Spec coverage** (against `2026-06-01-overdue-triage-gate-design.md`):
- Calm "Carried over" framing, no alarm → Task 1 (rename + neutral color). ✅
- Expanded, oldest-first, Drop→quarter, Do-today/Reschedule, "N days", domain filter → **already implemented** in `OverdueSection`; no task needed (documented in Architecture). ✅
- Weekend triage option (This + Next) everywhere tasks are scheduled → Task 2 (`SchedulePopover`, the overdue/triage/panel picker) + Task 3 (`WhenPicker`). "This Weekend" already existed in `SchedulePopover`. ✅
- Wall keeps glance, no triage on wall → enforced by exclusion + Task 1 Step 5 guard. ✅
- "+N more" cap and collapse toggle → **cut as YAGNI** per design decision; intentionally no task. ✅
- `weekendDates` helper → **superseded**: `getNextWeekend`/`getWeekendAfterNext` already exist and are tested; no new helper. ✅

**Placeholder scan:** No TBD/TODO; every code step shows exact code; every command shows expected output. ✅

**Type/name consistency:** `getNextWeekend` / `getWeekendAfterNext` used identically across Tasks 2 and 3 and match `dateHelpers.ts` exports. `handleBucketSelect('timed', <date>)` matches `WhenPicker`'s existing signature. `handleDateSelect(<date>)` matches `SchedulePopover`'s existing usage. ✅
