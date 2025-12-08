# Prep & Follow-up Tasks

## Overview

Add the ability to attach preparatory and follow-up tasks to any activity (tasks, routines, calendar events). These linked tasks can optionally surface on the main timeline.

**Example:** "Kaleb's Soccer Practice" at 4pm → Prep task: "Bring Kaleb's soccer stuff" appears on Today view

---

## Key Behaviors

| Behavior | Implementation |
|----------|----------------|
| Entry point | Separate "Prep Tasks" and "Follow-up Tasks" sections in detail panel |
| Timeline surfacing | Give task a `scheduledFor` date = appears on timeline |
| Completion | Main activity CAN complete with incomplete prep tasks |
| Auto-scheduling | When main activity completes, follow-up tasks auto-schedule for today |
| Routines | Option to save as template ("Add to all instances") |
| One-time | Default: linked to this instance only |

---

## Data Model Changes

### Task Type Updates (`src/types/task.ts`)

```typescript
export type LinkType = 'prep' | 'followup'

export type LinkedActivityType = 'task' | 'routine_instance' | 'calendar_event'

export interface LinkedActivity {
  type: LinkedActivityType
  id: string  // For routine_instance: "{routineId}_{date}", for others: entity id
}

export interface Task {
  // ... existing fields
  
  // EXISTING - keep for backward compatibility with meal prep
  linkedEventId?: string
  
  // NEW - generalized linking
  linkedTo?: LinkedActivity
  linkType?: LinkType
}
```

### Routine Type Updates (`src/types/actionable.ts`)

```typescript
export interface PrepFollowupTemplate {
  id: string  // UUID for tracking
  title: string
  defaultScheduleOffset?: 'same_day' | 'day_before' | 'day_after'  // Optional, for future use
}

export interface Routine {
  // ... existing fields
  
  // NEW - templates for auto-generation
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
}
```

---

## Database Migration

Create `supabase/migrations/XXX_prep_followup_tasks.sql`:

```sql
-- Extend tasks table for generalized linking
-- (linked_event_id already exists from 018_prep_tasks.sql)

-- Add link type to distinguish prep vs followup
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS link_type text CHECK (link_type IN ('prep', 'followup'));

-- Add linked activity type and id (more flexible than just event linking)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS linked_activity_type text CHECK (linked_activity_type IN ('task', 'routine_instance', 'calendar_event'));

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS linked_activity_id text;

-- Index for finding linked tasks
CREATE INDEX IF NOT EXISTS idx_tasks_linked_activity 
  ON tasks(linked_activity_type, linked_activity_id) 
  WHERE linked_activity_id IS NOT NULL;

-- Add prep/followup templates to routines
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS prep_task_templates jsonb DEFAULT '[]'::jsonb;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS followup_task_templates jsonb DEFAULT '[]'::jsonb;

-- Migrate existing linkedEventId data to new structure (optional, for consistency)
-- UPDATE tasks 
-- SET linked_activity_type = 'calendar_event',
--     linked_activity_id = linked_event_id,
--     link_type = 'prep'
-- WHERE linked_event_id IS NOT NULL;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/task.ts` | Add `LinkedActivity`, `LinkType`, new fields |
| `src/types/actionable.ts` | Add `PrepFollowupTemplate`, update `Routine` |
| `src/hooks/useSupabaseTasks.ts` | Map new DB fields, add `getLinkedTasks()` helper |
| `src/hooks/useRoutines.ts` | Handle templates on routine CRUD |
| `src/components/detail/DetailPanelRedesign.tsx` | Add Prep/Follow-up sections |
| `src/components/home/TodaySchedule.tsx` | Generate tasks from routine templates |
| `supabase/migrations/XXX_prep_followup_tasks.sql` | NEW - schema changes |

---

## Implementation

### Phase 1: Database & Types

1. Create the migration file
2. Update `Task` type with new fields
3. Update `Routine` type with template arrays
4. Update `useSupabaseTasks.ts` to map new fields:

```typescript
// In dbTaskToTask function
linkedTo: dbTask.linked_activity_id ? {
  type: dbTask.linked_activity_type as LinkedActivityType,
  id: dbTask.linked_activity_id,
} : undefined,
linkType: dbTask.link_type as LinkType | undefined,

// In taskToDbTask or insert/update calls
linked_activity_type: task.linkedTo?.type ?? null,
linked_activity_id: task.linkedTo?.id ?? null,
link_type: task.linkType ?? null,
```

5. Add helper to fetch linked tasks:

```typescript
const getLinkedTasks = useCallback((
  activityType: LinkedActivityType,
  activityId: string
): { prep: Task[], followup: Task[] } => {
  const linked = tasks.filter(t => 
    t.linkedTo?.type === activityType && 
    t.linkedTo?.id === activityId
  )
  return {
    prep: linked.filter(t => t.linkType === 'prep'),
    followup: linked.filter(t => t.linkType === 'followup'),
  }
}, [tasks])
```

### Phase 2: Detail Panel UI

Add new sections to `DetailPanelRedesign.tsx` for all activity types.

**Determine activity type and ID:**

```typescript
// Inside DetailPanelRedesign component
const getActivityIdentifier = (): { type: LinkedActivityType, id: string } | null => {
  if (item.type === 'task' && item.originalTask) {
    return { type: 'task', id: item.originalTask.id }
  }
  if (item.type === 'routine' && item.routineInstance) {
    // Composite key: routineId_date
    return { 
      type: 'routine_instance', 
      id: `${item.routineInstance.entity_id}_${item.routineInstance.date}` 
    }
  }
  if (item.type === 'calendar' && item.calendarEvent) {
    return { type: 'calendar_event', id: item.calendarEvent.id }
  }
  return null
}
```

**UI for prep/follow-up sections:**

```tsx
{/* Prep Tasks Section */}
<div className="px-6 py-4 border-t border-neutral-100">
  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
    Prep Tasks
  </h3>
  
  {prepTasks.length > 0 ? (
    <div className="space-y-2">
      {prepTasks.map(task => (
        <div 
          key={task.id}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 group"
        >
          <button
            onClick={() => onToggleComplete(task.id)}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              task.completed 
                ? 'bg-primary-500 border-primary-500' 
                : 'border-neutral-300 hover:border-primary-400'
            }`}
          >
            {task.completed && (
              <CheckIcon className="w-3 h-3 text-white" />
            )}
          </button>
          
          <span className={`flex-1 text-sm ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
            {task.title}
          </span>
          
          {/* Schedule indicator/button */}
          {task.scheduledFor ? (
            <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
              {formatDate(task.scheduledFor)}
            </span>
          ) : (
            <button
              onClick={() => scheduleForToday(task.id)}
              className="text-xs text-neutral-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              + Add to Today
            </button>
          )}
          
          {/* Delete button */}
          <button
            onClick={() => onDeleteTask(task.id)}
            className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-neutral-400 italic">No prep tasks</p>
  )}
  
  {/* Add prep task input */}
  <div className="mt-3">
    <AddLinkedTaskInput
      placeholder="Add prep task..."
      onAdd={(title) => handleAddLinkedTask(title, 'prep')}
      showTemplateOption={item.type === 'routine'}
      onAddAsTemplate={(title) => handleAddAsTemplate(title, 'prep')}
    />
  </div>
</div>

{/* Follow-up Tasks Section - same structure, different linkType */}
<div className="px-6 py-4 border-t border-neutral-100">
  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
    Follow-up Tasks
  </h3>
  {/* ... same pattern as above with followupTasks ... */}
</div>
```

**AddLinkedTaskInput component:**

```tsx
interface AddLinkedTaskInputProps {
  placeholder: string
  onAdd: (title: string) => void
  showTemplateOption?: boolean
  onAddAsTemplate?: (title: string) => void
}

function AddLinkedTaskInput({ 
  placeholder, 
  onAdd, 
  showTemplateOption, 
  onAddAsTemplate 
}: AddLinkedTaskInputProps) {
  const [value, setValue] = useState('')
  const [addToAll, setAddToAll] = useState(false)
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    
    if (addToAll && onAddAsTemplate) {
      onAddAsTemplate(value.trim())
    } else {
      onAdd(value.trim())
    }
    setValue('')
    setAddToAll(false)
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>
      
      {showTemplateOption && value.trim() && (
        <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
          <input
            type="checkbox"
            checked={addToAll}
            onChange={(e) => setAddToAll(e.target.checked)}
            className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
          />
          Add to all future instances
        </label>
      )}
    </form>
  )
}
```

**Handler functions:**

```typescript
const handleAddLinkedTask = async (title: string, linkType: LinkType) => {
  const activity = getActivityIdentifier()
  if (!activity) return
  
  // Create task linked to this activity
  await addTask(title, undefined, undefined, undefined, {
    linkedTo: activity,
    linkType,
  })
}

const handleAddAsTemplate = async (title: string, linkType: LinkType) => {
  if (item.type !== 'routine' || !item.routineInstance) return
  
  const routineId = item.routineInstance.entity_id
  const template: PrepFollowupTemplate = {
    id: crypto.randomUUID(),
    title,
  }
  
  // Update routine with new template
  if (linkType === 'prep') {
    await updateRoutine(routineId, {
      prep_task_templates: [...(routine?.prep_task_templates || []), template]
    })
  } else {
    await updateRoutine(routineId, {
      followup_task_templates: [...(routine?.followup_task_templates || []), template]
    })
  }
  
  // Also create the task for this instance
  await handleAddLinkedTask(title, linkType)
}
```

### Phase 3: Task Generation from Templates

When routine instances surface on Today view, generate tasks from templates.

**In `useHomeView.ts` or `TodaySchedule.tsx`:**

```typescript
// When building the day's schedule, generate tasks from routine templates
const generateTemplatedTasks = useCallback(async (
  routineInstance: ActionableInstance,
  routine: Routine
) => {
  const instanceId = `${routine.id}_${routineInstance.date}`
  
  // Check if tasks already exist for this instance
  const existingLinked = tasks.filter(t => 
    t.linkedTo?.id === instanceId
  )
  
  // Generate prep tasks from templates (if not already created)
  for (const template of routine.prep_task_templates || []) {
    const exists = existingLinked.some(t => 
      t.linkType === 'prep' && t.title === template.title
    )
    if (!exists) {
      await addTask(template.title, undefined, undefined, new Date(routineInstance.date), {
        linkedTo: { type: 'routine_instance', id: instanceId },
        linkType: 'prep',
      })
    }
  }
  
  // Note: Follow-up tasks are generated when activity completes, not upfront
}, [tasks, addTask])
```

### Phase 4: Auto-Schedule Follow-ups on Completion

When main activity is marked complete, schedule follow-up tasks for today.

**In completion handler:**

```typescript
const handleComplete = async (activityType: LinkedActivityType, activityId: string) => {
  // ... existing completion logic ...
  
  // Find incomplete follow-up tasks and schedule them for today
  const followupTasks = tasks.filter(t =>
    t.linkedTo?.type === activityType &&
    t.linkedTo?.id === activityId &&
    t.linkType === 'followup' &&
    !t.completed
  )
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (const task of followupTasks) {
    if (!task.scheduledFor) {
      await updateTask(task.id, { scheduledFor: today })
    }
  }
  
  // For routines with follow-up templates, generate the tasks now
  if (activityType === 'routine_instance') {
    const [routineId] = activityId.split('_')
    const routine = routines.find(r => r.id === routineId)
    
    for (const template of routine?.followup_task_templates || []) {
      await addTask(template.title, undefined, undefined, today, {
        linkedTo: { type: activityType, id: activityId },
        linkType: 'followup',
      })
    }
  }
}
```

---

## Props Updates

### useSupabaseTasks

```typescript
// Update addTask signature to accept linking options
const addTask = useCallback(async (
  title: string,
  contactId?: string,
  projectId?: string,
  scheduledFor?: Date,
  options?: {
    linkedTo?: LinkedActivity
    linkType?: LinkType
  }
): Promise<string | undefined>
```

### DetailPanelRedesign

```typescript
interface DetailPanelRedesignProps {
  // ... existing props
  
  // NEW
  onAddLinkedTask?: (
    title: string,
    linkedTo: LinkedActivity,
    linkType: LinkType,
    scheduledFor?: Date
  ) => Promise<void>
  linkedTasks?: {
    prep: Task[]
    followup: Task[]
  }
}
```

---

## UI Design (Nordic Journal)

Follow existing patterns from `DESIGN_QUICK_REFERENCE.md`:

```tsx
{/* Section header */}
<h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
  Prep Tasks
</h3>

{/* Task row with hover actions */}
<div className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 group">
  {/* Checkbox */}
  <button className={`w-5 h-5 rounded-full border-2 ...`} />
  
  {/* Title */}
  <span className="flex-1 text-sm text-neutral-700">{task.title}</span>
  
  {/* Schedule chip */}
  <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
    Today
  </span>
  
  {/* Hover actions */}
  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
    ...
  </button>
</div>

{/* Add input */}
<input className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 ..." />

{/* Checkbox for "Add to all" */}
<label className="flex items-center gap-2 text-xs text-neutral-500">
  <input type="checkbox" className="rounded border-neutral-300 text-primary-500 ..." />
  Add to all future instances
</label>
```

---

## Acceptance Criteria

- [ ] Prep and Follow-up task sections appear in detail panel for tasks, routines, and calendar events
- [ ] Can add prep/follow-up tasks that link to the parent activity
- [ ] "+ Add to Today" button schedules unscheduled linked tasks
- [ ] Can delete linked tasks
- [ ] Can complete linked tasks independently of parent
- [ ] For routines: "Add to all future instances" checkbox saves as template
- [ ] Tasks from routine templates auto-generate when instance surfaces
- [ ] When activity completes, follow-up tasks auto-schedule for today
- [ ] Follow-up templates generate tasks on completion (not upfront)
- [ ] Linked tasks display on Today timeline when scheduled
- [ ] All existing tests pass
- [ ] Build compiles with no TypeScript errors

---

## Future Enhancements (Not in Scope)

- Quick Capture parsing: "bring soccer stuff **for** kaleb's practice"
- Relative timing: "1 hour before", "next day"
- Assignee inheritance from parent activity
- Batch actions on linked tasks

---

## Test Cases

```typescript
describe('Prep and Follow-up Tasks', () => {
  it('creates prep task linked to task', async () => {
    // Create parent task
    // Add prep task via detail panel
    // Verify linkType = 'prep' and linkedTo matches parent
  })

  it('creates follow-up task linked to routine instance', async () => {
    // Open routine instance detail
    // Add follow-up task
    // Verify linked_activity_type = 'routine_instance'
    // Verify linked_activity_id = 'routineId_date'
  })

  it('saves prep task as template for routine', async () => {
    // Open routine instance
    // Add prep task with "Add to all instances" checked
    // Verify routine.prep_task_templates updated
    // Verify task also created for current instance
  })

  it('generates tasks from routine templates', async () => {
    // Create routine with prep template
    // Navigate to day with routine instance
    // Verify prep task was auto-generated
  })

  it('schedules follow-up tasks when activity completes', async () => {
    // Create activity with unscheduled follow-up task
    // Complete the activity
    // Verify follow-up task now has scheduledFor = today
  })

  it('allows completing activity with incomplete prep tasks', async () => {
    // Create activity with incomplete prep task
    // Complete the activity
    // Verify activity is completed
    // Verify prep task remains incomplete
  })
})
```

---

## References

- `supabase/migrations/018_prep_tasks.sql` - Existing linked_event_id pattern
- `src/types/task.ts` - Task type with linkedEventId
- `src/components/detail/DetailPanelRedesign.tsx` - Where sections go
- `DESIGN_QUICK_REFERENCE.md` - Nordic Journal patterns
