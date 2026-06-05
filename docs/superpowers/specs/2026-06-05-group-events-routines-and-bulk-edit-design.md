# Today — group events/routines + multi-type bulk edits

**Date:** 2026-06-05
**Branch / worktree:** `feat/today-group-tasks` (`.worktrees/today-group-tasks`)
**Status:** Design approved in brainstorming; spec for review.
**Builds on:** `2026-06-05-today-group-tasks-design.md` (task grouping — already implemented in this worktree). That spec listed "grouping non-task items (events/routines)" as out-of-scope v1; this is that follow-up, plus extending the bulk-edit actions to the new selection.

## Problem / intent

Today's multi-select + `BulkActionToolbar` only works on **tasks**. Scott wants to:

1. **Group a mix** of tasks, events, and routines into one wrapper — e.g. a "Morning" group holding the *Workout* routine + a *Standup* event + 2 tasks.
2. **Bulk-assign time / context / assignee** across the selection, not just group it.

Both are the *same job*: extend the existing tasks-only selection + toolbar to cover all three timeline types.

## The constraint that shapes everything

The three types have different capabilities, but Symphony already has **local-override** handlers for events (no Google writes), so bulk edits can cover all three more fully than first assumed. Bulk actions **adapt to what's selected** and **apply each action only to members that support it** — no silent no-ops, no writes to Google, no pattern mutation.

| Bulk action | Task | Routine | Event |
|---|---|---|---|
| **Group** | ✅ `parentTaskId` | ✅ ref on wrapper | ✅ ref on wrapper |
| **Set time** | ✅ `scheduledFor` | ✅ today-only override (`onPushRoutine`) | ✅ today-only override (`onPushEvent`, local) |
| **Set context** | ✅ `context` col | ⚠️ skip v1 (pattern-wide only) | ✅ `onUpdateEventContext` (local `event_notes`) |
| **Set assignee** | ✅ `assignedToAll` | ⚠️ skip v1 (pattern-wide only) | ✅ `onAssignEventAll` (local `event_notes`) |
| **Defer / Send-to-list** | ✅ | ❌ N/A | ❌ N/A |

**Events are fully editable via local overrides, never Google.** Verified: `onPushEvent` → `reschedule('calendar_event', …)` writes a local `actionable_instances` `deferred_to` (today-only; `grouping.ts` already reads it, lines 47–56) — it is NOT `onUpdateEvent`, which is the separate drag-to-move Google write we don't use here. `onUpdateEventContext` (→ `useEventNotes`) and `onAssignEventAll` (→ `updateEventAssignmentAll`) both persist to the local `event_notes` table. So bulk time/context/assignee on events touch only Symphony's override stores; the synced Google event is never mutated. Grouping likewise never touches the event (membership lives on the wrapper).

**Routine context/assignee are skipped in v1** because routines only have *pattern-level* `context`/`assigned_to` (no per-instance override), so changing them from a "today" bulk bar would silently alter every future occurrence. Routine *time* is fine — `onPushRoutine` is a today-only instance reschedule. Pattern edits stay in the routine editor.

### Decisions locked (brainstorming + discovered capability)
- **Heterogeneous groups** (one group, mixed types).
- **Day-scoped** groups (recurring groups deferred to a later iteration).
- **All bulk edits are day-scoped / local** — no Google writes, no routine pattern mutation.
- **Events: full bulk edit** (time/context/assignee) via existing local-override handlers.
- **Routines: time only** in the bulk bar (today-only); context/assignee deferred.

### Out of scope (v1)
Recurring groups; bulk write-back to Google events (`onUpdateEvent`); routine pattern edits (context/assignee) from the bulk bar; defer/send-to-list for non-tasks; nesting groups in groups.

## How the current code works (grounding)

- `src/components/schedule/ScheduleItem.tsx` — **already renders all three types** (`isTask`/`isRoutine`/`isEvent`) and **already has the bulk check-circle** (`bulkSelectable`/`bulkSelected`/`showBulkAffordance`/`onToggleBulkSelect`, lines ~106–111, 472–490). It's just never enabled for non-tasks.
- `src/components/schedule/TodayView.tsx`:
  - Owns `selectedTaskIds: Set<string>` — **raw task DB ids only**.
  - Passes to `ScheduleItem`: `bulkSelectable={item.type === 'task' && !!taskId}`, `bulkSelected={selectedTaskIds.has(taskId)}`, `onToggleBulkSelect={() => toggleBulkSelect(taskId)}` (~lines 684–687). **This is the task-only gate.**
  - Bulk handlers exist: `handleBulkDefer/Schedule/SetContext/Assign/Group` (~lines 158–187), each looping `selectedTaskIds`.
  - `onCompleteRoutine` / `onCompleteEvent` / `onPushRoutine` / `onPushEvent` already wired per-type (~lines 698–712) — the per-type plumbing exists.
- `src/components/schedule/BulkActionToolbar.tsx` — Group / When (`SchedulePopover`) / Send-to-list / Context / Assign / Cancel. Already takes `onGroup`.
- `src/lib/today/groupTasks.ts` — `groupTasks/removeFromGroup/ungroupTasks/deleteTaskGroup`, all via `parentTaskId` + `refetch`.
- `src/lib/today/grouping.ts` — builds `TimelineItem`s, groups by day-section, then **post-processes subtasks to sit right after their parent** (the relocation hook we extend). `TimelineItem` (`src/types/timeline.ts`) already has `parentTaskId?` and `isSubtask?` for **any** type; the render-time group-card detection in `TodayView` (~lines 585–599) keys off `nextItem.isSubtask && nextItem.parentTaskId === taskId` and is type-agnostic.
- `src/hooks/useSupabaseTasks.ts` — `addTask(...) → wrapperId`; `updateTask(id, Partial<Task>)`; maps snake_case DB ⇄ camelCase Task.

## Design

### 1. Unified selection model (TodayView)
Replace task-id selection with **timeline-item-key** selection:

```ts
// was: selectedTaskIds: Set<string>  (raw task ids)
const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
// keys are TimelineItem ids: `task-<id>` | `event-<id>` | `routine-<id>`
```

Helper (new, `src/lib/today/timelineKey.ts`):
```ts
export type TimelineRef = { type: 'task' | 'event' | 'routine'; id: string }
export function parseTimelineKey(key: string): TimelineRef { /* split on first '-' */ }
export function timelineKey(ref: TimelineRef): string { return `${ref.type}-${ref.id}` }
```
Selecting groups the **raw** ids by type when an action fires (`partitionSelection(selectedKeys) → {taskIds, eventIds, routineIds}`).

### 2. Enable the checkbox on every row (TodayView → ScheduleItem)
```ts
bulkSelectable={true}
bulkSelected={selectedKeys.has(item.id)}
showBulkAffordance={selectedKeys.size > 0}
onToggleBulkSelect={() => toggleBulkSelect(item.id)}   // item.id is the timeline key
```
No change to `ScheduleItem` internals — it already renders the affordance for any row; we just stop gating it to tasks. (Update its `aria-label` copy from "Select task" → "Select item".)

### 3. Group across types (`group_members` on the wrapper)
Tasks keep attaching via `parentTaskId` (unchanged). Events/routines attach via a new JSONB column on the **wrapper task**:

**DB migration** (via Supabase Management API — migration history is out of sync, see memory):
```sql
alter table tasks add column if not exists group_members jsonb not null default '[]'::jsonb;
```
Holds `[{ "type": "event"|"routine", "id": "<rawId>" }]`. Tasks are intentionally *not* listed here (they use `parentTaskId`). RLS unchanged (column on an already-protected row).

**Type** (`src/types/task.ts`): `groupMembers?: TimelineRef[]` mapped from `group_members` in `useSupabaseTasks` (both read mapping and `updateTask` write path).

**`groupTasks.ts` — extend `groupTasks` input + body:**
```ts
export interface GroupItemsInput {
  taskIds: string[]
  memberRefs: TimelineRef[]   // events + routines (NOT tasks)
  groupName: string; date: Date; isAllDay: boolean
  assignedTo?: string; context?: TaskContext | null
}
```
- Create wrapper (as today).
- Reparent `taskIds` via `parentTaskId` (as today).
- `updateTask(wrapperId, { groupMembers: memberRefs })`.
- `refetch()`.

`removeFromGroup` / `ungroupTasks` / `deleteTaskGroup` extend to handle non-task members: removing an event/routine = drop its ref from the wrapper's `groupMembers` (not a `parentTaskId` clear); ungroup/delete just stop referencing them (events/routines are never deleted — they aren't ours). Deleting the wrapper releases its members back to standalone.

### 4. Relocate members under the wrapper (`grouping.ts`)
**Key rendering change.** Grouped events/routines keep their real times, so they may land in a *different* day-section than the wrapper. The post-process must actively pull them under the wrapper instead of relying on adjacency:

For each wrapper task with `groupMembers` and/or subtasks:
1. Find member `TimelineItem`s across **all** sections by matching `timelineKey(item) === timelineKey(ref)`.
2. Mark each member `isSubtask = true`, `parentTaskId = wrapperId` (TimelineItem fields are type-agnostic, so the existing group-card detection + render path "just work").
3. Remove members from their original positions; insert them contiguously **right after the wrapper** in the wrapper's section.

This also hardens the existing task-subtask nesting against section mismatches. Dangling refs (event deleted in Google, routine inactive) are skipped silently.

### 5. Adaptive bulk edits (TodayView handlers + toolbar)
Each handler partitions the selection and applies per-type, then reports skips via toast:

```ts
const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
```
- **Group** (`handleBulkGroup`): `onGroupItems(taskIds, [...events, ...routines as refs], name, date, isAllDay)`. Always available, all three types.
- **Set time** (`handleBulkSchedule`): tasks → `updateTask({scheduledFor,isAllDay,bucket:'timed'})`; routines → `onPushRoutine(routineId, date)`; events → `onPushEvent(eventId, date)`. All today-only/local. No type skipped.
- **Set context**: tasks → `updateTask({context})`; events → `onUpdateEventContext(eventId, context)`; routines → skip. Toast skipped routine count.
- **Set assignee**: tasks → `onAssignTaskAll(id, memberIds)`; events → `onAssignEventAll(eventId, memberIds)`; routines → skip. Toast skipped routine count.
- **Defer / Send-to-list**: tasks only; toast skipped count if non-tasks selected.

These handlers all already exist on `ScheduleActionsContext` (`onPushEvent`, `onUpdateEventContext`, `onAssignEventAll`, `onPushRoutine`, `onAssignTaskAll`) — the work is partitioning the selection and fanning out, not new handler infra.

**Toolbar affordance:** keep all buttons visible (so the bar doesn't jump); when the selection contains items an action can't touch (routine context/assignee, or non-tasks for defer/list), the action still runs on the applicable members and the toast names what it skipped. (Simpler than per-button enable/disable logic, and the toast keeps it honest.)

### Data flow
```
check-circle on any row (ScheduleItem, now ungated)
  → selectedKeys (TodayView)  [task-/event-/routine- keys]
  → BulkActionToolbar action
  → partitionSelection → {taskIds,eventIds,routineIds}
  → per-type handler (group | time | context | assignee)
      group → onGroupItems → addTask(wrapper) + reparent tasks + updateTask(wrapper,{groupMembers})
  → refetch / optimistic update
  → grouping.ts relocates members under the wrapper card
  → toast reports any skipped members
```

## Edge cases & decisions
- **Selection mixes types, action is task-only** → run on tasks, toast the skipped count. Never a silent no-op.
- **Group with only events/routines (no tasks)** → wrapper still created; members attach via `groupMembers`. Fine.
- **Grouped event later deleted in Google** → ref dangles; relocation skips it. No error.
- **Grouped routine becomes inactive / not occurring that day** → no instance that day; ref simply matches nothing. Fine.
- **Member already in another group** → grouping moves it (last write wins): tasks reparent; event/routine ref is added to the new wrapper — also remove it from any prior wrapper's `groupMembers` during `groupItems` to avoid double-membership.
- **Completion** unchanged: routines via `onCompleteRoutine`, events via `onCompleteEvent`, tasks via `onToggleTask`. Grouping doesn't alter completion.
- **Undo** not wired (consistent with existing bulk actions). Recovery = ungroup / delete wrapper.

## Testing
- `src/lib/today/timelineKey.test.ts` — `parseTimelineKey`/`timelineKey`/`partitionSelection` round-trips, ids containing hyphens (split on first `-` only).
- `src/lib/today/groupTasks.test.ts` (extend) — `groupItems` writes `groupMembers` for events/routines, reparents tasks, and de-dups a member out of a prior wrapper.
- `src/lib/today/grouping.test.ts` (extend) — a wrapper with a 9am event member + all-day wrapper: member is relocated under the wrapper, marked `isSubtask`, removed from the morning section; dangling ref skipped.
- `BulkActionToolbar.test.tsx` (extend) — Group available regardless of selection mix.
- Manual (no logged-in e2e fixture — see memory): select a routine + event + 2 tasks → Group "Morning" → all four nest under one card; Set time on the mixed selection → all four move (tasks via `scheduledFor`, routine+event via today-only instance override); Set context → tasks+event take it, toast says "1 routine skipped"; verify the Google event itself is unchanged (only the local override moved/recolored it).

## Files touched
| File | Change |
|---|---|
| `supabase` (migration via Mgmt API) | `tasks.group_members jsonb default '[]'` |
| `src/types/task.ts` | `groupMembers?: TimelineRef[]` |
| `src/hooks/useSupabaseTasks.ts` | map `group_members` ⇄ `groupMembers` (read + update) |
| `src/lib/today/timelineKey.ts` (new) | key parse/build + `partitionSelection` |
| `src/lib/today/groupTasks.ts` | `groupItems` (events/routines via `groupMembers`); extend remove/ungroup/delete |
| `src/lib/today/grouping.ts` | relocate `groupMembers` (+ subtasks) under the wrapper across sections |
| `src/components/schedule/TodayView.tsx` | `selectedKeys` model; ungate checkbox for all types; adaptive bulk handlers + skip toasts |
| `src/components/schedule/ScheduleItem.tsx` | aria-label copy "task" → "item" (behavior already type-agnostic) |
| `src/contexts/ScheduleActionsContext.tsx` + `src/App.tsx` | `onGroupItems` (supersede/extend `onGroupTasks`) |
| `*.test.ts(x)` | the four test files above |

## Risks
- **Medium-low.** One new DB column (additive, defaulted) and one selection-model refactor (`Set<taskId>` → `Set<timelineKey>`). The render path, per-type completion/push plumbing, and the toolbar already exist; we're un-gating and generalizing, not inventing.
- The relocation change in `grouping.ts` is the most delicate piece — covered by unit tests with a cross-section member.
- No change to Google Calendar writes; events stay read-only. No routine pattern mutation.
