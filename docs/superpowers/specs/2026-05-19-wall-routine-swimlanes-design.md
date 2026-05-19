# Wall Routines — Per-Child Swimlanes + Daily-Routine Filter

**Date:** 2026-05-19
**Status:** Spec — pending review
**Branch:** `worktree-feat+wall-routine-swimlanes`
**Surface:** TV-mounted kitchen touchscreen — 8-foot viewing, tap input
**Extends:** [`2026-05-18-wall-now-grid-design.md`](2026-05-18-wall-now-grid-design.md) and the per-child grouping shipped in `aa0cac7`

---

## Problem

Two enhancements to how routines present on the wall:

1. **Swimlane polish.** The per-child Morning/Bedtime card (shipped in `aa0cac7`) is a plain two-column grid with a tiny grey label per child. It works but is visually flat and the child attribution is weak at 8 feet.
2. **Daily-routine clutter on the lists.** The right-column TODAY list and the Day-grid Today quadrant repeat low-value everyday routine steps ("brush teeth", "get dressed"). The app's Today view already has a "Hide daily activities" control (`isEverydayRoutine` filter); the wall has no equivalent.

---

## Decisions (settled in brainstorming)

- **Swimlane treatment: option C** — per-child column with a thin colored left rail + an avatar-chip header (initials on the child's color · name · `done/total`) above the existing tap-to-complete checklist.
- **Filter scope: lists only, never the routine card.** The Morning/Bedtime card *is* the daily routine and always shows it in full. The daily filter applies only to the right-column TODAY list and the Day-grid Today quadrant.
- **Toggle: wall-local, not shared with the app.** A new wall control persisted in `localStorage` (`wall-hide-daily`), default **off**, following the existing `wall-camera-enabled` pattern. It does **not** read/write the Today view's `hideRoutines` key.

---

## Part 1 — Swimlane C for Morning/Bedtime

### Data: extend `RoutineGroup`

`src/components/wall/today/groupRoutineStepsByOwner.ts` already returns `{ ownerId, label, steps }[]`. Add the matched member's display attributes so the header chip can render without the card re-resolving members:

```ts
export interface RoutineGroup {
  ownerId: string | null
  label: string
  color: string | null      // FamilyMember.color; null for the "Anyone" group
  initials: string | null   // FamilyMember.initials; null for "Anyone"
  steps: TodayItem[]
}
```

Owned groups copy `color`/`initials` from the matched `FamilyMember`. The trailing "Anyone" group sets both `null`.

### Render: `WallNowCard` morning/bedtime branch

Replace the current `grid-cols-2` plain columns with swimlane C. Per group, a column containing:

- A 4px rounded left rail in `group.color` (a neutral white/20 rail when `color` is null).
- A header row: a 22px avatar chip — `group.initials` on a `group.color` background (neutral circle, no initials, when null) — then `group.label`, then a right-aligned `done/total` progress (`steps.filter(completed).length` / `steps.length`).
- The existing `RoutineStepRow` checklist for `group.steps`, unchanged (same `aria-label`, `onCheckItem(id, !completed)`, completed styling).

Layout: `grid-cols-2` for ≥2 groups, `grid-cols-1` for one; 3+ groups wrap in the 2-col grid. Headline stays "N steps left" = sum of incomplete across all groups. The no-groups fallback (flat `routineSteps` list) is unchanged.

This is presentational only — `WallNowCard` stays prop-driven; no member lookup moves into it (the helper already carries color/initials).

---

## Part 2 — Daily-routine filter for the lists

### Plumb `isEverydayRoutine` onto `TodayItem`

`routineToTimelineItem` already sets `recurrencePattern` + `originalRoutine` on the `TimelineItem`. In `buildTodayItems` (`src/components/wall/today/todayItem.ts`), set a new optional field when the item is a routine:

```ts
export interface TodayItem {
  // …existing fields…
  isEverydayRoutine?: boolean
}
```

Computed as `kind === 'routine-step' && isEverydayRoutine(item.recurrencePattern)` using the existing `isEverydayRoutine` from `@/lib/routineUtils`. Non-routine items leave it `undefined`.

### Single filter point

`todayItemsForList` in `WallCalendar` is the one source feeding **both** the right column (`WallRightColumn todayItems=`) and the Day quadrant (`buildDayGrid({ todayItems: todayItemsForList })`). Apply a pure filter there:

```ts
// pseudocode — real impl in plan
const visibleTodayItems = hideDaily
  ? todayItemsForList.filter(i => !i.isEverydayRoutine)
  : todayItemsForList
```

Extract the predicate into a tiny tested pure helper (e.g. `filterDailyRoutines(items, hideDaily)`). Feed `visibleTodayItems` to both `WallRightColumn` and `buildDayGrid`. The Morning/Bedtime card uses `activeRoutineSteps`/`routineGroups` (a separate path) and is therefore unaffected — verified by construction, not coincidence.

`discussItems` derives from `todayItemsForList`; keep it deriving from the **unfiltered** list (a flagged discussion item must not vanish because it's also a daily routine — edge case, but be explicit).

### Toggle UI + persistence

- State in `WallCalendar`: `const [hideDaily, setHideDaily] = useState(() => localStorage.getItem('wall-hide-daily') === 'true')`; a `toggleHideDaily` that flips and writes `localStorage.setItem('wall-hide-daily', String(next))` — mirrors the existing `wall-camera-enabled` toggle exactly.
- Control: a small icon button in the right column's `TODAY` section header (it scopes that list; out of the way, glanceable). `WallRightColumn` gains `hideDaily: boolean` + `onToggleHideDaily: () => void` props and renders the button next to the `TODAY` label. Active state visually indicated (dimmed/filled icon, ≥44px tap target). Title/aria: "Hide daily routines" / "Show daily routines".

---

## Testing

- `groupRoutineStepsByOwner`: groups carry `color`/`initials` from the matched member; "Anyone" group has both `null` (extend existing tests).
- `WallNowCard` swimlane: renders a rail + avatar chip (initials) + `done/total` per child; tapping a step still calls `onCheckItem(id, !completed)`; "Anyone" group renders with neutral chip; single-group → one column; flat fallback intact.
- `buildTodayItems`: a routine-step from an everyday recurrence gets `isEverydayRoutine: true`; a weekly/non-everyday routine and tasks/events get falsy.
- `filterDailyRoutines` helper: drops everyday-routine items only when `hideDaily`; keeps tasks/events/non-daily routines; identity passthrough when off.
- `WallCalendar`: with `hideDaily` on, an everyday routine is absent from the right column **and** the Day Today quadrant but still present in the Morning/Bedtime card; toggle persists to `localStorage`; `discussItems` unaffected by the filter.
- Gates: `npm run build` clean; full `src/components/wall/` suite green; no new lint in changed files.

---

## Out of scope

- The Morning/Bedtime swimlane card is never daily-filtered.
- No shared setting with the app's Today view (`hideRoutines` key untouched).
- No change to Up Next / Pending / Family Question, the rhythm bar, the Day-grid reachability guard, or `WallQuadrantExpand`.
- No new routine actions; tap-to-complete behavior is reused unchanged.
- Avatar images (`avatar_url`) are not used — initials chip only (keeps the helper data-only and the card pure; revisit only if requested).
