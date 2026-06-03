# Today-view assignment, multi-select filter & bulk actions — plan

> Executed by the author session, in worktree `.worktrees/routine-panel` off `origin/main`. TDD, frequent commits, deploy per coherent unit.

**Context:** Scott reported (all on the main web app's Today view):
1. ✅ DONE — Routine detail panel went blank when flipping to "Reference" (fixed: `useDetailPanelState` now looks up `allRoutines`; commit `01a0c05`).
2. Person filter doesn't filter / "can't check more than one user" — the multi-select is collapsed to single by lossy adapters.
3. Bulk-assign: select several Today items → assign to a person + set This/Next Weekend.
4. Routine panel is sparse + "Reference" is cryptic.

Design decisions (confirmed with Scott):
- Bulk-select entry = **hover checkbox on each row + a bottom action bar** (Assign · Schedule …). Selecting 1+ shows the bar.
- Routine panel = **enrich (assignee picker + streak) + relabel** the Active/Reference toggle ("On timeline" / "Reference") with a one-line hint.
- Multi-person filter = **union** (show items assigned to ANY selected person), applied consistently INCLUDING the Carried-over section.

---

## Workstream A1 — True multi-select person filter (BUG)

**Root cause:** `HomeView` holds `selectedAssignees: string[]` correctly, but derives a single `selectedAssigneeForSchedule` that is `null` when 2+ are selected (HomeView.tsx:173-177). `TodayView` then collapses any multi-selection to `ids[0]` (TodayView.tsx:340,390) and the data pipeline's matcher takes a single id. Net: a 2nd check replaces the 1st, and with 2+ "selected" the filter matches everything.

**Fix:** thread the full array through Today's data pipeline and the matcher; match by union. Leave Week/Month/Inbox consumers on the existing single-value path for now (out of scope — they use `selectedAssigneeForSchedule`).

**Files:**
- Modify: `src/lib/today/types.ts` — `AssigneeFilter`
- Modify: `src/lib/today/assigneeFilter.ts` — matcher
- Modify: `src/lib/today/assigneeFilter.test.ts` (create if absent)
- Modify: `src/lib/today/computeTodayData.ts` — pass-through
- Modify: `src/components/schedule/TodayView.tsx` — prop + AssigneeFilter wiring + data input
- Modify: `src/components/home/HomeView.tsx` — pass array to TodayView

### Task A1.1 — Matcher accepts a set (TDD)
- [ ] Change `AssigneeFilter` in `types.ts` to `readonly string[] | null | undefined`. Empty/null/undefined = "everyone".
- [ ] Rewrite `makeAssigneeFilter` to union-match:

```typescript
export function makeAssigneeFilter(selected: AssigneeFilter) {
  const ids = Array.isArray(selected) ? selected.filter(Boolean) : []
  return (
    assignedTo: string | null | undefined,
    assignedToAll?: readonly string[] | null,
  ): boolean => {
    if (ids.length === 0) return true // everyone
    const hasMulti = Array.isArray(assignedToAll) && assignedToAll.length > 0
    return ids.some((id) => {
      if (id === 'unassigned') return !assignedTo && !hasMulti
      if (assignedTo === id) return true
      return hasMulti && assignedToAll!.includes(id)
    })
  }
}
```

- [ ] Failing tests in `assigneeFilter.test.ts`: everyone (empty), single id matches assignedTo and assignedToAll, `unassigned`, and **union** (selecting ['iris','ella'] matches a task assigned only to ella AND one assigned only to iris, but NOT one assigned only to scott).
- [ ] Run: `npx vitest run src/lib/today/assigneeFilter.test.ts` → green. Commit.

### Task A1.2 — Pipeline + TodayView + HomeView plumbing
- [ ] `TodayDataInput.selectedAssignee` stays the prop name but its type is now the array form; `computeTodayData` needs no logic change (matcher handles it). Update `useTodayData.test.ts` fixture (`selectedAssignee: null` still valid).
- [ ] `TodayView`: replace `selectedAssignee?: string | null` prop with `selectedAssignees?: string[]`. Pass `selectedAssignees ?? []` to both `AssigneeFilter` instances (lines ~340, ~390) and into the `useTodayData` input (`selectedAssignee: selectedAssignees ?? []`). Replace the `onSelectAssignee(ids[0])` adapters with a direct `onSelectAssignees` pass-through.
- [ ] `HomeView`: pass `selectedAssignees={selectedAssignees}` and `onSelectAssignees={setSelectedAssignees}` to `TodayView` (drop the `selectedAssigneeForSchedule`/`onSelectAssignee` single adapters **for the TodayView call only**; keep them for Week/Month/Inbox calls).
- [ ] `tsc --noEmit`, run today-related tests. Commit. Deploy (push to main).
- [ ] **Verify** post-deploy: selecting Iris alone hides Scott-only "Organize cords"; selecting Iris+Ella shows items for either; carried-over respects it.

---

## Workstream A2 — Bulk select + action bar (FEATURE)

**Existing assets (reuse):** `src/components/schedule/BulkActionToolbar.tsx` already supports `selectedCount`, `onAssign(memberIds)`, `onSchedule`, `onSetContext`, `onDefer`, with a `MultiAssigneeDropdown`. It was built but never wired in. `src/contexts/ScheduleActionsContext.tsx` exposes `onAssignTaskAll(taskId, memberIds)` and `onUpdateTask(taskId, updates)`. `HomeView` has `handleUpdateTasksBulk(taskIds, updates)`.

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — hover select checkbox
- Modify: `src/components/schedule/TodayView.tsx` — selection state + render `BulkActionToolbar`
- Modify: `src/components/schedule/BulkActionToolbar.tsx` — ensure Schedule offers This/Next Weekend
- Possibly: `src/components/home/HomeView.tsx` — pass bulk handlers down

### Tasks
- [ ] Selection state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())` in TodayView (task rows only). Helpers: toggle, clear.
- [ ] `ScheduleItem`: when `selectable`, render a small select checkbox to the left that appears on row hover (and stays visible once selected); calls `onToggleSelect(taskId)`. 80×80 not needed (desktop), but ≥24px hit area. Only for `type==='task'` rows (not events/routines for v1).
- [ ] Render `BulkActionToolbar` (fixed bottom, centered) when `selectedIds.size > 0`. Wire:
  - `onAssign(memberIds)` → for each selected task `onAssignTaskAll(taskId, memberIds)`; then clear.
  - `onSchedule(date,isAllDay)` → for each, `onUpdateTask(taskId, { scheduledFor: date, isAllDay, bucket: 'timed' })`.
  - Add **This Weekend / Next Weekend** quick options to the toolbar's schedule menu using `getNextWeekend()` / `getWeekendAfterNext()` (same all-day-Saturday behavior shipped on the kiosk). Reuse `pushPresetToUpdates`-style mapping or inline.
  - `onClear` (×) → clear selection.
- [ ] Tests: a `BulkActionToolbar` render/handler test (assign fires with member ids; weekend schedule fires with a Saturday). Selection toggle unit if extractable.
- [ ] `tsc`, tests, build. Commit. Deploy. Verify: select "Distribute donation clothes" + "pickup library books", Assign→Iris, Schedule→This weekend; both update.

---

## Workstream B — Routine panel enrichment + relabel (UX)

**Files:**
- Modify: `src/components/surface/TapRoutinePanel.tsx`
- Reuse: an assignee picker (`MultiAssigneeDropdown` or `AssignPicker`); streak source (check `useRoutines`/actionable streak — find existing streak calc used on the wall card `🔥 5`).
- App wiring: `src/App.tsx` (~1663-1682) passes routine + handlers to `TapRoutinePanel`.

### Tasks
- [ ] Relabel the toggle: "Active" → "On timeline", "Reference" → "Reference", with a one-line hint under it: "Reference keeps the routine but hides it from Today." Keep the `visibility` values unchanged.
- [ ] Add an assignee picker row (who does this routine) bound to `routine.assigned_to` / `assigned_to_all`; wire an `onAssignChange` → `updateRoutine(id, { assigned_to_all })`. Confirm `updateRoutine` accepts assignment fields.
- [ ] Add the streak (reuse the same streak value the wall shows — locate its source; if it's computed from `actionable_instances`, surface it read-only). If no easy streak source on web, show last-completed/next-due instead (decide while implementing; do NOT invent a fake streak).
- [ ] Tests: extend `PanelSteps`/add a `TapRoutinePanel` smoke test (renders relabeled toggle + assignee).
- [ ] `tsc`, tests, build. Commit. Deploy.

---

## Sequencing
A1 first (top pain, foundational), then A2 (depends on multi-assignee plumbing being sane), then B (independent). Deploy after each workstream. Rebase onto `origin/main` before every push.
