# Wall: scrollable overdue + tap-to-push task action sheet

**Date:** 2026-05-28
**Status:** Design — pending plan
**Scope:** Wall (kitchen kiosk / `wall-v2`) only. Mobile and desktop task surfaces are unchanged.
**Closes:** FU-1 from `2026-05-28-wall-overdue-design.md` ("tap-to-act for tasks is incomplete on the wall").

## Problem

The Overdue section landed last week and shipped two known gaps:

1. **The 5-item cap means more than five overdue tasks become invisible.** When a family member walks up to the wall and sees "Overdue (5)" knowing there are actually fifteen, they can't reach the rest from the kiosk.
2. **Tapping a task on the wall does nothing useful.** `WallV2Shell.handleTapEvent` flashes the task title for `kind === 'task'` and stops there. The existing `WallV2ItemActionSheet` only handles routines (Mark done + Skip today) and events (Skip today). Tasks have neither Complete-via-sheet nor any kind of "push to later" — the only way to complete a task from the wall is the row's checkbox, and there is no way at all to reschedule.

The family-facing ask: *let me reach all overdue items and tap one to push it to a sensible bucket — this week, next week, next month, or someday.*

## Goals

1. Every overdue family-context task is reachable from the wall, by scroll if necessary.
2. Tapping any task row (overdue or today's) opens an action sheet offering Complete plus four push presets.
3. The presets map onto the existing Task `bucket` model so the same outcome could have been achieved from desktop or mobile.
4. After a successful action, the wall refetches and the row disappears on the next render — same disappearance pattern the checkbox already uses for Complete.

## Non-goals

- No custom date picker on the wall ("Tuesday 3pm"). The four presets are the wall vocabulary; finer-grained scheduling stays on mobile/desktop.
- No "Push to today" preset — overdue tasks the family wants to do today get the checkbox, not a push.
- No new optimistic-removal path. The existing refetch-then-disappear flow (FU-2 from the previous spec) stays as-is.
- No changes to routine or event behavior in the action sheet. Their existing Mark done / Skip today buttons are untouched.
- No swipe gestures on the wall — touch on a TV-mounted 32" is tap-only by design.
- No changes to mobile/desktop's task surfaces.

## Approach

Two small changes glued by the existing wall plumbing:

1. **Drop the 5-cap** in `adaptOverdueSection` so every overdue family-context task renders. The Timeline column at `WallV2Timeline.tsx:39` already wraps its sections in `overflow-y-auto pr-1 -mr-1` — scrolling works for free.
2. **Add a task variant to `WallV2ItemActionSheet`.** The same sheet that currently handles routines and events gains a `'task'` branch with five buttons (Complete + 4 push presets) plus Cancel. `WallV2Shell.handleTapEvent` drops its task flash-fallback and opens the sheet for tasks too. A new `handleWallPushTask` callback dispatches the bucket mutation through the existing data path.

Two alternatives were considered and rejected:

- **Cap stays, "Show all (N)" expand affordance.** Quieter default, but adds a click and an extra UI affordance for what is fundamentally a "let me scroll" ask.
- **New `WallV2TaskActionSheet` component instead of extending the existing one.** Cleaner type-level separation, but duplicates ~80% of the existing sheet's chrome (overlay, card frame, title block, Cancel button). The kind-branch inside the existing sheet is the smaller, less risky change.

## Design

### Scroll: lift the cap

`adaptOverdueSection` in `src/components/wall-v2/wallV2Adapter.ts` currently caps at 5:

```ts
const capped = sorted.slice(0, 5);
```

Drop the cap entirely. The local becomes:

```ts
// No cap — the wall's Timeline column scrolls (overflow-y-auto on
// WallV2Timeline's inner section), so a long overdue list is reachable
// by scroll. The family asked for scroll; a cap would defeat it.
const events: WallV2TimelineEvent[] = sorted.map((t) => {
  // …unchanged…
});
```

The existing oldest-first sort stays. The doc comment on `adaptOverdueSection` is updated to remove the "caps at 5" claim.

**No performance concern at expected scale.** The data query at `useWallData.ts:175` has no `.limit()`, so the database already returns all overdue rows. The cap was UI-side. A family wall with 50 overdue tasks would render 50 row components — well within React's comfortable range for a kiosk that polls every 12 minutes.

### Task action-sheet variant

`WallV2ItemActionSheet` currently keys off `event.kind`:

```ts
const kind = event.kind === 'routine' ? 'routine' : 'event'
```

This binary collapses task into event. Replace with a three-way branch:

```ts
const kind: 'routine' | 'event' | 'task' = event.kind ?? 'event'
```

The render then forks on `kind === 'task'`:

```
┌──────────────────────────────────────┐
│           "Pay water bill"           │  ← title
│         Was due 3 days ago           │  ← subtitle
│                                      │
│  ┌────────────────────────────────┐  │
│  │       ✓  Mark complete         │  │  ← emerald, full-width
│  └────────────────────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐   │
│  │  This week   │ │  Next week   │   │  ← stone-100, 2-col grid
│  └──────────────┘ └──────────────┘   │
│  ┌──────────────┐ ┌──────────────┐   │
│  │  Next month  │ │   Someday    │   │
│  └──────────────┘ └──────────────┘   │
│                                      │
│             ✕  Cancel                │
└──────────────────────────────────────┘
```

- All push buttons are at least 64px tall (matches the existing routine/event buttons) and use `stone-100 dark:stone-800` background — same chrome as Skip today today.
- Complete uses the same emerald-500 style as "Mark done" on routines.
- The four push presets render in a 2-col grid via `grid grid-cols-2 gap-3`.
- Cancel and the outside-click-to-close behavior are preserved unchanged.

The sheet's prop API grows by one callback:

```ts
interface Props {
  event: WallV2TimelineEvent
  onSkip: (id: string, kind: 'event' | 'routine') => void
  onMarkDone: (id: string, kind: 'event' | 'routine' | 'task') => void   // widened
  onPushTask: (id: string, preset: PushPreset) => void                   // new
  onClose: () => void
}

export type PushPreset = 'this-week' | 'next-week' | 'next-month' | 'someday'
```

For tasks, the Skip button never renders, so `onSkip`'s task case never fires. `onMarkDone` widens to accept `'task'` because the Complete button reuses the same callback the routine path already uses — the Shell internally fans it out to `handleToggleComplete` for tasks (see Shell wiring below).

### Shell wiring

`WallV2Shell.tsx:286–303` — drop the task flash-fallback:

```ts
const handleTapEvent = useCallback((id: string) => {
  if (id.startsWith('dinner-')) {
    if (recipeUrl || recipeContent) setShowRecipeViewer(true);
    else showFlash(`Tonight: ${dinnerMealName}`);
    return;
  }
  const tapped = timeline.flatMap((s) => s.events).find((e) => e.id === id);
  if (!tapped) return;
  // Tasks now open the action sheet too (task variant) — completion +
  // push presets. Routines and events keep their existing branches.
  if (tapped.kind === 'routine' || tapped.kind === 'event' || tapped.kind === 'task') {
    setActionSheetItem(tapped);
  } else {
    showFlash(tapped.title);
  }
}, [recipeUrl, recipeContent, dinnerMealName, timeline, showFlash]);
```

New `handleWallPushTask`:

```ts
const handleWallPushTask = useCallback(async (id: string, preset: PushPreset) => {
  const taskId = id.replace(/^task-/, '');
  const updates = pushPresetToUpdates(preset);  // pure mapper, see below
  await updateTask(taskId, updates);
  wallData.refetch();
  showFlash(PUSH_FLASH[preset]);
}, [updateTask, wallData, showFlash]);
```

Where `pushPresetToUpdates` is a pure top-level function:

```ts
function pushPresetToUpdates(preset: PushPreset): Partial<Task> {
  const common = { scheduledFor: undefined, isSomeday: false } as const;
  switch (preset) {
    case 'this-week':
      return { ...common, bucket: 'week', weekDeferredAt: undefined };
    case 'next-week':
      // weekDeferredAt is the existing convention from the Task type:
      // "Set when an item already in 'week' bucket is bumped to next
      // week — sinks it to the bottom of the This Week popover."
      return { ...common, bucket: 'week', weekDeferredAt: new Date() };
    case 'next-month':
      return { ...common, bucket: 'month', weekDeferredAt: undefined };
    case 'someday':
      // 'quarter' is the longest existing bucket (90-day review). The
      // legacy isSomeday flag is explicitly cleared since the bucket
      // system replaced it.
      return { ...common, bucket: 'quarter', weekDeferredAt: undefined };
  }
}

const PUSH_FLASH: Record<PushPreset, string> = {
  'this-week':  'Pushed to this week',
  'next-week':  'Pushed to next week',
  'next-month': 'Pushed to next month',
  'someday':    'Pushed to Someday',
};
```

`handleWallMarkDone` widens to accept tasks:

```ts
const handleWallMarkDone = useCallback(async (
  id: string,
  kind: 'event' | 'routine' | 'task',
) => {
  if (kind === 'task') {
    const taskId = id.replace(/^task-/, '');
    await updateTask(taskId, { completed: true });
    wallData.refetch();
    showFlash('Marked complete');
    return;
  }
  // …existing event/routine path unchanged…
}, [/* deps */]);
```

The action-sheet JSX gains the new `onPushTask` prop:

```tsx
{actionSheetItem && (
  <WallV2ItemActionSheet
    event={actionSheetItem}
    onSkip={handleWallSkip}
    onMarkDone={handleWallMarkDone}
    onPushTask={handleWallPushTask}
    onClose={() => setActionSheetItem(null)}
  />
)}
```

### Data path

Tasks are mutated through the existing `updateTask` already used by other surfaces. The wall doesn't introduce a new mutation; it just calls it with bucket fields. Tracking, audit, and any future side-effects on `update_tasks` flow through the same channel as desktop/mobile.

### Refetch & disappearance

After a push:

- The mutation lands in Supabase.
- `wallData.refetch()` re-runs the overdue query (`scheduled_for < today AND completed=false AND context='family'`).
- Pushed tasks have `scheduledFor = null` (cleared) — they no longer match the filter and drop out of `overdueTasks`.
- `adaptOverdueSection` rebuilds; if the section is now empty, it returns `null` and the section disappears entirely (covered by Task 3 of the previous spec).

After a complete:

- The same flow runs — `completed = true` causes the task to fall out of the same query filter.

Either way the user-visible result is "row vanishes, possibly section vanishes" on the next render. No new state machinery on the wall.

## Acceptance criteria

1. The Overdue section renders every family-context, incomplete, scheduled-before-today task — no UI cap. Existing column scroll handles long lists.
2. Tapping a task row (overdue or today's) opens the action sheet in its task variant, showing Complete + four push presets + Cancel. Tapping a routine or event opens the sheet in its existing routine/event variant — unchanged behavior.
3. Tapping Complete on the task variant marks the task complete via `updateTask(id, { completed: true })` and the row vanishes after refetch.
4. Each push preset writes the exact mutation listed in the table above, then refetches; the row vanishes when the task no longer matches the overdue filter.
5. A flash message confirms each action ("Pushed to next week", "Marked complete", etc.).
6. Routine Skip today / event Skip today / dinner-recipe tap flows are unchanged.
7. `npm run lint`, `npm run build`, and `npx vitest run` are clean.
8. New tests cover: (a) the cap removal in `wallV2Adapter`, (b) the action sheet task variant's button rendering and callback wiring, (c) the `pushPresetToUpdates` mapper for all four presets, (d) the Shell's task-tap → action sheet open.

## Open questions

- **Flash wording.** "Pushed to next week" vs "Snoozed to next week" vs "Moved to next week" — pick one consistently. The spec uses "Pushed" since that's the existing Symphony vocabulary (`onPushTask` in desktop). Open to adjusting if "Pushed" reads as too engineering on a family-facing kiosk.
- **Routine tasks behavior.** If the desktop ever promotes a `kind: 'routine'` to a task-shaped object (it doesn't today, but the Timeline event union allows it), the sheet would route routines through Mark done / Skip today, not push presets. That's correct behavior; flagged so the implementer doesn't try to "fix" it.
- **`bucket: 'quarter'` for Someday — verified.** `TaskBucket` is exactly `'inbox' | 'week' | 'month' | 'quarter' | 'timed'` (`src/types/task.ts:6`). No `'someday'` bucket exists; `'quarter'` is the longest review horizon. The label "Someday" on the button is the family-readable surface; the underlying mutation uses `bucket: 'quarter'`. If the quarterly-review desktop surface ever introduces a distinct `'someday'` bucket later, this is the one spot to update.
