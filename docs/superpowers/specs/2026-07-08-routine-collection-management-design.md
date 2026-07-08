# Routine Collection Management from Today — Design

**Problem:** Routine-collection rows on Today (e.g. "Shoulder HEP 0/9") have no management affordances — no way to hide them for a day, remove them, or edit/swap the exercises inside. The only interaction is expand/collapse and per-dose completion. Editing lives solely on /routines, and even there the entry point is undiscoverable from Today.

**Decisions (Scott, 2026-07-08):**
- "Remove" = archive to reference (`visibility: 'reference'`) — reversible, routine stays on /routines. Hard delete stays on /routines only.
- "Hide" = hide for today only — comes back tomorrow automatically.
- Editing (add/remove/reorder/swap steps) must work from Today without bouncing to /routines.

## Approach (approved: "A")

### 1. Overflow menu on `RoutineCollectionRow` header

A `…` button (ellipsis, lucide `MoreHorizontal`) on the collapsed header row, opening a small popover (same in-file pattern as the existing missed-dose menu):

- **Hide for today** → `updateRoutine(parentId, { visibility: 'reference', paused_until: <tomorrow 00:00 local ISO> })`. Reuses the existing pause mechanism: `useRoutines` auto-resume (`useRoutines.ts:109-127`) flips it back to active on the first fetch after `paused_until` passes. Zero new state or filters.
- **Edit routine** → opens the parent routine's detail panel (selection `{kind:'routine', id: parentId}`).
- **Remove from Today** → `updateRoutine(parentId, { visibility: 'reference' })` (no `paused_until` → stays archived until manually reactivated on /routines).

New optional props on `RoutineCollectionRow`: `onHideToday?: () => void`, `onRemove?: () => void`, plus wiring the existing-but-unused `onSelect` to the Edit action. `TodayView` passes them through; the mutations are implemented in `HomeViewContainer` via `useRoutines().updateRoutine` and threaded down like `onCompleteRoutine`.

### 2. Selection dispatch: `routine-collection-<uuid>`

`HomeViewContainer`'s selection dispatch (`HomeViewContainer.tsx:140-165`) currently mangles the collection item id (`routine-collection-<uuid>` → kind `routine`, id `collection-<uuid>` → panel spins forever). Special-case the `routine-collection-` prefix → `{ kind: 'routine', id: <uuid> }` so `onSelect`/Edit opens the parent panel.

### 3. Steps editing in the Today panel host

`RoutinePanelBody` (`TaskDetailPanel.tsx:280-318`) gains the steps wiring that `/routines` already has, so `TapRoutinePanel` renders `RoutineStepsSection` (guard at `TapRoutinePanel.tsx:171` requires all four props):

- `steps` = `routines.filter(r => r.parent_routine_id === id)`, sorted the same way `/routines` sorts them (reuse its sort; `step_order` then name).
- `onAddStep(name)` = create child routine (mirror `/routines`' add-step handler) — this is "swap in".
- `onReorderSteps(writes)` = `updateRoutine` per `{id, step_order}` write.
- `onSelectStep(step)` = `setSelection({ kind: 'routine', id: step.id })`.

### 4. Step panel on Today + Delete step

`RoutinePanelBody` renders **`TapStepPanel`** (instead of a bare `TapRoutinePanel`) when the looked-up routine has `parent_routine_id != null` — mirroring `RoutinesListRedesign.tsx:802-812`. Back/close returns to the parent panel (`setSelection` to parent).

`TapStepPanel` additionally gains a **Delete step** action (`onDelete?: () => void`, rendered only when passed) alongside the existing "Remove from routine" (detach/promote). Rationale: for "swap out an exercise," detaching leaves a stray standalone daily routine on Today — deletion is what the user means. Wire `onDelete` at both call sites (`RoutinesListRedesign` and the new Today host) to `useRoutines().deleteRoutine(stepId)`.

## Not in scope

- Hard-deleting collections from Today (lives on /routines).
- A "Pause until…" date picker on the Today menu (PauseRoutineModal stays /routines-only for now).
- Any change to dose expansion/completion logic.

## Testing

- `RoutineCollectionRow.test.tsx`: menu renders; Hide-for-today and Remove fire the right callbacks; Edit fires `onSelect`.
- Dispatch unit: `routine-collection-<uuid>` → `{kind:'routine', id:<uuid>}` (extract the id-parsing into a testable helper if it isn't already).
- `TapStepPanel.test.tsx`: Delete action renders when `onDelete` passed and fires it.
- Full suite must run under Node 22 (`~/.nvm/versions/node/v22.14.0/bin`) — Node 26 mass-fails happy-dom.

## Data note (done immediately, outside this feature)

Shoulder HEP (`0a43681b-27d2-4184-84de-e56e5e20d3be`) was archived to `reference` directly in prod DB on 2026-07-08 at Scott's request.
