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

The routing decision lives in `App.tsx` ~lines 1615–1801:
```
SURFACE_PANEL_ENABLED(=true) && selectedItem ?
    task  → TapContextPanel
    meal  → TapMealPanel
    event → TapEventPanel
    else  → DetailPanel   (line 1708)
  : DetailPanel (line 1801)   ← dead branch (flag hardcoded true)
```

### Critical constraint discovered during planning (2026-05-26)
`TimelineItemType = 'task' | 'event' | 'routine'` (`src/types/timeline.ts:4`). The
panel's `selectedItem` can **only** be a task, event, or routine — never a project
or contact. `selectedItemProject` / `selectedContact` are merely the *linked*
project/contact of the selected item (`useDetailPanelState.ts:142–144`), shown as
relational context. Projects and contacts are opened as **full-page views**
(`ProjectView` / `ContactView` via the view router), not in this panel.

**Consequences:**
- The `else → DetailPanel` fallback (line 1708) is reached **only by routines**.
  `DetailPanelRedesign`'s sole live job in `App.tsx` is the routine detail view.
- The second `DetailPanel` (line 1801) is the `!SURFACE_PANEL_ENABLED` branch and is
  **already dead** (flag hardcoded `true`).
- `TapProjectPanel` / `TapContactPanel` exist + are tested but are **not reachable**
  from this panel and are **not** part of retiring `DetailPanelRedesign`. Wiring them
  would mean replacing the full-page `ProjectView`/`ContactView` — a **separate effort**
  (see Non-Goals). This corrects the earlier Phase 1 framing.

## Design — phased (corrected scope: routine-centric)

Because routines are the only live type still on `DetailPanelRedesign`, retiring it
from `App.tsx` reduces to: build a routine Tap panel, reach task-editor parity, then
remove the fallback + flag.

### Phase 1 — Complete the task panel (parity)
Add the two editable controls `DetailPanelRedesign` had that `TapContextPanel`
lacks, plus wire the four stubbed `onOpen*` handlers:
- `ContextPicker` (work/family/personal) — shared component from `triage/`,
  signature `{ value, onChange }`.
- `MultiAssigneeDropdown` — shared component from `family/`, signature
  `{ members, selectedIds, onSelect, label? }`. Task assignees live on
  `task.assignedToAll?: string[]` (legacy single: `task.assignedTo?: string`).
- Wire `onOpenContact` / `onOpenProject` (→ existing `handleOpenContact` /
  `handleOpenProject`), `onOpenMember`, `onOpenEvent` (currently `() => {}` at
  App.tsx ~1655). TDD: extend `TapContextPanel.test.tsx`.

### Phase 2 — Build `TapRoutinePanel`
New panel in `surface/` following the `TapProjectPanel` composition pattern
(`PanelHeader`, `PanelMetaRow`, `PanelWhy` for notes, `PanelFooter`).
Routine content: name, recurrence pattern, time-of-day, context picker
(work/family/personal), active/reference visibility, notes. **No** prep/follow-up
template UI (0 usage). TDD: add `TapRoutinePanel.test.tsx` mirroring the siblings.

### Phase 3 — Wire routing + retire legacy from the live path
- Add `selectedItem.type === 'routine'` → `TapRoutinePanel` ahead of the
  `else → DetailPanel` fallback (App.tsx ~1706).
- The `else` fallback (1708) is now unreachable → remove it.
- Remove the `SURFACE_PANEL_ENABLED` flag (always-on) and the dead
  `!SURFACE_PANEL_ENABLED` branch (the second `DetailPanel`, line 1801).
- Make `/task/:id` deep-links / `task-detail` navigation open the **panel**
  (panel-only; remove full-page `TaskViewRedesign` navigation from the live path).
- `App.tsx` no longer imports/renders `DetailPanelRedesign`. **Do not delete the
  file** — `shell/LegacyDetailPanelHost.tsx` and `apps/tasks/*` (dormant Shell)
  still import `DetailPanelRedesign` / `TaskViewRedesign`. Verify with grep; remove
  only files that become truly orphaned (e.g. pre-Redesign `DetailPanel`/`TaskView`
  if unreferenced).

## Non-Goals
- The Shell / P5 cutover (auth-gate lift, `useNewTasks` flip) — separate, stalled
  effort. We neither finish nor delete it; we only stop the **live** `App.tsx` path
  from using the old panels.
- **Wiring `TapProjectPanel` / `TapContactPanel`.** They're built + tested but
  unreachable from this panel (projects/contacts are full-page `ProjectView` /
  `ContactView`). Using them = replacing those full-page views — a separate,
  optional follow-up effort. Out of scope here.
- Deleting `DetailPanelRedesign` / `TaskViewRedesign` files (still imported by the
  dormant Shell). We only remove their **live `App.tsx` usage**.
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
