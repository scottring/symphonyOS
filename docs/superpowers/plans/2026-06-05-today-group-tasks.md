# Today — Group Selected Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Group" action to the Today multi-select bar that wraps the selected tasks into a new parent task (named, scheduled), with the selected tasks reparented as its subtasks so they nest under it on Today.

**Architecture:** Reuse the existing hover-checkbox multi-select on Today. The pure orchestration (create wrapper via `addTask`, reparent children via `updateTask`) lives in a unit-tested helper `src/lib/today/groupTasks.ts`. `App.tsx` exposes it as a new `onGroupTasks` context action; `BulkActionToolbar` gets a "Group" button + a name/when popover; `TodayView` wires the two together. No DB migration — reuses `parent_task_id`. No change to `grouping.ts` (children inherit the wrapper's time → same day-section → existing nesting applies).

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library, lucide-react icons, Supabase task hooks.

**Spec:** `docs/superpowers/specs/2026-06-05-today-group-tasks-design.md`

**Worktree:** `.worktrees/today-group-tasks` (branch `feat/today-group-tasks`, off `main`). `node_modules` is symlinked and `.env` copied. Run all commands from the worktree root.

**Env note:** prepend Node to PATH for every shell:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
Use `npx vitest run` (one-shot; bare `npm test` is watch mode).

---

## File Structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/lib/today/groupTasks.ts` | Pure orchestration: create wrapper + reparent children (deps injected) | Create |
| `src/lib/today/groupTasks.test.ts` | Unit tests for the helper | Create |
| `src/components/schedule/BulkActionToolbar.tsx` | Add "Group" button + name/when popover | Modify |
| `src/components/schedule/BulkActionToolbar.test.tsx` | Tests for the Group affordance | Create |
| `src/contexts/ScheduleActionsContext.tsx` | Add `onGroupTasks?` to the value type | Modify |
| `src/App.tsx` | Implement `onGroupTasks` in the provider value | Modify |
| `src/components/schedule/TodayView.tsx` | `handleBulkGroup`, destructure `onGroupTasks`, pass `onGroup` to toolbar | Modify |

---

## Task 1: Pure grouping helper (`groupTasks`)

**Files:**
- Create: `src/lib/today/groupTasks.ts`
- Test: `src/lib/today/groupTasks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/groupTasks.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { groupTasks } from './groupTasks'

describe('groupTasks', () => {
  const date = new Date('2026-06-06T00:00:00')

  it('creates a wrapper then reparents each child to it, returns wrapper id', async () => {
    const addTask = vi.fn().mockResolvedValue('wrapper-1')
    const updateTask = vi.fn().mockResolvedValue(undefined)

    const result = await groupTasks(
      { taskIds: ['a', 'b'], groupName: 'Sat AM errands', date, isAllDay: true,
        assignedTo: 'me', context: 'family' },
      { addTask, updateTask },
    )

    expect(result).toBe('wrapper-1')
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(addTask).toHaveBeenCalledWith(
      'Sat AM errands', undefined, undefined, date,
      { isAllDay: true, assignedTo: 'me', context: 'family' },
    )
    expect(updateTask).toHaveBeenCalledTimes(2)
    expect(updateTask).toHaveBeenNthCalledWith(1, 'a',
      { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true })
    expect(updateTask).toHaveBeenNthCalledWith(2, 'b',
      { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true })
  })

  it('aborts (no reparenting) when wrapper creation fails', async () => {
    const addTask = vi.fn().mockResolvedValue(undefined)
    const updateTask = vi.fn().mockResolvedValue(undefined)

    const result = await groupTasks(
      { taskIds: ['a'], groupName: 'x', date, isAllDay: true },
      { addTask, updateTask },
    )

    expect(result).toBeUndefined()
    expect(updateTask).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/groupTasks.test.ts`
Expected: FAIL — `groupTasks` is not defined / cannot find module `./groupTasks`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/today/groupTasks.ts`:

```ts
import type { Task, TaskContext } from '@/types/task'

/** Options accepted by useSupabaseTasks.addTask (subset used here). */
interface AddTaskOpts {
  isAllDay?: boolean
  assignedTo?: string
  context?: TaskContext | null
}

export interface GroupTasksDeps {
  addTask: (
    title: string,
    contactId: string | undefined,
    projectId: string | undefined,
    scheduledFor: Date | undefined,
    options: AddTaskOpts,
  ) => Promise<string | undefined>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void> | void
}

export interface GroupTasksInput {
  taskIds: string[]
  groupName: string
  date: Date
  isAllDay: boolean
  assignedTo?: string
  context?: TaskContext | null
}

/**
 * Create a wrapper task and reparent the selected tasks under it. Each child
 * inherits the wrapper's date/all-day so it lands in the same Today day-section
 * and nests under the wrapper (see lib/today/grouping.ts). Returns the new
 * wrapper id, or undefined if wrapper creation failed (in which case no child
 * is touched).
 */
export async function groupTasks(
  input: GroupTasksInput,
  deps: GroupTasksDeps,
): Promise<string | undefined> {
  const { taskIds, groupName, date, isAllDay, assignedTo, context } = input
  const wrapperId = await deps.addTask(groupName, undefined, undefined, date, {
    isAllDay,
    assignedTo,
    context,
  })
  if (!wrapperId) return undefined
  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  return wrapperId
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/groupTasks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/groupTasks.ts src/lib/today/groupTasks.test.ts
git commit -m "feat(today): groupTasks helper — create wrapper + reparent children"
```

---

## Task 2: "Group" button + name/when popover in `BulkActionToolbar`

**Files:**
- Modify: `src/components/schedule/BulkActionToolbar.tsx`
- Test: `src/components/schedule/BulkActionToolbar.test.tsx` (create)

Context: `BulkActionToolbar` currently takes `selectedCount`, `onDefer`, `onSchedule`, `onSetContext`, `onAssign`, `onSendToList`, `onCancel`, and data props. It renders inside a `createPortal` to `document.body`. We add an optional `onGroup` prop and a self-contained popover with a name input + a `SchedulePopover` for the when (defaults to today / all-day).

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/BulkActionToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkActionToolbar } from './BulkActionToolbar'

const baseProps = {
  selectedCount: 2,
  onDefer: vi.fn(),
  onSchedule: vi.fn(),
  onSetContext: vi.fn(),
  onAssign: vi.fn(),
  onSendToList: vi.fn(),
  onCancel: vi.fn(),
}

describe('BulkActionToolbar — Group action', () => {
  it('hides the Group button when onGroup is not provided', () => {
    render(<BulkActionToolbar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /group/i })).toBeNull()
  })

  it('opens the name popover and disables Create until a name is typed', () => {
    render(<BulkActionToolbar {...baseProps} onGroup={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^group$/i }))

    const create = screen.getByRole('button', { name: /create group/i })
    expect(create).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/name this group/i), {
      target: { value: 'Sat AM errands' },
    })
    expect(create).toBeEnabled()
  })

  it('calls onGroup with the trimmed name and a default when (today, all-day)', () => {
    const onGroup = vi.fn()
    render(<BulkActionToolbar {...baseProps} onGroup={onGroup} />)
    fireEvent.click(screen.getByRole('button', { name: /^group$/i }))
    fireEvent.change(screen.getByPlaceholderText(/name this group/i), {
      target: { value: '  Sat AM errands  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create group/i }))

    expect(onGroup).toHaveBeenCalledTimes(1)
    expect(onGroup).toHaveBeenCalledWith('Sat AM errands', expect.any(Date), true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/BulkActionToolbar.test.tsx`
Expected: FAIL — no "Group" button / no "Name this group" input found.

- [ ] **Step 3: Implement the Group button + popover**

Edit `src/components/schedule/BulkActionToolbar.tsx`.

3a. Update imports at the top of the file — add `useState`, the `FolderPlus` icon, and a default-date helper:

```tsx
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderPlus } from 'lucide-react'
```
(Keep the existing imports: `TaskContext`, `FamilyMember`, `List`/`ListCategory`, `ScheduleContextItem`, `SchedulePopover`, `ContextPicker`, `ListPicker`, `MultiAssigneeDropdown`, `useMobile`.)

3b. Add `onGroup` to the props interface (after `onCancel`):

```tsx
  onCancel: () => void
  onGroup?: (name: string, date: Date, isAllDay: boolean) => void
```

3c. Add `onGroup` to the destructured params (after `onCancel,`):

```tsx
  onCancel,
  onGroup,
```

3d. Inside the component body, before `return createPortal(`, add local popover state and a helper for the default "today" date:

```tsx
  const [grouping, setGrouping] = useState(false)
  const [groupName, setGroupName] = useState('')
  // Default the group's slot to today, all-day. The user can change it via the
  // nested SchedulePopover. Computed once when the popover opens.
  const [groupDate, setGroupDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [groupIsAllDay, setGroupIsAllDay] = useState(true)

  const openGrouping = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setGroupDate(d)
    setGroupIsAllDay(true)
    setGroupName('')
    setGrouping(true)
  }
  const submitGroup = () => {
    const name = groupName.trim()
    if (!name || !onGroup) return
    onGroup(name, groupDate, groupIsAllDay)
    setGrouping(false)
  }
```

3e. In the actions row (the `<div className={`flex items-center ...`}>` block), add the Group button as the **first** child, before the `<SchedulePopover .../>` "When" control:

```tsx
          {/* Group — wrap selected tasks into a new parent task */}
          {onGroup && (
            <button
              type="button"
              onClick={openGrouping}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              Group
            </button>
          )}
```

3f. Add the grouping popover. Place it just before the final closing `</div>` of the inner toolbar card (after the Cancel button), so it renders within the portal:

```tsx
        {/* Name + when popover for "Group" */}
        {grouping && onGroup && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
            <input
              autoFocus
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitGroup()
                if (e.key === 'Escape') setGrouping(false)
              }}
              placeholder="Name this group"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <SchedulePopover
                value={groupDate}
                isAllDay={groupIsAllDay}
                onSchedule={(date, isAllDay) => { setGroupDate(date); setGroupIsAllDay(isAllDay) }}
                onClear={() => {}}
                getItemsForDate={getScheduleItemsForDate || (() => [])}
                itemTitle={groupName || 'group'}
              />
              <button
                type="button"
                onClick={submitGroup}
                disabled={!groupName.trim()}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create group
              </button>
            </div>
          </div>
        )}
```

3g. The inner toolbar card `<div>` needs `relative` positioning so the `absolute` popover anchors to it. Add `relative` to its className (the `bg-white rounded-xl border ...` div):

```tsx
      <div
        className={`relative bg-white rounded-xl border border-neutral-200 shadow-lg ${
          isMobile
            ? 'p-3 w-full'
            : 'p-4 max-w-2xl flex items-center gap-4'
        }`}
      >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/BulkActionToolbar.test.tsx`
Expected: PASS (3 tests).

If the third test fails because `SchedulePopover` requires extra context to render, the name-input + Create path still works; confirm the failure is unrelated to our logic, and if `SchedulePopover` throws in jsdom, wrap the assertion by querying the Create button directly (it does not depend on SchedulePopover). Do NOT stub our own code — only adapt the test to SchedulePopover's environment needs.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/BulkActionToolbar.tsx src/components/schedule/BulkActionToolbar.test.tsx
git commit -m "feat(today): Group button + name/when popover in BulkActionToolbar"
```

---

## Task 3: Add `onGroupTasks` to the context type

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx`

- [ ] **Step 1: Add the optional handler to the value interface**

In `src/contexts/ScheduleActionsContext.tsx`, inside `interface ScheduleActionsValue`, add (next to `onCreateTask`):

```ts
  onGroupTasks?: (
    taskIds: string[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: exit 0 (no errors). The field is optional, so existing providers/consumers still typecheck.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/ScheduleActionsContext.tsx
git commit -m "feat(today): add onGroupTasks to ScheduleActions context type"
```

---

## Task 4: Implement `onGroupTasks` in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Context: the `ScheduleActions` provider value is built in `App.tsx`. `addTask`, `updateTask`, `getCurrentUserMember`, `currentDomain`, and `showToast` are already in scope there (the existing `onCreateTask` uses `getCurrentUserMember()` + `currentDomain`).

- [ ] **Step 1: Import the helper**

Add near the other `@/lib/today/...` imports in `src/App.tsx`:

```ts
import { groupTasks } from '@/lib/today/groupTasks'
```

- [ ] **Step 2: Add the handler to the provider value**

In the `ScheduleActions` value object, immediately after the `onCreateTask: async (title: string) => { ... },` entry, add:

```ts
    onGroupTasks: async (taskIds, groupName, date, isAllDay) => {
      const wrapperId = await groupTasks(
        {
          taskIds,
          groupName,
          date,
          isAllDay,
          assignedTo: getCurrentUserMember()?.id,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        },
        { addTask, updateTask },
      )
      if (!wrapperId) showToast("Couldn't create group", 'warning')
    },
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b`
Expected: exit 0.

If `tsc` reports the value object's `useMemo`/dependency array (the provider value may be memoized), add any newly-referenced identifiers that aren't already listed (`addTask`, `updateTask`, `getCurrentUserMember`, `currentDomain`, `showToast`) to that dependency array. Check how the existing `onCreateTask` entry's deps are handled and match it.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(today): wire onGroupTasks provider action via groupTasks helper"
```

---

## Task 5: Wire `TodayView` → toolbar

**Files:**
- Modify: `src/components/schedule/TodayView.tsx`

Context: `TodayView` destructures context handlers (around line 136: `onToggleWaiting, onUpdateTask, onPushTask, onAssignTask, onAssignTaskAll, ...`), owns `selectedTaskIds` + `clearBulkSelection` + `handleBulk*`, and renders `<BulkActionToolbar ... />` (around line 813).

- [ ] **Step 1: Destructure `onGroupTasks` from context**

In the context destructure block (the one that includes `onUpdateTask, onPushTask, onAssignTaskAll`), add `onGroupTasks`:

```ts
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onGroupTasks,
```
(Place `onGroupTasks,` on its own line within that destructure; match the existing formatting.)

- [ ] **Step 2: Add the bulk handler**

Next to `handleBulkAssign` (after it), add:

```ts
  const handleBulkGroup = useCallback(async (name: string, date: Date, isAllDay: boolean) => {
    if (!onGroupTasks) return
    await onGroupTasks(Array.from(selectedTaskIds), name, date, isAllDay)
    clearBulkSelection()
  }, [selectedTaskIds, onGroupTasks, clearBulkSelection])
```

- [ ] **Step 3: Pass `onGroup` to the toolbar**

In the `<BulkActionToolbar ... />` render (the one gated by `selectedTaskIds.size > 0`), add the prop (only when the handler exists, so the button hides if the context didn't provide it):

```tsx
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          onDefer={handleBulkDefer}
          onSchedule={handleBulkSchedule}
          onSetContext={handleBulkSetContext}
          onAssign={handleBulkAssign}
          onSendToList={() => {}}
          onCancel={clearBulkSelection}
          onGroup={onGroupTasks ? handleBulkGroup : undefined}
          familyMembers={familyMembers}
        />
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): wire Group action into Today bulk toolbar"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck (Vercel-equivalent)**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 2: Run the affected tests**

Run: `npx vitest run src/lib/today/groupTasks.test.ts src/components/schedule/BulkActionToolbar.test.tsx`
Expected: PASS (5 tests total).

- [ ] **Step 3: Run the full unit suite (catch regressions)**

Run: `npx vitest run`
Expected: all green (skips allowed), matching `main`'s baseline.

- [ ] **Step 4: Lint (CI gate)**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 5: Manual smoke (dev server)**

Run: `npm run dev`, open the Today view, hover a task to reveal the check-circle, select 2–3 tasks, click **Group**, name it "Sat AM errands", pick 9am (or leave all-day), Create group. Verify:
- A new "Sat AM errands" task appears on Today at the chosen slot.
- The selected tasks are nested under it (and gone from their old rows).
- Completing a child behaves like a normal subtask.

- [ ] **Step 6: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "test(today): verification fixups for task grouping"   # only if needed
```

---

## Self-Review notes (author)

- **Spec coverage:** wrapper+subtasks (Tasks 1,4,5), pick-a-time/all-day default (Task 2), children inherit time (Task 1 helper), Group button placement + own When picker (Task 2), `onGroupTasks` context action (Tasks 3,4), no migration / no grouping.ts change (by design). ✓
- **Known v1 limitations (from spec, intentionally not coded):** grandchildren of a grouped parent don't deep-nest; no undo; single-task grouping allowed. These are documented, not bugs to fix here.
- **Type consistency:** `onGroup(name, date, isAllDay)` and `onGroupTasks(taskIds, groupName, date, isAllDay)` and `groupTasks({taskIds, groupName, date, isAllDay, assignedTo, context}, {addTask, updateTask})` are consistent across Tasks 1–5.
