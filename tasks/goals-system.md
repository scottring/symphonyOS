# Goals System Implementation Plan

## Overview

Add annual goals with quarterly actions to Symphony OS — a strategic planning layer above projects and tasks.

**Branch:** `feature/goals-system`

---

## Data Model

### `goals` table (Supabase migration)

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  area TEXT NOT NULL,              -- Custom life area: "Family & Relationships", "Home", etc.
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `goal_actions` table

```sql
CREATE TABLE goal_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  project_id UUID REFERENCES projects(id),   -- Optional link (future UI)
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `goal_areas` table (user-defined areas)

```sql
CREATE TABLE goal_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

RLS policies: user can only access their own goals, actions, and areas.

---

## TypeScript Types

### `src/types/goal.ts`

```typescript
export type GoalStatus = 'active' | 'completed' | 'archived'
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export interface GoalAction {
  id: string
  goalId: string
  description: string
  quarter: Quarter
  completed: boolean
  notes?: string
  projectId?: string
  sortOrder: number
  createdAt: Date
}

export interface Goal {
  id: string
  name: string
  area: string
  year: number
  notes?: string
  status: GoalStatus
  sortOrder: number
  actions: GoalAction[]
  createdAt: Date
  updatedAt: Date
}

export interface GoalArea {
  id: string
  name: string
  sortOrder: number
}
```

---

## Implementation Steps

### 1. Database migration (`supabase/migrations/046_goals.sql`)
- Create `goals`, `goal_actions`, `goal_areas` tables
- RLS policies for user isolation
- Indexes on `user_id`, `goal_id`, `year`

### 2. Types (`src/types/goal.ts`)
- Goal, GoalAction, GoalArea interfaces
- Db variants for snake_case mapping

### 3. Hook (`src/hooks/useGoals.ts`)
- CRUD for goals, actions, and areas
- Fetch goals by year with actions included
- Toggle action completion
- Follow existing patterns from `useProjects.ts`

### 4. GoalsList view (`src/components/goals/GoalsList.tsx`)
- Grouped by life area (like your whiteboard)
- Each area section shows its goals
- Year selector (defaults to current year)
- "New Goal" creation inline
- "New Area" creation inline
- Follows ProjectsListRedesign layout patterns

### 5. GoalView detail (`src/components/goals/GoalView.tsx`)
- Goal name (editable, serif font)
- Notes field
- Quarterly actions grouped by quarter (Q1, Q2, Q3, Q4)
- Checkable actions with inline add
- Follows ProjectViewRedesign patterns

### 6. Wire into app
- Add `'goals'` to `ViewType` in Sidebar
- Add sidebar nav item (between Home and Projects)
- Lazy load in `lazy.ts`
- Render in `AppShell.tsx` view switch

### 7. Seed with your data (optional)
- Pre-populate the areas: "Family, Relationships & Community", "Home"
- Add your actual goals as examples

---

## What we're NOT building yet

- Linking UI (project_id field exists but no picker in UI)
- Progress rollup (% of actions complete shown on goals)
- Quarterly planning review prompt
- Family sharing of goals
- Goal-to-routine connections

These can come later as natural extensions.

---

## Design Notes

- Follows Nordic Journal design system (Fraunces headers, warm cards, forest green accents)
- Goal creation uses large serif input like projects
- Life area sections use the same section header pattern as ProjectsListRedesign
- Quarterly action checkboxes match task checkbox styling
- Mobile-responsive following existing patterns
