# The detail panel is one surface, not a pile

**Date:** 2026-08-05
**Status:** approved, ready for planning
**Branch:** `panel-design-pass`

## The problem

Open a task and the right panel reads as a random collection of loosely related
things. Three specific failures:

1. **Nothing collapses.** Open Notes and you're stuck with it. The only way back
   to a small panel is to cycle an expand button through four states — inline →
   tall → 2× → 3× → inline. The `revealed` Set that governs which sections show
   is add-only; there is no remove.
2. **The layout is mish-mashed.** Six Tap panels, four wired live, two different
   shells, no shared section primitive, two different schedulers, ~15 hand-rolled
   copies of the same section label with drift between them.
3. **Scheduling is blind.** Picking a day tells you nothing about what's already
   on it.

## Current state (verified, 2026-08-05)

The Shell owns the app — `App.tsx` is retired. `src/apps/tasks/TaskDetailPanel.tsx`
is the **single live host** for every panel, and it already holds `tasks` and
`events`. Six panels exist; four are wired:

| Panel | Wired | Shell |
|---|---|---|
| `TapContextPanel` (task) | yes | `divide-y` + `px-4 md:px-5 py-3 md:py-5` |
| `TapEventPanel` | yes | same `divide-y` shell |
| `TapRoutinePanel` | yes | `p-5`, no dividers |
| `TapMealPanel` | yes | `p-6`, no dividers |
| `TapProjectPanel` | no | `p-5` |
| `TapContactPanel` | no | `p-5` |

Divergences that produce the mish-mash:

- **Two shells.** Task/event use hairline dividers with even padding; routine and
  meal use flat padding with none.
- **No section primitive.** Every section hand-rolls
  `text-[10px] uppercase tracking-wider font-semibold text-neutral-400`, with
  drift: `mb-1` vs `mb-2`, one at `text-[11px]` (`PanelSubtasks.tsx:58`), some
  with trailing actions and some without.
- **Two schedulers.** The task panel wraps `RescheduleGrid` in a hand-rolled
  popover (`PanelActions.tsx:96-120`); the event panel uses `SchedulePopover`.
- **The event panel bypasses `PanelActions`** entirely, hand-building its own
  header with a when-line, calendar row, chip row, and duration menu.
- **`PanelWhy` runs two colliding state machines.** `editing` (click the note →
  Tiptap opens, with no exit — this is the stuck empty box in the report) and
  `expand` (the 0→1→2→3→0 cycle).

## Design

### 1. `PanelShell` — one chrome, one zone order

New `src/components/surface/PanelShell.tsx` owns the article element and the
order of everything in it. Panels supply zones; they no longer style themselves.

```tsx
<PanelShell
  identity={…}   // title · when · close
  act={…}        // chip row + assistant suggestions
  classify={…}   // domain · who · scope
  details={…}    // the collapsible sections
  related={…}    // linked · might be relevant
  footer={…}
/>
```

The existing task/event chrome becomes canonical:

```
bg-bg-elevated max-w-md w-full rounded-2xl
px-4 md:px-5 py-3 md:py-5
divide-y divide-neutral-200/60
[&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
```

All four live panels adopt it. Routine's `p-5` and meal's `p-6` are deleted.

A zone renders nothing when its content is empty — no ghost dividers.

### 2. `PanelSection` — one label primitive, with collapse

New `src/components/surface/sections/PanelSection.tsx`:

```tsx
<PanelSection id="notes" label="Notes" preview="Ask about the 3pm slot…" actions={…}>
  {children}
</PanelSection>
```

- Header uses the canonical style (the majority one above), chevron on the right,
  trailing-actions slot beside it.
- **Collapsed shows the preview inline** next to the label. Nothing hides
  silently; a section with content always says it has content.
- A section with no `preview` collapses to label + chevron only.

**Collapse state is per section type and sticky**, in one localStorage key:

```
symphony.panel.collapsed  →  string[]  (collapsed section ids)
```

Collapse Notes once and Notes stays collapsed on every task until reopened. This
is a preference, not per-entity state — the panel looks the same every time it
opens.

Emptiness handling is unchanged: a section with no content stays hidden and is
offered by `PanelAddRow`. Collapse applies only to sections that are showing.

Call sites converted: Phone, Email, Location, Notes, Photos & files,
Conversations, Subtasks, People, Linked, Links, Might be relevant, For
discussion, Ingredients, Steps, What to bring, Recurrence.

### 3. `PanelActions` renders descriptors

`PanelActions` becomes a renderer over a `PanelAction[]` the panel supplies:

```ts
interface PanelAction {
  id: string
  label: string
  icon?: ConceptIconName
  kind: 'primary' | 'default'      // primary = the outlined Complete pill
  href?: string                     // tel:/mailto:/join links
  onClick?: () => void
  render?: () => ReactNode          // popover-owning actions (schedule, duration)
}
```

Fixed order, enforced by the renderer:

**Complete → reach (call / email / join / directions) → Schedule → assist → overflow**

Past the first five, actions fold into the `…` menu rather than wrapping to a
second scattered row.

The event panel's duration menu stays event-only — it is supplied as a `render`
descriptor, not special-cased in the renderer.

### 4. `PanelNotes` replaces `PanelWhy`

Both state machines are deleted.

- **No `editing` mode.** Tiptap is always live in the section body. There is no
  state to get stuck in.
- **No expand cycle.** One boolean `wide`. `⤡` opens the right-anchored overlay
  at `min(2 × 380, viewportWidth − 40)`; `⤢`, Escape, and click-outside all close
  it. The inline placeholder stays so the panel doesn't jump.
- Collapse and preview come from `PanelSection`; preview is the first ~60
  characters of tag-stripped text.
- The `label` prop is kept (event's "What to bring", step's "Instructions").

Side effect worth having: the lazy Tiptap chunk now loads when the section
**expands** rather than when the note is clicked, so a collapsed Notes never
pulls the editor bundle.

### 5. `SchedulePicker` — one scheduler

`RescheduleGrid`-in-a-hand-rolled-popover (task) and `SchedulePopover` (event)
collapse into one `SchedulePicker` with three steps:

- **grid** — the eight relative tiles plus "Pick date…", each tile carrying a
  fullness readout
- **peek** — one day's agenda, with open slots as scheduling targets
- **date** — the existing `SpecificDatePicker`, unchanged

Both panels use it. The event panel's bespoke Reschedule button is deleted.

**The month grid is explicitly out of scope.** The eight relative tiles cover
normal triage; "Pick date…" is the rare path, and shading a screen that rarely
opens isn't worth the surface. `useDayLoads` will exist afterward, so adding a
per-cell tint later is cheap if it turns out to be wanted.

### 6. Day fullness

#### The blocker, and why it shapes the design

`useGoogleCalendar.fetchEvents` **replaces** the shared cache rather than merging
into it (`setEvents(data.events || [])`, `useGoogleCalendar.tsx:328`), and
`HomeViewContainer` fetches only `startOfDay → endOfDay` of the viewed date
(lines 107, 195, 421). **While you are on Today, the shared `events` cache holds
one day of events.**

Two consequences that the design must handle:

1. A bar computed from the shared cache would see events only for the viewed day.
   Every other tile would report load from tasks and routines alone and render
   systematically empty — a bar saying "Thursday looks open" when Thursday has
   four meetings. That is exactly the lying-count failure this feature exists to
   prevent.
2. Fetching a wider range **into the shared cache** would blank the events in the
   Today view behind the open panel. This is not hypothetical: `HomeViewContainer.tsx:99`
   already carries a comment about a planning session's fetch replacing the cache
   with "a range that doesn't include today," plus a workaround to restore it.

#### `useDayLoadEvents` — an isolated cache

New `src/hooks/useDayLoadEvents.ts` calls the `google-calendar-events` edge
function directly and holds **its own state**. It never touches
`GoogleCalendarProvider`, so it cannot change what is on screen.

- Range: `today → today + 45d` — covers every relative tile including "this month".
- Fetched once when the picker first opens; cached for the session.
- Failure is non-fatal: on error the readout degrades to tasks + routines and the
  tile labels itself `events unavailable` rather than under-reporting silently.

Making `GoogleCalendarProvider` merge by range is the correct long-term fix, but
it touches every calendar consumer and calendar polling is already the documented
Supabase egress root cause. Out of scope here.

#### `computeDayLoad`

New `src/lib/today/dayLoad.ts`, pure:

```ts
computeDayLoad(date, {
  tasks, events, routines, dateInstances, window,
}): DayLoad

interface DayLoad {
  bookedMinutes: number
  windowMinutes: number
  timedCount: number
  allDayCount: number
  items: DayLoadItem[]
  openSlots: { start: Date; end: Date }[]
  eventsAvailable: boolean
}
```

It **reuses the selectors `computeTodayData` already uses** — `selectTimed`, the
same events-for-day filter and instant-keyed dedupe, and `countRoutineUnits` —
skipping only the grouping work. This is not stylistic: a count that doesn't
mirror the render population is a lying count, and `countRoutineUnits` exists
precisely because a flat routine count double-counts collection steps, invents
rows for steps whose parent isn't on the day, and misses a dosed routine's extra
slots.

- `bookedMinutes` = timed event durations + timed tasks (30 min default when a
  timed task carries no duration), clipped to the window.
- `windowMinutes` = the waking window, **8:00–21:00 (13h)**, matching Today's
  existing day-part bands (Early morning < 8:00, Morning 8:00–12:00, Evening
  17:00–21:00). Exported as a single named constant so it is one edit to change.
- `allDayCount` = all-day tasks + routine units for that date.
- `openSlots` = gaps in the window ≥ 30 min, between timed items.

**Day load counts everyone, with no assignee filter.** `computeTodayData` takes a
`selectedAssignee` and filters by it; day load deliberately does not. You are
asking whether a *day* has room, and a day is shared — filtering to just your own
items would report "Thursday is open" on a Thursday where Iris has three
appointments. It also keeps the panel decoupled from the Today view's filter
state, which the detail-panel host does not hold. This is the one place day load
intentionally departs from Today's population, and it is the reason the readout
is labeled by hours and counts rather than presented as Today's progress numbers.

#### Which tiles get a bar

`RescheduleGrid`'s eight tiles do not all resolve to a date, so not all can carry
a readout:

| Tile | Date | Window | Bar |
|---|---|---|---|
| Today | today | 8:00–21:00 | yes |
| Tonight | today | **17:00–21:00** (evening band only) | yes |
| Tomorrow | +1d | 8:00–21:00 | yes |
| This weekend | `getNextWeekend()` | 8:00–21:00 | yes |
| Next weekend | `getWeekendAfterNext()` | 8:00–21:00 | yes |
| Next week | `getNextMonday()` | 8:00–21:00 | yes |
| This month | — (pool) | — | **no** |
| Someday | — (pool) | — | **no** |

Tonight scoping to the evening band matters: on a day with a packed morning,
"Tonight" should read open, and a full-day window would say otherwise.

`useDayLoads(dates, input)` therefore memoizes six days, not ten. No fetching
beyond `useDayLoadEvents`; `tasks` come from the host, which already holds them.
The host's task branch gains its existing `useRoutines()` / `useActionableInstances()`
reads so routine units count — those hooks are already called in the same file
for the routine branch.

#### Rendering

Tile: an 8-segment bar plus `+N` all-day.

```
┌────────────────┬────────────────┐
│ ☀ Today        │ ◐ Tomorrow     │
│ ████░░░░ +5    │ █░░░░░░░ +2    │
├────────────────┼────────────────┤
│ ◑ Sat Aug 8    │ ◓ Mon Aug 10   │
│ ░░░░░░░░       │ ██████░░ +1    │
└────────────────┴────────────────┘
```

Bands: ≤25% light, 25–60% medium, >60% heavy, colored from the primary ramp —
**not** red/green. This is information, not an alarm.

Peek step, reached by tapping a tile's bar:

```
‹ Schedule for
────────────────────────────────
 THU AUG 6 · ████░░░░ 4h · 5 all-day

  all-day  Call podiatry
  all-day  Rivian reqs
           … 3 more

   9:00  Blood work JHCP
  ┌──────────────────────────┐
  │  open 10:00 – 2:00  + here│
  └──────────────────────────┘
   6:30  Ladies Track Night

  [ Put it here · all day ]
```

All-day items cap at 3 with "… N more". Open slots are tappable and schedule the
item at the slot's start. The footer button schedules all-day.

Tapping the tile's **label** still schedules directly, as today — the peek is on
the bar, so the fast path is unchanged.

## What gets deleted

- `PanelWhy`'s `editing` and `expand` state machines
- The hand-rolled schedule popover in `PanelActions.tsx:96-120`
- `TapEventPanel`'s bespoke Reschedule button and hand-built chip row
- ~15 copies of the section-label div
- The `p-5` / `p-6` shells in `TapRoutinePanel` and `TapMealPanel`

## Testing

- `dayLoad.test.ts` — pure. Fixtures built from **raw column values**, not
  hand-made `Date` objects: a hand-made Date once shipped a dead feature past 25
  green tests.
- `PanelSection.test.tsx` — collapse persists across mounts; preview renders when
  collapsed; a section without a preview doesn't render a ghost.
- `PanelNotes.test.tsx` — no editing mode exists; Escape closes wide; typing
  persists through the parent re-render.
- `SchedulePicker.test.tsx` — grid → peek → schedule at a gap; tile label still
  schedules directly; `eventsAvailable: false` degrades the label instead of
  under-reporting.
- `useDayLoadEvents.test.ts` — never writes to `GoogleCalendarProvider`.
- Existing panel tests updated for the shell change.

Then open all four panels in the running app and look at them. Type-checks are
not inspection — that rule caught a redundant panel every test passed.

Run tests with `npx vitest run` (`npm test` is watch mode) on nvm Node 22.14.0.

## Out of scope

- `TapProjectPanel` / `TapContactPanel` — not wired into the live app; projects
  and contacts use full-page views.
- The month grid tint.
- Making `GoogleCalendarProvider` merge by range.
- The planning-grid overlapping-events follow-up.
- Any change to what Today renders.

## Risks

| Risk | Mitigation |
|---|---|
| Always-mounted Tiptap in every panel | It mounts only when the section is expanded, and Notes shows only when it has content or was revealed. Collapsed = no editor, no bundle. |
| The 8:00–21:00 window is a guess | One exported constant. If the real day runs 6:00–22:00, every bar reads ~20% fuller than it should — one edit to correct. |
| Converting four panels at once | The shell and section primitives land first with their own tests, then panels convert one at a time, each verified in the app before the next. |
| Day-load fetch adds egress | One call per picker-open, session-cached, 45-day range. Compare with wall polling, the documented egress root cause, which ran continuously. |
