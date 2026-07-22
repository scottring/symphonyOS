# Week + Month Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1,314-line HorizonView into tested per-page components, make every week-rendering surface respect `weekStartsOn`, dress Week/Month in the rhythm chip language, and build the Month→Week and Week→Today seams.

**Architecture:** Mechanical extraction first (no behavior change, smoke-tested), then three additive layers: a cadence-ordering helper consumed by Month grid + Routines strip; a shared `PlacementChip`; seam navigation via existing URL params (`/week?start=`, `/today?date=`). PlanningSession's grid internals are untouched except one optional prop.

**Tech Stack:** React 19 + TS strict, Tailwind v4 Nordic Journal, Vitest + RTL, react-router (`useSearchParams`/`useNavigate`), native HTML5 drag (`text/task-id`), lucide-react only.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-week-month-unification-design.md` — read before starting any task.
- **Never hardcode a week start day.** All week ordering flows from `weekStartsOn` in `src/lib/cadence/config.ts` (default 0 stays).
- Task 1 is behavior-preserving: extracted pages must render the SAME DOM as before (verified by smoke tests + full suite; no styling edits in Task 1).
- `TasksApp.tsx` route wiring must not change — `HorizonView.tsx` keeps exporting `WeekView`, `MonthView`, `SeasonView`, `YearView`.
- PlanningSession public behavior unchanged except the new optional `onOpenDay` prop; the wizard's `ScheduleGridStep` must NOT pass it.
- Tests: `npx vitest run <paths>` (never plain `npm test`). PATH fix: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/horizon-unify` (branch `horizon-unify`). Never touch the main worktree.
- Key current-code anchors (verify before editing; they may have drifted a few lines): `HorizonView.tsx` Year early-return ~646-776, Season block ~1036-1176, main return ~940-1300, exports at bottom (WeekView 1310, MonthView 1311, SeasonView 1312, YearView 1313). `MonthCalendarGrid.tsx:47-51` hardcodes Sunday (`gridStart.setDate(1 - first.getDay())`, `WEEKDAYS=['Sun',…]`). Rhythm strip: `src/components/routine/rhythm/WeekStrip.tsx` maps `DAY_ORDER` directly.

---

### Task 1: Mechanical split of HorizonView

**Files:**
- Create: `src/apps/tasks/horizons/WeekPage.tsx`, `src/apps/tasks/horizons/MonthPage.tsx`, `src/apps/tasks/horizons/SeasonPage.tsx`, `src/apps/tasks/horizons/YearPage.tsx`, `src/apps/tasks/horizons/shared.tsx`
- Modify: `src/apps/tasks/HorizonView.tsx` (shrinks to re-exports)
- Test: `src/apps/tasks/horizons/pages.smoke.test.tsx`

**Interfaces:**
- Consumes: everything currently inside HorizonView (imports move with the code).
- Produces: `WeekPage`, `MonthPage`, `SeasonPage`, `YearPage` components with NO props (they read context/hooks exactly as the branches do today); `HorizonView.tsx` re-exports them under the old names (`export { WeekPage as WeekView } from './horizons/WeekPage'` etc.). Tasks 3–5 edit the per-page files.

- [ ] **Step 1: Read HorizonView top-to-bottom and map the branches**

Identify: (a) module-level constants/helpers used by multiple branches → these go to `shared.tsx` (exported); (b) the Year early-return JSX + its exclusive hooks → `YearPage.tsx`; (c) the Season block + exclusive hooks → `SeasonPage.tsx`; (d) the main return with `horizon==='week'`/`'month'` branches → split into `WeekPage.tsx`/`MonthPage.tsx`, duplicating the shared scaffold JSX into each page ONLY where it is parameterized by horizon; hoist genuinely identical pieces (header scaffold, CascadeRail wiring, add-composer, parking menu, pool row renderer) into `shared.tsx` as small components/functions with explicit props. Hooks that every page calls (useScheduleActionsContext etc.) are called inside each page — React hooks cannot live in shared helpers unless those helpers are components/hooks themselves; prefer a `useHorizonPageData(horizon)` hook in `shared.tsx` if (and only if) the data wiring is identical across pages.

- [ ] **Step 2: Write the smoke test first**

Create `src/apps/tasks/horizons/pages.smoke.test.tsx`. Mock the contexts the pages consume (look at existing tests for `ScheduleActionsProvider`/`GoalsContext` mocking patterns — `src/components/planning/PlanningSession.test.tsx` and `guided/GuidedSession.test.tsx` show the fixtures). One `it` per page: render it inside the mocked providers and `MemoryRouter`; assert a landmark unique to that page mounts (Week: the "Plan the week" button; Month: the weekday header row; Season: "The season's picks" heading text (adjust to actual copy); Year: the month-grid or "Plan the year" heading). Keep fixtures minimal (empty task arrays are fine — the pages must render empty states without crashing).

Run: `npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx` → FAIL (files don't exist).

- [ ] **Step 3: Extract**

Move code; do not edit it beyond what the move mechanically requires (import paths, hoisted props). No styling, copy, or logic changes. `HorizonView.tsx` ends as only the four re-export lines plus any type re-exports other files import from it (grep `from '@/apps/tasks/HorizonView'` and `from './HorizonView'` first; preserve those exports).

- [ ] **Step 4: Verify**

Run: `npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx` → PASS.
Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/apps src/components/planning` → PASS (nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(horizons): split HorizonView monolith into per-page components with smoke tests"
```

---

### Task 2: Week-start ordering everywhere

**Files:**
- Modify: `src/lib/cadence/config.ts`
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx`
- Modify: `src/components/routine/rhythm/WeekStrip.tsx`
- Test: `src/lib/cadence/config.test.ts` (extend or create), `src/components/planning/horizon/MonthCalendarGrid.test.tsx` (create if absent), `src/components/routine/rhythm/WeekStrip.test.tsx` (extend)

**Interfaces:**
- Produces (Tasks 4–5 and future cycles rely on): in `config.ts` —

```typescript
/** JS day numbers (0-6) in display order for the configured week start. */
export function orderedWeekDays(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7))
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type OrderedDayKey = typeof DAY_KEYS[number]

/** Day-name keys in display order for the configured week start. */
export function orderedDayKeys(weekStartsOn: WeekStart): OrderedDayKey[] {
  return orderedWeekDays(weekStartsOn).map(d => DAY_KEYS[d])
}
```

(If `WeekStart` isn't exported or is named differently, adapt to the actual type; keep the two function names exact.)

- [ ] **Step 1: Failing tests**

`config.test.ts`:

```typescript
it('orders week days from the configured start', () => {
  expect(orderedWeekDays(0)).toEqual([0, 1, 2, 3, 4, 5, 6])
  expect(orderedWeekDays(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
  expect(orderedDayKeys(1)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
})
```

MonthCalendarGrid test: render July 2026 with `weekStartsOn: 1` (find how the component obtains the config — if it doesn't take a prop, thread `weekStartsOn?: number` prop defaulting to the config value; check its call sites: HorizonView/MonthPage and MonthZoomSheet) and assert the header row starts with "Mon" and the first cell is Mon Jun 29. With `weekStartsOn: 0` header starts "Sun" and first cell Sun Jun 28 (current behavior preserved).

WeekStrip test: render with a `weekStartsOn={1}` prop (new optional prop, default 0) and assert `day-mon` column appears before `day-sun` in the DOM.

- [ ] **Step 2: Implement**

- Add the helpers to `config.ts` exactly as specified.
- `MonthCalendarGrid.tsx`: compute `gridStart` as the most recent `weekStartsOn` day on or before the 1st (`const first = …; const offset = (first.getDay() - weekStartsOn + 7) % 7; gridStart.setDate(1 - offset)`); build the header labels from `orderedWeekDays(weekStartsOn)` mapped through a `['Sun','Mon',…]` label table. Accept `weekStartsOn` as a prop with the config default so tests can drive it; update call sites to pass the configured value (find where cadence config is read nearby — `guided/periods.ts` usage shows the pattern).
- `WeekStrip.tsx`: add optional `weekStartsOn?: number` (default 0); replace both `DAY_ORDER.map(...)` render loops (normal + pulse share one loop) with `orderedDayKeys(weekStartsOn).map(...)`. `DAY_ORDER` stays for model/storage. RhythmPage passes the configured value (import the same config read the planning pages use; if the config hook is planning-scoped, read the raw default export — keep it one line).

- [ ] **Step 3: Verify**

Run: `npx vitest run src/lib/cadence src/components/planning/horizon src/components/routine/rhythm` → PASS.
`npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(cadence): week ordering follows weekStartsOn everywhere — month grid + rhythm strip de-hardcoded"
```

---

### Task 3: PlacementChip + adoption

**Files:**
- Create: `src/components/planning/PlacementChip.tsx`, `src/components/planning/PlacementChip.test.tsx`
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx` (cell items), `src/components/planning/DenseInboxRow.tsx` (visual shell only — locate it first; it may live elsewhere, grep `DenseInboxRow`)

**Interfaces:**
- Produces:

```typescript
export interface PlacementChipProps {
  id: string
  name: string
  kind?: 'task' | 'event'          // event → purple tint
  time?: string | null             // 'HH:MM' badge, optional
  members?: { id: string; name: string; initials?: string; color?: string }[]
  draggable?: boolean              // sets dataTransfer 'text/task-id' = id on dragStart
  onClick?: () => void
  className?: string
}
export function PlacementChip(props: PlacementChipProps): JSX.Element
```

- [ ] **Step 1: Failing tests**

`PlacementChip.test.tsx`: renders name + grip when draggable; dragStart sets `text/task-id` (mock DataTransfer: `{ data:{}, setData(k,v){this.data[k]=v}, getData(k){return this.data[k]??''}, get types(){return Object.keys(this.data)}, effectAllowed:'none' }`); event kind gets the purple class (`bg-` assertion on the rendered element); avatars render initials; click fires.

- [ ] **Step 2: Implement**

Chip anatomy copied from the rhythm chips (see `src/components/routine/rhythm/WeekStrip.tsx` Chip): `GripVertical` w-3 text-neutral-300 when draggable, name with `line-clamp-2`/truncate, `AssigneeAvatar` cluster if `members` given (map to FamilyMember shape or render initials directly — reuse `AssigneeAvatar` from `@/components/family/AssigneeAvatar` casting members to its type), time badge `text-[10px] text-neutral-400`, base `rounded-lg border border-neutral-100 bg-white shadow-sm px-2 py-1 text-xs` with event variant `bg-[#f4effc] border-[#e2d8f2]`.

Adopt in MonthCalendarGrid cells: replace the current per-item markup with `<PlacementChip>` keeping the existing dragStart payload (`text/task-id`) and click behavior identical. Keep the grid's own drop logic untouched.

DenseInboxRow: adjust only the outer shell classes to the chip tokens (border-neutral-100, rounded-lg, bg-white, shadow-sm, hover border-amber-300) and add a `GripVertical` glyph at the row start when the row is draggable (if the row supports drag; if it doesn't, add `draggable` + `text/task-id` payload so pool rows can drag onto the grids — this is the one behavior ADD, and only when an `id` is available). Do not touch its menus/actions.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/components/planning` → PASS.
`npx tsc --noEmit` → clean. Run any existing DenseInboxRow/Month tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planning): PlacementChip shared card language — month cells + pool rows adopt it"
```

---

### Task 4: Seams — Month→Week and Week→Today

**Files:**
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx` (week-row hover + Open week chip)
- Modify: `src/apps/tasks/horizons/WeekPage.tsx` (`?start=` anchoring)
- Modify: `src/apps/tasks/horizons/MonthPage.tsx` (navigate handler)
- Modify: `src/components/planning/PlanningSession.tsx` (optional `onOpenDay` prop on day headers)
- Test: extend `MonthCalendarGrid.test.tsx`, `pages.smoke.test.tsx` (WeekPage `?start=`), `PlanningSession.test.tsx` (`onOpenDay`)

**Interfaces:**
- `MonthCalendarGrid` gains `onOpenWeek?: (weekStart: Date) => void`; when present, hovering a cell adds an amber wash class to all cells of that row and shows a floating "Open week →" chip at the row's right edge; clicking it calls `onOpenWeek(firstDayOfThatRow)`.
- `PlanningSession` gains `onOpenDay?: (date: Date) => void`; when present each day header renders a small "→ day" button (`aria-label` \`Open ${weekday} on Today\`).
- WeekPage: `const start = searchParams.get('start')` — valid `YYYY-MM-DD` → anchor date for `PlanningSession initialDate` AND the header range label AND `minDropDate` logic if week-relative; invalid/absent → today.
- MonthPage: `onOpenWeek={d => navigate(\`/week?start=${format(d)}\`)}` (local `format` = `d.toISOString().slice(0,10)` is WRONG for timezones — use manual `${y}-${pad(m)}-${pad(day)}` from local date parts).
- WeekPage passes `onOpenDay={d => navigate(\`/today?date=${localYmd(d)}\`)}` to its embedded PlanningSession. `ScheduleGridStep` untouched.

- [ ] **Step 1: Failing tests**

- MonthCalendarGrid: with `onOpenWeek` given, hover a mid-month cell (fireEvent.mouseEnter) → "Open week →" appears; click → handler called with the correct local-date week start (respecting `weekStartsOn` — reuse the offset math from Task 2).
- PlanningSession: with `onOpenDay`, `getAllByRole('button', { name: /open .* on today/i })` has 7 entries; clicking the first calls the handler with that column's date; without the prop, zero such buttons. (Follow the existing test file's provider fixtures.)
- WeekPage smoke: render at `/week?start=2026-07-05` inside MemoryRouter (`initialEntries`) and assert the header shows the Jul 5 week range (adapt to actual label format).

- [ ] **Step 2: Implement** (per the interfaces above; hover state is one `hoverRow: number | null` on the grid; row membership = `Math.floor(cellIndex / 7)`).

- [ ] **Step 3: Verify**

`npx vitest run src/components/planning src/apps` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(horizons): seams — month rows open their week, week days open their Today"
```

---

### Task 5: Chrome alignment + full suite

**Files:**
- Modify: `src/apps/tasks/horizons/WeekPage.tsx`, `src/apps/tasks/horizons/MonthPage.tsx` (mastheads)
- Test: extend `pages.smoke.test.tsx`

**Steps:**

- [ ] **Step 1:** Week + Month mastheads adopt the rhythm pattern: `<h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">This Week</h1>` (/ "This Month") with a one-line subtitle (`{rangeLabel} · {placedCount} placed, {poolCount} to place` — reuse the counts the pages already compute; if a count isn't already computed, derive from the existing pool selectors, do not invent new queries). Existing action buttons ("Plan the week/month") move to a right-aligned flex group matching RhythmPage's masthead. Keep CascadeRail and everything else in place.
- [ ] **Step 2:** Update smoke tests to assert the new h1s. `npx vitest run src/apps` → PASS.
- [ ] **Step 3:** Full suite `npx vitest run` → all pass; fix stragglers (imports from HorizonView, changed labels).
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(horizons): week+month mastheads in the rhythm chrome; full suite green"
```

---

## Final verification (controller)

`npm run build`; eslint on touched files; final whole-branch review (most capable model) with the spec; fix wave if needed; rebase on origin/main; push (pre-push runs tsc + suite); watch deploy.
