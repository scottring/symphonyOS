# Health Check Fix All

## Overview

Build is failing and lint has 21 errors. Fix everything.

---

## P1: Build-Blocking Test Fixes

### 1. QuickCapture.test.tsx — DELETE AND REWRITE

The old tests test features that no longer exist (contacts, @mentions, modes).

**Action:** Delete all existing tests. Write new tests for the simplified component:

```typescript
// New tests needed:
// - renders FAB button when showFab=true
// - opens modal when FAB clicked
// - renders modal when isOpen=true
// - input has text-2xl font-display classes
// - placeholder says "What's on your mind?"
// - Cancel button closes modal
// - Save button calls onAdd with title
// - Save button disabled when title empty
// - Escape key closes modal
// - clicking overlay closes modal
```

### 2. DetailPanel.test.tsx — Fix Task mock

Line 17: Remove `updatedAt` from Task mock — that field doesn't exist.

```typescript
// Change from:
const mockTask: Task = {
  id: 'task-1',
  title: 'Test Task',
  completed: false,
  scheduledFor: new Date('2024-01-15T10:00:00'),
  contactId: 'contact-1',
  projectId: null,
  notes: 'Test notes',
  updatedAt: new Date(), // REMOVE THIS
}

// Change to:
const mockTask: Task = {
  id: 'task-1',
  title: 'Test Task',
  completed: false,
  scheduledFor: new Date('2024-01-15T10:00:00'),
  contactId: 'contact-1',
  projectId: null,
  notes: 'Test notes',
  context: null,        // ADD (new field)
  assignedTo: null,     // ADD (new field)
  isAllDay: false,      // ADD (new field)
}
```

### 3. ProjectView.test.tsx — Fix Task mocks

Lines 23 and 31: Same issue. Update Task mocks to match current type.

### 4. useRoutines.test.ts — Fix mock and unused variable

Line 11: Remove unused `mockEq` declaration.

Line 40: Fix type — `default_assignee` should be `string | null`, not `string | null | undefined`. Make sure mock has explicit `default_assignee: null`.

Line 242: The `result.current.routines[0].name` error suggests the array is typed as `never[]`. Check that the mock return matches the Routine type exactly.

---

## P2: Lint Errors — setState-in-effect

These are all the same pattern: syncing local state when props change. React 19 Compiler flags this.

**Fix pattern:** Use a ref to track the previous value and only update when actually changed, OR derive state during render.

### Option A: Suppress with eslint-disable (quick)

Add `// eslint-disable-next-line react-hooks/set-state-in-effect` above each line.

### Option B: Proper fix (better)

For each case, evaluate if state can be derived or use a key to reset.

**Files affected:**

1. `src/App.tsx:109` — `refreshDateInstances()` in effect
2. `src/components/detail/DetailPanel.tsx:237,246,270` — sync local state on item change
3. `src/components/layout/QuickCapture.tsx:45` — reset title when modal opens
4. `src/components/routine/RoutineForm.tsx:34` — sync form state when routine changes
5. `src/components/task/TaskView.tsx:76` — sync state when task changes
6. `src/components/triage/WhenPicker.tsx:36` — reset step when popover opens
7. `src/hooks/useCompletedEvents.ts:27` — set state from localStorage
8. `src/hooks/useContacts.ts:38` — clear contacts when user logs out
9. `src/hooks/useMobile.ts:19` — set initial media query value
10. `src/hooks/useProjects.ts:27` — clear projects when user logs out
11. `src/hooks/useSupabaseTasks.ts:62` — clear tasks when user logs out

**Recommended approach per file:**

| File | Recommendation |
|------|----------------|
| App.tsx | Suppress — async data fetch is valid |
| DetailPanel.tsx | Use `key={item?.id}` on component to reset state |
| QuickCapture.tsx | Handle in `handleOpen` instead of effect |
| RoutineForm.tsx | Use `key={routine.id}` on component |
| TaskView.tsx | Use `key={task.id}` on component |
| WhenPicker.tsx | Handle in click handler that opens popover |
| useCompletedEvents.ts | Suppress — initializing from localStorage |
| useContacts.ts | Suppress — clearing on auth change is valid |
| useMobile.ts | Remove the redundant setIsMobile — useState initializer already handles it |
| useProjects.ts | Suppress — same as useContacts |
| useSupabaseTasks.ts | Suppress — same as useContacts |

---

## P2: Lint Errors — preserve-manual-memoization

`src/components/detail/DetailPanel.tsx:325,334`

The useCallback dependencies are too narrow (`item?.originalEvent` vs `item`).

**Fix:** Change deps to `[item]` instead of `[item?.originalEvent]` and `[item?.originalRoutine]`.

---

## P2: Lint Errors — Missing dependencies

`src/components/detail/DetailPanel.tsx:242,291`

Add missing dependencies or suppress if intentional.

---

## P3: Minor Cleanup

### 1. no-useless-escape errors

**src/components/recipe/RecipeViewer.tsx:170,187**
Remove `\` before `/` in regex — not needed.

**src/utils/parseNaturalDate.ts:190,191**
Remove `\` before `-` in regex — not needed in character class.

### 2. no-unused-vars errors

**src/hooks/useRoutines.test.ts:11**
Remove `mockEq` declaration.

**src/supabase/functions/google-calendar-events/index.ts:135**
Remove or use `allEvents` variable.

---

## Execution Order

1. Fix P1 items first (unblock build)
2. Run `npm run build` to verify
3. Fix P2 items (lint errors)
4. Fix P3 items (cleanup)
5. Run `npm run lint` to verify
6. Run `npm test` to verify tests pass

---

## Verification

After all fixes:

```bash
npm run build   # Should pass
npm run lint    # Should have 0 errors
npm test        # Should pass (or document known failures)
```
