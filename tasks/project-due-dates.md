# Project Due Dates

**Date:** 2025-12-04
**Priority:** Medium
**Status:** Not Started
**Depends on:** None

---

## Problem

Projects don't have a due date field. Users need to track when projects should be completed.

## Solution

Add `due_date` to projects.

---

## Implementation

### Step 1: Database migration

```sql
alter table projects
  add column if not exists due_date date;
```

### Step 2: Update Project type

**File:** `src/types/project.ts` (or wherever Project is defined)

```typescript
interface Project {
  // ... existing fields
  due_date?: string | null  // ISO date string
}
```

### Step 3: Update useProjects hook

Add `due_date` to:
- Fetch query select
- Create project function
- Update project function

### Step 4: Add UI in project edit

**File:** DetailPanel.tsx or ProjectView.tsx (wherever projects are edited)

Add date picker:
```tsx
<label className="text-sm text-neutral-500">Due date</label>
<input
  type="date"
  value={project.due_date || ''}
  onChange={(e) => updateProject(project.id, { due_date: e.target.value || null })}
  className="..."
/>
```

### Step 5: Display due date

Show due date on:
- Project cards/rows in Projects view
- Project header in detail view
- Consider: badge if overdue

---

## Verification

- [ ] Can set due date when creating project
- [ ] Can edit due date on existing project
- [ ] Can clear due date (set to null)
- [ ] Due date displays on project list
- [ ] Due date persists after refresh
