# Test Coverage Improvement Plan

## Current State
- **Overall coverage: 29%** (target: 80%+)
- 201 tests passing
- Major gaps in core data hooks and UI components

## Priority Tiers

### Tier 1: Critical Data Layer (Must Have)
These are load-bearing. Bugs here break everything.

### Tier 2: Core UI Components (Should Have)
Main user-facing components with complex logic.

### Tier 3: Supporting Components (Nice to Have)
Important but lower risk or less frequently used.

---

## Tier 1: Critical Data Layer

### 1.1 `src/hooks/useSupabaseTasks.ts` (0% → 90%+)

**Why critical:** All task CRUD flows through this. Optimistic updates, error rollback, data transformation.

**Test file:** `src/hooks/useSupabaseTasks.test.ts`

**Test cases to implement:**

```typescript
describe('useSupabaseTasks', () => {
  describe('initial loading', () => {
    it('fetches tasks on mount when user is authenticated')
    it('sets loading to true while fetching')
    it('sets loading to false after fetch completes')
    it('handles fetch error gracefully')
    it('clears tasks when user is null')
  })

  describe('addTask', () => {
    it('creates task with just title')
    it('creates task with title and scheduledFor date')
    it('creates task with title and projectId')
    it('applies optimistic update immediately')
    it('replaces temp ID with real ID after server response')
    it('rolls back optimistic update on server error')
    it('returns the new task ID on success')
    it('returns null on failure')
  })

  describe('updateTask', () => {
    it('updates task title')
    it('updates task scheduledFor')
    it('updates task notes')
    it('updates task projectId')
    it('updates task contactId')
    it('updates task assignedTo')
    it('updates multiple fields at once')
    it('applies optimistic update immediately')
    it('rolls back on server error')
    it('handles updating non-existent task')
  })

  describe('toggleTask', () => {
    it('marks incomplete task as complete')
    it('marks complete task as incomplete')
    it('sets completedAt timestamp when completing')
    it('clears completedAt timestamp when uncompleting')
    it('applies optimistic update')
    it('rolls back on server error')
  })

  describe('deleteTask', () => {
    it('removes task from local state immediately')
    it('calls supabase delete')
    it('rolls back if delete fails')
  })

  describe('pushTask', () => {
    it('updates scheduledFor to new date')
    it('increments deferCount')
    it('clears deferredUntil if set')
    it('applies optimistic update')
  })

  describe('data transformation', () => {
    it('converts snake_case DB fields to camelCase')
    it('handles null optional fields')
    it('parses date strings to Date objects')
  })

  describe('real-time subscriptions', () => {
    it('subscribes to task changes on mount')
    it('unsubscribes on unmount')
    it('handles INSERT events')
    it('handles UPDATE events')
    it('handles DELETE events')
  })
})
```

**Mocking strategy:**
- Mock `@/lib/supabase` with jest.fn() implementations
- Mock `useAuth` to return test user
- Use `renderHook` from `@testing-library/react`

---

### 1.2 `src/hooks/useAuth.ts` (0% → 90%+)

**Why critical:** Auth gates the entire app. Session handling, sign in/out flows.

**Test file:** `src/hooks/useAuth.test.ts`

**Test cases:**

```typescript
describe('useAuth', () => {
  describe('initial state', () => {
    it('starts with loading=true')
    it('sets user from initial session')
    it('sets loading=false after session check')
    it('handles no active session')
  })

  describe('session changes', () => {
    it('updates user on SIGNED_IN event')
    it('clears user on SIGNED_OUT event')
    it('handles TOKEN_REFRESHED event')
  })

  describe('signOut', () => {
    it('calls supabase.auth.signOut')
    it('clears local user state')
    it('handles sign out error')
  })

  describe('signInWithGoogle', () => {
    it('initiates OAuth flow')
    it('handles OAuth error')
  })

  describe('signInWithEmail', () => {
    it('calls signInWithPassword')
    it('returns error on invalid credentials')
    it('sets user on success')
  })

  describe('signUpWithEmail', () => {
    it('calls signUp with email/password')
    it('handles existing user error')
    it('handles weak password error')
  })
})
```

---

### 1.3 `src/hooks/useProjects.ts` (0% → 90%+)

**Why critical:** Projects are core organizational unit. Pattern similar to useContacts.

**Test file:** `src/hooks/useProjects.test.ts`

**Test cases:**

```typescript
describe('useProjects', () => {
  describe('fetching', () => {
    it('loads projects on mount')
    it('orders projects by name')
    it('handles fetch error')
    it('clears projects when user is null')
  })

  describe('addProject', () => {
    it('creates project with name')
    it('creates project with name and description')
    it('creates project with emoji')
    it('applies optimistic update')
    it('rolls back on error')
    it('returns created project')
  })

  describe('updateProject', () => {
    it('updates project name')
    it('updates project description')
    it('updates project emoji')
    it('updates project status')
    it('applies optimistic update')
    it('rolls back on error')
  })

  describe('deleteProject', () => {
    it('removes project from state')
    it('rolls back on error')
    it('does not delete if project has tasks') // if applicable
  })

  describe('searchProjects', () => {
    it('returns all projects for empty query')
    it('filters by name case-insensitively')
    it('returns empty array for no matches')
  })

  describe('projectsMap', () => {
    it('provides O(1) lookup by ID')
    it('updates when projects change')
  })
})
```

---

### 1.4 `src/hooks/useEventNotes.ts` (0% → 85%+)

**Why critical:** Links Google Calendar events to Symphony notes/assignments.

**Test file:** `src/hooks/useEventNotes.test.ts`

**Test cases:**

```typescript
describe('useEventNotes', () => {
  describe('fetchNote', () => {
    it('fetches note for event ID')
    it('caches fetched note')
    it('handles missing note (returns null)')
  })

  describe('fetchNotesForEvents', () => {
    it('batch fetches notes for multiple events')
    it('handles partial results')
    it('deduplicates event IDs')
  })

  describe('updateNote', () => {
    it('creates note if none exists')
    it('updates existing note')
    it('applies optimistic update')
    it('rolls back on error')
  })

  describe('updateEventAssignment', () => {
    it('assigns family member to event')
    it('clears assignment with null')
    it('creates event_notes record if needed')
  })

  describe('getNote', () => {
    it('returns cached note')
    it('returns undefined for unknown event')
  })
})
```

---

### 1.5 `src/hooks/useActionableInstances.ts` (13% → 85%+)

**Why critical:** Tracks completion/skip state for routines and events.

**Test file:** `src/hooks/useActionableInstances.test.ts`

**Test cases:**

```typescript
describe('useActionableInstances', () => {
  describe('getInstancesForDate', () => {
    it('fetches instances for specific date')
    it('returns empty array for date with no instances')
    it('includes routine instances')
    it('includes calendar_event instances')
  })

  describe('markDone', () => {
    it('creates completed instance for routine')
    it('creates completed instance for calendar_event')
    it('updates existing instance to completed')
    it('sets completed_at timestamp')
  })

  describe('undoDone', () => {
    it('removes completed instance')
    it('handles non-existent instance gracefully')
  })

  describe('skip', () => {
    it('creates skipped instance')
    it('updates existing instance to skipped')
  })

  describe('defer', () => {
    it('creates deferred instance with target date')
    it('updates existing instance to deferred')
  })
})
```

---

### 1.6 `src/hooks/useFamilyMembers.ts` (0% → 85%+)

**Test file:** `src/hooks/useFamilyMembers.test.ts`

**Test cases:**

```typescript
describe('useFamilyMembers', () => {
  describe('fetching', () => {
    it('loads family members on mount')
    it('orders by name')
    it('handles empty family')
  })

  describe('addMember', () => {
    it('creates member with name')
    it('creates member with name and color')
    it('applies optimistic update')
  })

  describe('updateMember', () => {
    it('updates member name')
    it('updates member color')
    it('updates member avatar')
  })

  describe('deleteMember', () => {
    it('removes member')
    it('handles deletion of assigned member') // what happens to assignments?
  })
})
```

---

## Tier 2: Core UI Components

### 2.1 `src/components/task/TaskView.tsx` (0% → 80%+)

**Why important:** 1000+ lines, main task editing interface.

**Test file:** `src/components/task/TaskView.test.tsx`

**Test cases:**

```typescript
describe('TaskView', () => {
  describe('rendering', () => {
    it('displays task title')
    it('displays task notes')
    it('displays scheduled date if set')
    it('displays project if assigned')
    it('displays contact if assigned')
    it('displays family member if assigned')
    it('shows completion checkbox state')
  })

  describe('title editing', () => {
    it('shows input on title click')
    it('saves title on blur')
    it('saves title on Enter')
    it('cancels edit on Escape')
    it('debounces rapid changes')
  })

  describe('notes editing', () => {
    it('shows textarea for notes')
    it('auto-saves notes with debounce')
    it('handles empty notes')
  })

  describe('scheduling', () => {
    it('opens WhenPicker on schedule button click')
    it('updates task when date selected')
    it('clears schedule when cleared')
    it('shows all-day vs timed correctly')
  })

  describe('project assignment', () => {
    it('opens project picker')
    it('assigns project on selection')
    it('clears project on X click')
    it('navigates to project on project name click')
    it('allows creating new project inline')
  })

  describe('contact assignment', () => {
    it('opens contact picker')
    it('assigns contact on selection')
    it('clears contact on X click')
    it('navigates to contact on contact name click')
    it('allows creating new contact inline')
  })

  describe('completion', () => {
    it('toggles completion on checkbox click')
    it('shows strikethrough when complete')
    it('calls onToggleComplete callback')
  })

  describe('deletion', () => {
    it('shows delete confirmation')
    it('deletes task on confirm')
    it('cancels on dismiss')
    it('calls onBack after deletion')
  })

  describe('push/defer', () => {
    it('opens push dropdown')
    it('pushes task to tomorrow')
    it('pushes task to next week')
    it('pushes task to custom date')
  })

  describe('navigation', () => {
    it('calls onBack when back button clicked')
    it('calls onOpenProject when project clicked')
    it('calls onOpenContact when contact clicked')
  })
})
```

---

### 2.2 `src/components/contact/ContactView.tsx` (0% → 80%+)

**Test file:** `src/components/contact/ContactView.test.tsx`

**Test cases:**

```typescript
describe('ContactView', () => {
  describe('rendering', () => {
    it('displays contact name')
    it('displays contact phone if set')
    it('displays contact email if set')
    it('displays linked tasks')
    it('shows empty state for no linked tasks')
  })

  describe('editing', () => {
    it('saves name changes with debounce')
    it('saves phone changes with debounce')
    it('saves email changes with debounce')
    it('validates email format') // if applicable
  })

  describe('quick actions', () => {
    it('opens phone app on call button')
    it('opens SMS on text button')
    it('opens email client on email button')
    it('disables call button if no phone')
    it('disables email button if no email')
  })

  describe('linked tasks', () => {
    it('displays all tasks linked to contact')
    it('navigates to task on click')
    it('shows task completion state')
  })

  describe('deletion', () => {
    it('shows warning about unlinking tasks')
    it('deletes contact on confirm')
    it('navigates back after deletion')
  })
})
```

---

### 2.3 `src/components/detail/DetailPanel.tsx` (35% → 80%+)

**Extend existing tests in:** `src/components/detail/DetailPanel.test.tsx`

**Additional test cases:**

```typescript
describe('DetailPanel - extended', () => {
  describe('event handling', () => {
    it('displays event title and time')
    it('shows event description')
    it('allows adding notes to event')
    it('saves event notes')
    it('shows event location if set')
    it('shows Google Meet link if present')
  })

  describe('routine handling', () => {
    it('displays routine name')
    it('shows routine schedule description')
    it('allows marking routine complete')
    it('allows skipping routine')
  })

  describe('recipe detection', () => {
    it('detects recipe URLs in notes')
    it('shows Open Recipe button for recipe URLs')
    it('opens RecipeViewer on button click')
  })

  describe('family assignment', () => {
    it('shows assignee dropdown for tasks')
    it('shows assignee dropdown for events')
    it('shows assignee dropdown for routines')
    it('updates assignment on selection')
  })

  describe('keyboard navigation', () => {
    it('closes on Escape key')
  })
})
```

---

### 2.4 `src/components/schedule/TodaySchedule.tsx` (52% → 85%+)

**Test file:** `src/components/schedule/TodaySchedule.test.tsx`

**Test cases:**

```typescript
describe('TodaySchedule', () => {
  describe('date navigation', () => {
    it('shows today by default')
    it('navigates to previous day')
    it('navigates to next day')
    it('shows correct date header')
    it('shows "Today" label for current date')
  })

  describe('progress tracking', () => {
    it('calculates progress from tasks and routines')
    it('shows progress bar')
    it('shows completion count')
    it('excludes events from progress calculation')
  })

  describe('time grouping', () => {
    it('groups items into morning/afternoon/evening')
    it('shows all-day items in allday section')
    it('shows unscheduled items correctly')
    it('handles empty sections')
  })

  describe('inbox section', () => {
    it('shows inbox only on today view')
    it('hides inbox on other dates')
    it('shows inbox count badge')
    it('includes deferred items due today')
  })

  describe('item interactions', () => {
    it('toggles task completion')
    it('opens detail panel on item click')
    it('handles swipe gestures on mobile')
  })

  describe('weekly review', () => {
    it('opens weekly review modal')
    it('shows inbox count on review button')
  })

  describe('loading states', () => {
    it('shows skeleton while loading')
    it('shows empty state when no items')
  })
})
```

---

### 2.5 `src/components/triage/WhenPicker.tsx` (18% → 85%+)

**Test file:** `src/components/triage/WhenPicker.test.tsx`

**Test cases:**

```typescript
describe('WhenPicker', () => {
  describe('rendering', () => {
    it('shows calendar icon when no date')
    it('shows date when scheduled')
    it('shows time when not all-day')
    it('indicates all-day events')
  })

  describe('quick options', () => {
    it('selects Today')
    it('selects Tomorrow')
    it('selects Next Week')
    it('selects This Weekend')
  })

  describe('custom date/time', () => {
    it('opens date picker')
    it('allows time selection')
    it('toggles all-day')
    it('validates time format')
  })

  describe('clearing', () => {
    it('clears date on clear button')
    it('calls onChange with undefined')
  })

  describe('keyboard', () => {
    it('closes on Escape')
    it('closes on outside click')
  })
})
```

---

### 2.6 `src/components/triage/PushDropdown.tsx` (30% → 85%+)

**Test file:** `src/components/triage/PushDropdown.test.tsx`

**Test cases:**

```typescript
describe('PushDropdown', () => {
  describe('quick options', () => {
    it('pushes to Tomorrow')
    it('pushes to Next Week')
    it('pushes to Next Month')
  })

  describe('custom date', () => {
    it('opens date picker for custom')
    it('calls onPush with selected date')
  })

  describe('someday option', () => {
    it('handles Someday/Maybe selection')
  })

  describe('UI behavior', () => {
    it('closes after selection')
    it('closes on outside click')
    it('closes on Escape')
  })
})
```

---

## Tier 3: Supporting Components

### 3.1 `src/components/routine/RoutineForm.tsx` (0% → 70%+)

**Test file:** `src/components/routine/RoutineForm.test.tsx`

```typescript
describe('RoutineForm', () => {
  describe('editing', () => {
    it('displays routine name')
    it('saves name changes')
    it('displays schedule')
    it('allows schedule editing')
  })

  describe('time blocks', () => {
    it('shows assigned time block')
    it('allows changing time block')
  })

  describe('visibility', () => {
    it('toggles show_on_timeline')
  })

  describe('deletion', () => {
    it('shows delete confirmation')
    it('deletes routine on confirm')
  })
})
```

---

### 3.2 `src/components/project/ProjectsList.tsx` (0% → 70%+)

**Test file:** `src/components/project/ProjectsList.test.tsx`

```typescript
describe('ProjectsList', () => {
  it('displays all projects')
  it('shows project emoji')
  it('shows task count per project')
  it('navigates to project on click')
  it('shows add project button')
  it('creates new project')
  it('handles empty state')
})
```

---

### 3.3 `src/components/routine/RoutinesList.tsx` (0% → 70%+)

**Test file:** `src/components/routine/RoutinesList.test.tsx`

```typescript
describe('RoutinesList', () => {
  it('displays all routines')
  it('groups by time block')
  it('shows routine schedule')
  it('navigates to routine on click')
  it('shows create routine button')
  it('handles empty state')
})
```

---

### 3.4 `src/components/review/WeeklyReview.tsx` (2% → 75%+)

**Test file:** `src/components/review/WeeklyReview.test.tsx`

```typescript
describe('WeeklyReview', () => {
  it('displays all inbox tasks')
  it('shows task defer count')
  it('allows scheduling tasks')
  it('allows pushing tasks')
  it('allows deleting tasks')
  it('shows empty state when complete')
  it('closes on completion')
  it('closes on X button')
  it('closes on Escape')
})
```

---

## Implementation Guidelines

### Mocking Strategy

1. **Supabase client:** Create `src/test/mocks/supabase.ts`
```typescript
export const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  })),
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signOut: jest.fn(),
  },
}
```

2. **Auth context:** Create test wrapper with mocked user
```typescript
const TestWrapper = ({ children }) => (
  <AuthProvider value={{ user: mockUser, loading: false }}>
    {children}
  </AuthProvider>
)
```

3. **Router:** Wrap components needing navigation in MemoryRouter if applicable

### Test Utilities

Create `src/test/utils.tsx`:
```typescript
import { render } from '@testing-library/react'

export function renderWithProviders(ui, options = {}) {
  return render(ui, {
    wrapper: AllTheProviders,
    ...options,
  })
}

export const mockTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Test Task',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const mockContact = (overrides = {}) => ({
  id: 'contact-1',
  name: 'Test Contact',
  ...overrides,
})

// ... more factories
```

### Running Tests

```bash
# Run all tests with coverage
npm test -- --coverage --run

# Run specific test file
npm test -- src/hooks/useSupabaseTasks.test.ts

# Run tests in watch mode
npm test

# Update snapshots if using them
npm test -- -u
```

---

## Acceptance Criteria

| Tier | Target Coverage | Priority |
|------|-----------------|----------|
| Tier 1 (Data hooks) | 85%+ | P0 - Must complete |
| Tier 2 (Core UI) | 80%+ | P1 - Should complete |
| Tier 3 (Supporting) | 70%+ | P2 - Nice to have |

**Overall target: 80%+ statement coverage**

---

## Order of Implementation

1. Set up test utilities and mocks (`src/test/utils.tsx`, `src/test/mocks/`)
2. `useSupabaseTasks.test.ts` - highest impact
3. `useAuth.test.ts` - blocks testing of other hooks
4. `useProjects.test.ts` - similar pattern, quick win
5. `useEventNotes.test.ts`
6. `useActionableInstances.test.ts`
7. `useFamilyMembers.test.ts`
8. `TaskView.test.tsx` - largest component
9. `ContactView.test.tsx` - newly added
10. Extend `DetailPanel.test.tsx`
11. `TodaySchedule.test.tsx`
12. Triage components (`WhenPicker`, `PushDropdown`)
13. List components (`RoutinesList`, `ProjectsList`)
14. `WeeklyReview.test.tsx`
15. `RoutineForm.test.tsx`

---

## Notes

- Fix the `act()` warnings in existing DetailPanel tests while adding new tests
- Consider adding integration tests for critical flows (create task → schedule → complete)
- Add snapshot tests sparingly, only for stable UI components
- Ensure tests are deterministic (mock dates, random IDs)
