# Wall: surface overdue items in the Timeline

**Date:** 2026-05-28
**Status:** Design — pending plan
**Scope:** Wall (kitchen kiosk / `wall-v2`) only. Mobile and desktop overdue surfaces are unchanged.

## Problem

The wall shows what's happening *today* — at-a-glance per-member next items, the timeline by part-of-day, the right column's grocery / upcoming / question — but it has no place for tasks that didn't get done in time. Anything that fell off yesterday or last week is invisible from the kitchen. The family wants the wall to catch the "we forgot the water bill" before another day passes.

## Goals

1. A family member at a glance can see which tasks slipped past their scheduled date and still need attention.
2. From the wall, they can complete or push an overdue task without picking up a phone (reuse of the existing tap → action sheet flow).
3. Quiet when there's nothing to show — no empty-state placeholder eating screen real estate.

## Non-goals

- Not changing the desktop `OverdueSection.tsx` or the mobile Overdue path. Those stay where they are.
- Not adding a per-domain wall filter. The wall is the family kiosk — work-domain overdue stays off the wall by design.
- Not adding swipe gestures on the wall. The wall is touch via the action sheet.
- Not surfacing missed routines or past events here. Missed routines are already a separate concept (streaks). Past events can't be "overdue."
- Not designing a wall-side bulk-reschedule flow. One-tap reschedule per item via the existing action sheet is enough for v1.

## Approach

Add an **Overdue** section to the existing `WallV2Timeline` — first section in the list, before All-day / Morning — that renders only when there is at least one item. Reuse the existing row schema (`WallV2TimelineEvent`) so taps go through the same `handleTapEvent` → `WallV2ItemActionSheet` flow used by all timeline rows today. No new touch surface. No new component shell.

Two alternatives considered and rejected:

- **Inline at the top of Morning** — simpler types (no section-union extension) but visually muddier; "morning" containing items from last Tuesday is confusing at 8-foot viewing distance.
- **Section + a glance card with the count** — more visibility, but the section alone is sufficient for v1. The glance card is a clean follow-up if 5 items proves too thin.

## Design

### Data filter

A task is **wall-overdue** when all of:

- `task.completed === false`
- `task.context === 'family'` (kitchen wall is the family surface — work and personal stay off)
- `task.scheduledFor` is set AND is strictly less than today's start-of-day in the wall's local timezone (i.e. `task.scheduledFor < startOfToday()`, computed once per render)
- `task.type === 'task'` (events and routines are excluded — see Non-goals)

The wall fetches **up to 5** such tasks, sorted by `scheduledFor` ascending (oldest first). Overflow is left to the mobile / desktop overdue surfaces; the wall's job is "what attention is needed right now," not "the complete overdue backlog."

The off-by-one safety: a task with `scheduledFor` falling anywhere within today (including exactly at start-of-day) counts as **today**, not overdue.

### Types

`src/components/wall-v2/types.ts` — extend the section id union:

```ts
export interface WallV2TimelineSection {
  id: 'overdue' | 'allday' | 'morning' | 'afternoon' | 'evening' | 'night'
  label: string
  icon: LucideIcon
  tint: WallV2Tint
  events: WallV2TimelineEvent[]
}
```

`WallV2TimelineEvent` is unchanged — `subtitle` carries the how-overdue label, `members` carries the assignee bubble, `kind` is `'task'`, `completed` is `false`.

### Data layer

`src/hooks/useWallData.ts` returns one new field:

```ts
export interface UseWallDataReturn {
  days: WallDayData[]
  familyMembers: FamilyMember[]
  calendarEvents: CalendarEvent[]
  screenTimeSummaries: ChildScreenTimeSummary[]
  /** Family-context tasks past their scheduled date, capped at 5,
   *  oldest first. Empty when nothing is overdue. */
  overdueTasks: Task[]
  // …existing fields…
}
```

The query lives next to the existing day fetch — same Supabase channel, same auth context. Realtime updates (a task gets completed, or its scheduled date moves forward) flow through the existing refetch path; no new subscription.

### Adapter

`src/components/wall-v2/wallV2Adapter.ts` — new function `adaptOverdueSection`:

```ts
export function adaptOverdueSection(
  overdueTasks: Task[],
  members: FamilyMember[],
  now: Date,
): WallV2TimelineSection | null {
  if (overdueTasks.length === 0) return null
  const events: WallV2TimelineEvent[] = overdueTasks.slice(0, 5).map((t) => ({
    id: `task-${t.id}`,
    icon: AlertCircle,            // lucide; calm warning glyph
    tint: 'honey',                // warm muted — not red
    title: t.title,
    subtitle: overdueLabel(t.scheduledFor!, now), // "Was due yesterday" / "3 days ago" / "2 weeks ago"
    members: t.assignedTo ? [memberBubble(members, t.assignedTo)] : undefined,
    kind: 'task',
    completed: false,
  }))
  return {
    id: 'overdue',
    label: 'Overdue',
    icon: Clock,                  // section icon
    tint: 'honey',
    events,
  }
}
```

`overdueLabel(date, now)` is a tiny formatter local to the adapter — same date-distance language as the desktop `overdueColors`/`overdueLabel` pair, in family-readable form:
- 1 day → `"Was due yesterday"`
- 2–6 days → `"3 days ago"`
- ≥ 7 days → `"2 weeks ago"` (round to nearest week)

`adaptTimelineSections` gains an `overdueTasks` argument and prepends the section when it's non-null:

```ts
export function adaptTimelineSections(
  today: WallDayData | undefined,
  members: FamilyMember[],
  now: Date,
  dinnerEvent: CalendarEvent | null,
  hideDailyRoutines: boolean,
  overdueTasks: Task[],          // ← new
): WallV2TimelineSection[] {
  const sections = /* …existing assembly… */
  const overdueSection = adaptOverdueSection(overdueTasks, members, now)
  return overdueSection ? [overdueSection, ...sections] : sections
}
```

The signature change is additive (callers pass an empty array to opt out, but in practice there is one caller — `WallV2Shell`).

### Shell wiring

`src/components/wall-v2/WallV2Shell.tsx` — pass the new field through:

```tsx
const timeline = useMemo(
  () => adaptTimelineSections(
    todayData,
    wallData.familyMembers,
    now,
    dinnerEvent,
    hideRoutines,
    wallData.overdueTasks,        // ← new
  ),
  [todayData, wallData.familyMembers, now, dinnerEvent, hideRoutines, wallData.overdueTasks],
)
```

Nothing else in the shell changes.

### Timeline rendering

`WallV2Timeline.tsx` iterates `sections.map(...)` and renders each section's `label`, `icon`, and `tint` agnostically. The overdue section gets the same treatment as any other section — no special branches. The honey tint + AlertCircle/Clock pair signals "attend to this" without screaming.

### Tap behavior

Tapping an overdue row fires the existing `handleTapEvent(event)` flow, which opens `WallV2ItemActionSheet`. The sheet keys off `event.kind === 'task'` (already wired) and offers Complete and Push. No changes to the action sheet are needed.

When the user completes or pushes an overdue task from the wall:
- Complete → existing optimistic toggle on the task; the next refetch removes it from `overdueTasks`.
- Push → existing reschedule flow; the task moves forward and drops out of the overdue query on the next refetch.

The user-visible result: the row disappears from the Overdue section on the next data tick, and if that empties the section, the section vanishes entirely.

### Empty state

When `overdueTasks.length === 0`, the section is not in the array. The timeline renders exactly as it does today — no "all caught up!" placeholder.

## Acceptance criteria

1. The wall renders an "Overdue" section at the top of the Timeline (before All-day/Morning) when one or more family-context tasks have `completed === false` and `scheduledFor < today`.
2. The section renders at most 5 rows, sorted oldest-first.
3. Each row shows the task title, a "Was due …" subtitle, the assignee avatar when present, and is tappable.
4. Tapping a row opens the existing `WallV2ItemActionSheet` with Complete and Push actions.
5. Completing or pushing a row from the wall removes it from the section on the next refetch; if that empties the section, the section disappears.
6. When no overdue tasks exist, the Overdue section is not present in the DOM.
7. Work-domain and personal-domain overdue tasks never appear on the wall.
8. `npm run build` clean. `npx vitest run` green. `npm run lint` green.
9. New adapter has unit-test coverage for: cap-at-5, oldest-first sort, family-only filter, today-cutoff off-by-one, assignee bubble presence/absence.

## Open questions

- **Refresh cadence.** `useWallData` refetches on a timer (and on explicit Refresh tap). Overdue won't shift faster than that — acceptable for v1; if "I just completed it from the wall and it took 30s to disappear" feels slow, the optimistic path on the action sheet should be extended to also remove the row from `overdueTasks` locally. Defer until observed.
- **"Was due" wording.** Family-readable was chosen over the desktop's clipped "3d" because the wall is read at 8 feet and across the room — more words, more readable. If it feels too verbose on a packed wall, we can shorten to "Yesterday" / "3d ago" / "2w ago" in a follow-up.
- **Recurring tasks.** If a task is recurring and the previous instance was missed, it shouldn't double-count with the next-scheduled instance. The data layer treats each instance as a discrete `Task`; this should be fine, but worth a spot-check during implementation.
