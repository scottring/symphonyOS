# Subtasks Implementation

## Overview
Add subtasks capability to tasks. A subtask is just a task with a `parent_task_id`. Subtasks inherit most properties from parents but can be scheduled and completed independently.

## Database Changes

### Migration
```sql
ALTER TABLE tasks ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
```

## Type Changes

### `src/types/task.ts`
```typescript
export interface Task {
  // ... existing fields
  parent_task_id?: string | null
  subtasks?: Task[] // populated on fetch, not stored
}
```

## Hook Changes

### `src/hooks/useSupabaseTasks.ts`

1. **Fetch**: After fetching tasks, nest subtasks under parents
   - Query all tasks as usual
   - In post-processing, group by `parent_task_id`
   - Attach as `subtasks` array to parent tasks
   - Filter subtasks out of top-level array

2. **Create subtask**: New function `createSubtask(parentId, taskData)`
   - Sets `parent_task_id` 
   - Inherits `project_id` and `contact_id` from parent if not specified
   - Optimistic update: add to parent's subtasks array

3. **Complete parent**: When completing a task that has subtasks
   - Also complete all subtasks in same operation
   - Single optimistic update for all

4. **Delete parent**: Cascade handled by DB foreign key

## UI Changes

### `src/components/task/TaskView.tsx`

Add subtasks section below notes:

```
─────────────────────────
Subtasks (3)
─────────────────────────
☐ Look up plank guy's number
☐ Call to schedule  
☐ Confirm appointment
─────────────────────────
[+ Add subtask]
```

- Each subtask row: checkbox, title, tap to expand inline or navigate
- "Add subtask" opens inline input (similar to quick capture)
- Subtasks can be reordered (drag or manual order field)
- Show completion count: "2 of 3 complete"

### `src/components/schedule/TodaySchedule.tsx`

When a parent task with subtasks is clicked:
- Expand subtasks inline below the parent card (indented)
- Or show in DetailPanel if that's the current pattern
- Collapsed by default - user clicks to expand

Visual indicator on parent card when it has subtasks (e.g., small "3 subtasks" badge or chevron icon).

### `src/components/detail/DetailPanel.tsx`

If showing a task with subtasks:
- Include subtasks section
- Clicking a subtask switches DetailPanel to that subtask
- Breadcrumb or back button to return to parent

## Behavior Rules

1. **Scheduling**: Subtasks can have their own `scheduled_date` and `scheduled_time`, independent of parent
2. **Inheritance**: New subtasks inherit `project_id` and `contact_id` from parent by default
3. **Completion**: 
   - Completing parent → auto-complete all incomplete subtasks
   - Completing all subtasks → parent remains incomplete (explicit completion required)
4. **Visibility in Today**: Subtasks with `scheduled_date = today` appear under their parent when parent is expanded
5. **Inbox**: Subtasks without dates appear in Inbox, nested under parent if parent is also in Inbox

## Test Coverage

Add tests for:
- Creating subtasks
- Fetching tasks with subtasks nested
- Completing parent completes children
- Completing children doesn't complete parent
- Deleting parent cascades to subtasks
- Subtask inherits project/contact from parent
- Subtask can override project/contact
- Independent scheduling of subtasks

## Not in v1 (Future)
- Drag subtask to become independent task
- Convert task to subtask (move under parent)
- Subtask progress bar on parent
- Recursive subtasks (subtasks of subtasks)
