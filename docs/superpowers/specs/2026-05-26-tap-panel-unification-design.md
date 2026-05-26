# Tap Panel Unification — Design

**Date:** 2026-05-26
**Status:** Approved (design); implementation plan to follow
**Related:** `2026-05-08-surface-design.md` (original single-scroll Surface panel spec)

## Problem

"Redundant and conflicting" task UI is really the residue of a half-finished
migration. The live app (`App.tsx`) opens entity detail through a mix of surfaces:

- **`TapContextPanel`** (new single-scroll panel, `surface/`) — handles **tasks**;
  `TapEventPanel` / `TapMealPanel` handle events/meals. Gated by
  `SURFACE_PANEL_ENABLED = true` in `src/components/surface/flag.ts`.
- **`DetailPanelRedesign`** (`src/components/detail/DetailPanelRedesign.tsx`,
  3,414 lines) — the fallback for **projects, contacts, routines**, and anything
  not yet routed to a Tap panel (`App.tsx` ~line 1706).
- **Full-page `TaskViewRedesign`** — reachable via `stateView === 'task-detail'`.

A second generation (`shell/Shell.tsx` + `apps/`, the "P5 cutover") is built but
**off by default** (`localStorage 'symphony.useNewTasks'`), stalled on lifting the
auth gate into Shell. **This effort does not touch the Shell cutover** — see Non-Goals.

## Goal

One canonical detail surface — the `surface/` Tap panels — for **every** entity
type in the **live** `App.tsx` path. Retire `DetailPanelRedesign` and full-page
`TaskViewRedesign` from that path.

## Key finding: the "extra" features are unused

`DetailPanelRedesign` carries heavier features the Tap panels lack. Usage measured
against the live DB (2026-05-26):

| Feature | Usage | Decision |
|---|---|---|
| File attachments (`attachments` table) | **1 row total** | Drop |
| Routine prep/follow-up task templates (`prep_task_templates`, `followup_task_templates`) | **0 of 59 routines** | Drop |
| Event message threads (`MessageThread`) | **backing tables don't exist** (dead code) | Drop |
| Action-detection (recipes/maps/phones in text) | runtime-only, no data | Drop (re-add later if missed) |

Per the user's "port only what you use" decision, **none of these are ported.**
This is what makes the consolidation lean — especially `TapRoutinePanel`, which
needs no template UI.

## Inventory (what exists today)

| Panel | File | State |
|---|---|---|
| `TapContextPanel` (task) | `surface/TapContextPanel.tsx` | **Live**; missing `ContextPicker` + `MultiAssigneeDropdown` (TODO in App.tsx) |
| `TapEventPanel`, `TapMealPanel` | `surface/` | **Live** |
| `TapProjectPanel` | `surface/TapProjectPanel.tsx` | **Built + tested, not wired** |
| `TapContactPanel` | `surface/TapContactPanel.tsx` | **Built + tested, not wired** |
| `TapRoutinePanel` | — | **Does not exist** |

The routing decision lives in `App.tsx` ~lines 1615–1760: `SURFACE_PANEL_ENABLED &&
selectedItem` then branches by `selectedItem.type` (`task` → TapContextPanel,
`event` meal → TapMealPanel, `event` → TapEventPanel, **else → DetailPanel**).
Projects/contacts/routines fall into the `else`.

## Design — phased

### Phase 1 — Wire existing panels (low risk, biggest dedup)
Add `selectedItem.type === 'project'` → `TapProjectPanel` and
`selectedItem.type === 'contact'` → `TapContactPanel` branches to the App.tsx
routing, ahead of the `DetailPanel` fallback. Both panels already exist and have
tests; this is wiring + handler plumbing (the `onOpen*` handlers currently stubbed
as `() => {}` in App.tsx ~1655 get real implementations where the panels need them).

**Boundary check:** each Tap panel takes its entity + the handler set it needs and
renders independently. After Phase 1 the only types still hitting `DetailPanel` are
`routine` (and any unforeseen type).

### Phase 2 — Complete the task panel
Add the two missing controls to `TapContextPanel` (and its `PanelActions` /
meta row as appropriate):
- `ContextPicker` (work/family/personal) — shared component from `triage/`.
- `MultiAssigneeDropdown` — shared component from `family/`.

Wire to the existing task-update handlers. After this, `TapContextPanel` is a
feature-complete replacement for `DetailPanelRedesign`'s task mode. TDD: extend
`TapContextPanel.test.tsx`.

### Phase 3 — Build `TapRoutinePanel`
New panel in `surface/` following the established section composition pattern
(`PanelHeader`, `PanelMetaRow`, `PanelActions`, `PanelWhy` for notes, `PanelFooter`).
Routine-specific content:
- Name (inline edit), recurrence pattern display/edit, time-of-day.
- Context picker (work/family/personal), visibility (active/reference) toggle.
- Notes.
- **No** prep/follow-up template UI (0 usage).

Wire `selectedItem.type === 'routine'` → `TapRoutinePanel`. TDD: add
`TapRoutinePanel.test.tsx` mirroring the sibling panels' tests.

### Phase 4 — Retire legacy from the live path
- Remove the `DetailPanel` (DetailPanelRedesign) fallback branch from App.tsx now
  that all live types route to Tap panels.
- Remove the `SURFACE_PANEL_ENABLED` flag (always-on) and its dead branch.
- Make `/task/:id` deep-links and any `task-detail` navigation open the **panel**
  (panel-only; full-page `TaskViewRedesign` navigation removed from the live path).
- Delete components that become unreferenced **by the live path AND not referenced
  by Shell/apps** (verify with grep before each deletion). `DetailPanelRedesign`,
  `TaskViewRedesign`, and old `DetailPanel`/`TaskView` are deletion **candidates**,
  but `TaskViewRedesign` is still imported by `apps/tasks/*` for the dormant Shell —
  so it is **not deleted here**; only its live-path usage is removed. Truly-orphaned
  files are deleted; Shell-referenced files are left for the P5 effort.

## Non-Goals
- The Shell / P5 cutover (auth-gate lift, `useNewTasks` flip) — separate, stalled
  effort. We neither finish nor delete it; we only stop the **live** `App.tsx` path
  from using the old panels.
- Re-adding attachments / templates / message threads / action-detection.
- Touching event/meal panels (already live and working).

## Risks & mitigations
- **Hidden DetailPanelRedesign capability** used for a type we think is covered →
  before Phase 4 deletion, diff each Tap panel against the DetailPanelRedesign
  branch for that type and confirm parity (notes, links, scheduling, delete, open-related).
- **Shell breakage** from deleting a shared file → grep every deletion candidate for
  references under `shell/` and `apps/`; keep anything Shell imports.
- **Deep-link regression** (`/task/:id`) → keep the route; change its target to the
  panel; cover with the existing routing tests.

## Testing
- Per-panel unit tests (extend `TapContextPanel.test.tsx`, add `TapRoutinePanel.test.tsx`).
- Routing: tests asserting each `selectedItem.type` mounts the correct Tap panel and
  that nothing mounts `DetailPanelRedesign`.
- `npm run build` (Vercel uses `tsc -b`, stricter than the pre-push `tsc --noEmit`).

## Success criteria
- Every entity type opens a `surface/` Tap panel in the live app; `DetailPanelRedesign`
  is not rendered by `App.tsx`.
- `SURFACE_PANEL_ENABLED` flag removed.
- No feature regression for the capabilities that are actually used (notes, links,
  schedule, context, assignees, complete, delete, open-related, subtasks).
- Build + tests green.
