# Spec #2 — Routine Editing UI

**Status:** Approved design (forks A–D confirmed 2026-06-25). Ready for implementation plan.
**Branch:** `routine-collections` (builds on Spec #1, which shipped the model + Today display + per-dose completion).
**Prereq:** Spec #1 is in place — the data model and Today rendering already exist; Spec #2 is almost entirely UI + a few CRUD wirings. **No migration expected.**

## Problem

Spec #1 introduced routine **collections**: a Routine can have **Steps** (child routines via
`parent_routine_id` + `step_order`), a Step can be **dosed** (`times_per_day`), and completion is
per-dose. Today renders a collection as one collapsed row with per-dose pills. But there is **no way
to create or edit a collection by hand** — every collection so far was agent-created (the Shoulder HEP)
or seeded via SQL. Spec #2 is the human editing surface.

## Goals

A person can, entirely in the UI:
1. Create a routine collection from scratch and name it.
2. Add / remove / edit Steps in a collection (name, dose times, optional image, instructions).
3. Reorder Steps within a collection (writes `step_order`).
4. Turn several existing standalone routines into a collection ("group into routine").
5. Promote a Step back to standalone, or move it between collections (un/re-parent).

## Non-goals (explicitly out of scope)

- **Today-wide drag-and-drop** (dragging arbitrary tasks/events/routines on the timeline). Separate spec;
  unresolved reschedule-vs-reorder question. Spec #2's only DnD is **step reorder within a collection.**
- **Per-step overrides** of context/assignment/recurrence. Steps inherit these from the parent collection
  in v2. An override affordance can come later; do not build it now (YAGNI).
- Changing how Today renders collections or how completion works — Spec #1 owns that and stays untouched.

## Decisions (the four forks, resolved)

- **Fork A — surface:** Redesign the **Routines page** into a two-level list; edit via a **panel**, not a
  full page. Today stays read-only.
- **Fork B — create:** **Both** paths, with **multi-select "group existing"** as the headline (it fixes the
  real kids'-morning data that's already a pile of flat routines), plus "new empty collection."
- **Fork C — step depth:** **Lightweight** step editor (name, dose pills, image, instructions); context /
  assignment / recurrence **inherited** from the collection.
- **Fork D — reorder:** **dnd-kit** drag reorder of steps, writing `step_order`.

## What already exists (do not rebuild)

| Concern | Location |
|---|---|
| Routes (`/routines/*`): list / new / `:routineId` | `src/apps/routines/RoutinesApp.tsx` |
| Routines list | `src/components/routine/RoutinesListRedesign.tsx` |
| Full-page editor (legacy + NL) | `src/components/routine/RoutineForm.tsx` |
| Live-save detail panel (the pattern to follow) | `src/components/surface/TapRoutinePanel.tsx` |
| Reusable panel sections | `src/components/surface/sections/` (`PanelHeader`, `PanelWhy`, `PanelLocation`, `PanelFooter`) |
| Model: `Routine` (+ `parent_routine_id`, `step_order`, `times_per_day`, `image_url`, `pin_to_timeline`), `RoutineWithSteps` | `src/types/actionable.ts` |
| CRUD (`addRoutine`/`updateRoutine` already write `parent_routine_id` + `step_order`) | `src/hooks/useRoutines.ts` |
| Collection assembly (`groupRoutineSteps`, `stepSort`, `buildCollectionItem`) | `src/lib/today/routineCollections.ts` |
| Today collection render + dose pills + completion | `src/components/schedule/RoutineCollectionRow.tsx`, `src/lib/today/doseExpansion.ts` |
| dnd-kit precedent (`useDraggable`, `DragEndEvent`) | `src/components/home/week/useWeekDragDrop.ts`, `WeekEventBlock.tsx` |

## Architecture

### 1. Two-level Routines list (`RoutinesListRedesign`)

Feed the flat routine list through `groupRoutineSteps()` (already returns `{ collections: RoutineWithSteps[];
standalone: Routine[] }`). Render:
- **Collection rows** — expandable. Collapsed: name + step count + "Edit". Expanded: ordered Step rows
  (drag handle, name, dose summary) + an "Add step" affordance.
- **Standalone rows** — exactly as today (backward-compat). Parentless routines must look and behave
  unchanged; `groupRoutineSteps` already buckets them as `standalone`.

A **multi-select mode** (toggle, e.g. "Select") adds checkboxes to standalone rows; selecting ≥2 reveals a
**"Group into routine"** action in a footer/toolbar. (Collections themselves are not multi-selectable.)

### 2. Editor panels (live-save, `surface/` pattern)

Two new panels modeled on `TapRoutinePanel` — every change commits immediately via handler props (no Save
button), reusing `surface/sections/` where possible.

**`TapCollectionPanel`** — edits a collection parent:
- Name (`PanelHeader` → `onRename`)
- Context (`ContextPicker` → `onContextChange`), assignment (`MultiAssigneeDropdown` → `onAssignChange`),
  recurrence/time (`RoutineScheduleEditor` → `onScheduleChange`) — these define what the **steps inherit**.
- Step list with add / remove / reorder (see §3, §4).
- Notes (`PanelWhy`).

**`TapStepPanel`** — edits one Step (lightweight, Fork C):
- Name (`onRename`)
- **Dose pills**: add/remove time chips → writes `times_per_day` (the same dose model Today reads via
  `expandRoutineDoses`). Removing all doses = a single untimed occurrence (`times_per_day = null`).
- Optional image (`image_url`), optional instructions (`PanelWhy`).
- Context / assignment / recurrence shown **read-only as "inherited from <collection>"** (no override in v2).
- Re-parent control (see §5).

### 3. Step CRUD

All via existing `useRoutines`:
- **Add step:** `addRoutine({ parent_routine_id: collectionId, step_order: <next>, name, times_per_day })`.
- **Edit step:** `updateRoutine(stepId, { name | times_per_day | image_url | notes })`.
- **Remove step:** soft-delete/deactivate consistent with how routines are deleted today in `RoutineForm`
  (confirm the existing delete path; reuse it — do not invent a new one).

### 4. Reorder (dnd-kit, Fork D)

Wrap the expanded Step list in dnd-kit context following `useWeekDragDrop` / `useDraggable`. On `onDragEnd`,
compute the new index and **renormalize sibling `step_order` to a gap-free 0..n-1 sequence**, persisting via
`updateRoutine(stepId, { step_order })` for each moved sibling. `stepSort` already orders by `step_order`
(nulls last) then time then name, so the list re-derives correctly after writes.

### 5. Grouping & re-parenting

- **Group into routine** (from multi-select): prompt for a collection name → `addRoutine({ name,
  parent_routine_id: null })` to create the empty parent → for each selected routine,
  `updateRoutine(id, { parent_routine_id: newId, step_order: <i> })`. The selected routines become its steps.
  **Grouping only sets `parent_routine_id` + `step_order`** — it does **not** rewrite each child's stored
  context/assignment/recurrence. Those values stay on the row but become dormant: display and Today banding
  inherit from the parent collection (consistent with "no per-step override in v2"). This keeps grouping a
  safe, reversible operation — promoting a step back to standalone restores its original behavior.
- **New empty collection:** "New collection" → create empty parent → open `TapCollectionPanel` to add steps.
- **Promote step to standalone:** `updateRoutine(stepId, { parent_routine_id: null, step_order: null })`.
- **Move step between collections:** `updateRoutine(stepId, { parent_routine_id: otherId, step_order: <next> })`.

### Data flow

```
useRoutines (flat list)
  → groupRoutineSteps()  → { collections, standalone }
      → RoutinesListRedesign (two-level render + multi-select)
          → TapCollectionPanel / TapStepPanel (live-save → updateRoutine/addRoutine)
              → optimistic local update + Supabase write
                  → Today re-derives via the same selectors (no Today changes needed)
```

## Backward compatibility

- Parentless routines render and behave exactly as today (flat rows). No data backfill.
- `step_order` may be null on legacy rows; `stepSort` already handles null-last. The first reorder
  normalizes a collection's steps.
- No schema migration — all columns exist from Spec #1.

## Testing

- `routineCollections.test.ts` — extend: grouping into two-level structure; reorder/renormalize logic.
- `useRoutines.test.ts` — add: re-parent (set/clear `parent_routine_id`), `step_order` writes, add-step.
- New panel tests mirroring `TapRoutinePanel.test.tsx`: `TapCollectionPanel.test.tsx`,
  `TapStepPanel.test.tsx` (rename, dose-pill add/remove → `times_per_day`, inherited fields read-only).
- New list test: multi-select → "Group into routine" wires `parent_routine_id` on each selected routine.
- A dnd reorder unit test at the handler level (compute new order from a simulated `DragEndEvent`), since
  full drag simulation is brittle.

## Rollout

Ships on `routine-collections` (preview) alongside Spec #1; merges to main when the whole collections
feature is approved. No flag needed — the two-level list degrades to the current flat list for users with no
collections.

## Implementation task breakdown (~7–8)

1. Two-level list render in `RoutinesListRedesign` (collections expand to steps; standalone unchanged).
2. `TapCollectionPanel` (name/context/assignment/recurrence/notes + embedded step list).
3. `TapStepPanel` (name, dose pills → `times_per_day`, image, instructions; inherited fields read-only).
4. Step CRUD wiring (add/edit/remove via `useRoutines`).
5. dnd-kit step reorder + `step_order` renormalization.
6. Multi-select "Group into routine" + "New empty collection."
7. Promote/move (re-parent) controls.
8. Tests (selectors, CRUD, panels, grouping, reorder) + backward-compat checks.

---

## Addendum (2026-06-25) — per-step day override + one-noun terminology

Two decisions taken with Scott after the first build shipped to preview:

### 1. Per-step day scheduling (revises Fork C)
Fork C said steps inherit recurrence with no override. We now add an **optional per-step day
override, default inherit**:
- A step with no override shows whenever the routine runs (inherits the parent's days).
- A step may carry its own weekly days; then it only appears on those days.
- This solves shower-night vs non-shower-night bedtime as **one** routine (Shower → Tue/Thu/Sun,
  Wash face → Mon/Wed/Fri/Sat, the rest inherit) — no duplicate routines.
- **No schema change**: a step is a routine row that already has `recurrence_pattern`. "Override"
  = `recurrence_pattern.type` is `weekly`/`specific_days` with `days`; otherwise (`daily`) = inherit.
- Today filters a routine's steps to those matching the viewed date; progress counts only the
  applicable steps. (Earlier "variants + Duplicate routine" idea is **dropped** — superseded by this.)

### 2. One-noun terminology (Routine + Steps; "Collection" removed)
A "collection" is just a routine that has steps; user-facing copy must use one vocabulary:
- Drop the word "Collection" everywhere user-facing. Single `+ New routine` button (opens the
  step-capable editor; the AI natural-language quick-add is retired from the header, still at the route).
- Count = top-level routines only (steps excluded). Section header "Collections" → "Multi-step".
- "Group into routine" → "Combine into a routine". "Remove from collection" → "Remove from routine".
- Internal code identifiers (`kind:'collection'`, `routine-collection` type, component names) stay.

### Deferred (unchanged)
Collection-level assignee editing; move-step-between-collections; unifying the two routine editors
(legacy `RoutineForm` for parentless routines vs the step-capable panel) — a parentless routine still
can't gain its first step from the list without going through New routine. Tracked as follow-up.
