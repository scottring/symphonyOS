# Code-Split Bundle to Reduce Size

**Date:** 2025-12-04
**Priority:** Medium
**Status:** ✅ Complete

---

## Overview

The JS bundle is 629KB, exceeding Vite's 500KB warning threshold. We'll use React.lazy() and Suspense to split the bundle by route/feature.

**Goal:** Reduce initial bundle to ~400KB by lazy-loading secondary views.

---

## Pre-Flight Check

```bash
npm run build
```

Note the current bundle size:
- `dist/assets/index-*.js` → ~629KB

---

## Strategy

**Keep in main bundle (critical path):**
- AppShell, Sidebar, QuickCapture (layout)
- TodaySchedule, TaskCard, InboxSection (home view)
- DetailPanel (mobile task interaction)
- All hooks (small, used everywhere)

**Lazy load (secondary views):**
- ProjectsList, ProjectView
- RoutinesList, RoutineForm, RoutineInput
- TaskView (desktop-only)
- RecipeViewer (rarely used)
- AuthForm (only for logged-out users)
- CalendarConnect (only when not connected)

---

## Tasks

### 1. Create a Loading Fallback Component

**Create file:** `src/components/layout/LoadingFallback.tsx`

```tsx
export function LoadingFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-neutral-400">Loading...</div>
    </div>
  )
}
```

---

### 2. Create Lazy Import File

To keep App.tsx clean, create a central lazy imports file.

**Create file:** `src/components/lazy.ts`

```tsx
import { lazy } from 'react'

// Project views
export const ProjectsList = lazy(() => 
  import('./project/ProjectsList').then(m => ({ default: m.ProjectsList }))
)
export const ProjectView = lazy(() => 
  import('./project/ProjectView').then(m => ({ default: m.ProjectView }))
)

// Routine views
export const RoutinesList = lazy(() => 
  import('./routine/RoutinesList').then(m => ({ default: m.RoutinesList }))
)
export const RoutineForm = lazy(() => 
  import('./routine/RoutineForm').then(m => ({ default: m.RoutineForm }))
)
export const RoutineInput = lazy(() => 
  import('./routine/RoutineInput').then(m => ({ default: m.RoutineInput }))
)

// Task view (desktop)
export const TaskView = lazy(() => 
  import('./task/TaskView').then(m => ({ default: m.TaskView }))
)

// Recipe viewer
export const RecipeViewer = lazy(() => 
  import('./recipe/RecipeViewer').then(m => ({ default: m.RecipeViewer }))
)

// Auth (only for logged-out state)
export const AuthForm = lazy(() => 
  import('./AuthForm').then(m => ({ default: m.AuthForm }))
)

// Calendar connect banner
export const CalendarConnect = lazy(() => 
  import('./CalendarConnect').then(m => ({ default: m.CalendarConnect }))
)
```

---

### 3. Update App.tsx Imports

**File:** `src/App.tsx`

**Step 3a:** Add Suspense import and LoadingFallback

Change the React import at the top:
```tsx
// BEFORE:
import { useEffect, useState, useMemo, useCallback } from 'react'

// AFTER:
import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
```

Add LoadingFallback import:
```tsx
import { LoadingFallback } from '@/components/layout/LoadingFallback'
```

**Step 3b:** Replace direct imports with lazy imports

Remove these imports (around lines 13-22):
```tsx
// DELETE THESE:
import { RecipeViewer } from '@/components/recipe/RecipeViewer'
import { ProjectsList } from '@/components/project/ProjectsList'
import { ProjectView } from '@/components/project/ProjectView'
import { RoutinesList } from '@/components/routine/RoutinesList'
import { RoutineForm } from '@/components/routine/RoutineForm'
import { RoutineInput } from '@/components/routine/RoutineInput'
import { TaskView } from '@/components/task/TaskView'
import { CalendarConnect } from '@/components/CalendarConnect'
import { AuthForm } from '@/components/AuthForm'
```

Add lazy imports:
```tsx
import {
  ProjectsList,
  ProjectView,
  RoutinesList,
  RoutineForm,
  RoutineInput,
  TaskView,
  RecipeViewer,
  AuthForm,
  CalendarConnect,
} from '@/components/lazy'
```

---

### 4. Wrap Lazy Components with Suspense

**File:** `src/App.tsx`

Find each usage of the lazy-loaded components and wrap with Suspense.

**4a. AuthForm (around line 296):**
```tsx
// BEFORE:
if (!user) {
  return (
    <div className="min-h-screen bg-bg-base">
      <AuthForm />
    </div>
  )
}

// AFTER:
if (!user) {
  return (
    <div className="min-h-screen bg-bg-base">
      <Suspense fallback={<LoadingFallback />}>
        <AuthForm />
      </Suspense>
    </div>
  )
}
```

**4b. CalendarConnect (inside the home view, around line 330):**
```tsx
// BEFORE:
{!isConnected && (
  <div className="p-4 border-b border-neutral-100">
    <CalendarConnect />
  </div>
)}

// AFTER:
{!isConnected && (
  <div className="p-4 border-b border-neutral-100">
    <Suspense fallback={<LoadingFallback />}>
      <CalendarConnect />
    </Suspense>
  </div>
)}
```

**4c. RecipeViewer (in panel prop, around line 315):**
```tsx
// BEFORE:
panel={
  recipeUrl ? (
    <RecipeViewer
      url={recipeUrl}
      onClose={() => setRecipeUrl(null)}
    />
  ) : (
    <DetailPanel ... />
  )
}

// AFTER:
panel={
  recipeUrl ? (
    <Suspense fallback={<LoadingFallback />}>
      <RecipeViewer
        url={recipeUrl}
        onClose={() => setRecipeUrl(null)}
      />
    </Suspense>
  ) : (
    <DetailPanel ... />
  )
}
```

**4d. TaskView (around line 360):**
```tsx
// BEFORE:
{activeView === 'task-detail' && selectedTask && (
  <TaskView ... />
)}

// AFTER:
{activeView === 'task-detail' && selectedTask && (
  <Suspense fallback={<LoadingFallback />}>
    <TaskView ... />
  </Suspense>
)}
```

**4e. ProjectsList and ProjectView (around line 380):**
```tsx
// BEFORE:
{activeView === 'projects' && !selectedProjectId && (
  <ProjectsList ... />
)}

{activeView === 'projects' && selectedProject && (
  <ProjectView ... />
)}

// AFTER:
{activeView === 'projects' && !selectedProjectId && (
  <Suspense fallback={<LoadingFallback />}>
    <ProjectsList ... />
  </Suspense>
)}

{activeView === 'projects' && selectedProject && (
  <Suspense fallback={<LoadingFallback />}>
    <ProjectView ... />
  </Suspense>
)}
```

**4f. RoutinesList, RoutineInput, and RoutineForm (around line 400):**
```tsx
// Wrap each of the three routine views with Suspense:

{activeView === 'routines' && !selectedRoutineId && !creatingRoutine && (
  <Suspense fallback={<LoadingFallback />}>
    <RoutinesList ... />
  </Suspense>
)}

{activeView === 'routines' && creatingRoutine && (
  <div className="h-full overflow-auto">
    <div className="max-w-2xl mx-auto">
      {/* Header stays outside Suspense */}
      <div className="flex items-center gap-3 p-6 pb-0">
        ...
      </div>
      <Suspense fallback={<LoadingFallback />}>
        <RoutineInput ... />
      </Suspense>
    </div>
  </div>
)}

{activeView === 'routines' && selectedRoutine && (
  <Suspense fallback={<LoadingFallback />}>
    <RoutineForm ... />
  </Suspense>
)}
```

---

## Verification

### Step 1: Build and Check Bundle Sizes

```bash
npm run build
```

You should now see multiple chunks in the output:
```
dist/assets/index-*.js          ~350-400KB (main bundle)
dist/assets/ProjectView-*.js    ~XX KB
dist/assets/RoutineForm-*.js    ~XX KB
dist/assets/TaskView-*.js       ~XX KB
...
```

### Step 2: Verify Functionality

```bash
npm run dev
```

Test each view to ensure lazy loading works:
1. Open app → Home view loads immediately
2. Click Projects → Brief loading state, then Projects view
3. Click Routines → Brief loading state, then Routines view
4. Click a task (desktop) → TaskView loads
5. Open a recipe → RecipeViewer loads

### Step 3: Run Tests

```bash
npm run lint
npm test -- --run
```

All should still pass.

---

## Post-Fix Summary

### Bundle Size Comparison

| Metric | Before | After |
|--------|--------|-------|
| Main bundle | 629KB | ~XXX KB |
| Total (all chunks) | 629KB | ~XXX KB |

### Chunks Created
- [ ] List the new chunk files and sizes

### Verification
- [ ] `npm run build` → Shows multiple chunks
- [ ] `npm run dev` → All views load correctly
- [ ] `npm run lint` → 0 errors
- [ ] `npm test -- --run` → All tests pass

---

## Notes

- Suspense boundaries are placed close to the lazy components to minimize the loading fallback area
- The home view (TodaySchedule) remains in the main bundle for instant load
- DetailPanel stays in main bundle since it's used frequently on mobile
- Consider adding route prefetching later for even smoother UX

---

## Results (2025-12-04)

### Bundle Size Comparison

| Metric | Before | After |
|--------|--------|-------|
| Main bundle | 629 KB | 551.72 KB |
| Reduction | — | 77 KB (12%) |

### Chunks Created

| Chunk | Size |
|-------|------|
| TaskView | 23.31 KB |
| ProjectView | 11.92 KB |
| RecipeViewer | 11.69 KB |
| RoutineForm | 8.02 KB |
| RoutinesList | 5.72 KB |
| SemanticRoutine | 5.37 KB |
| ProjectsList | 5.05 KB |
| RoutineInput | 4.78 KB |
| AuthForm | 3.97 KB |
| CalendarConnect | 2.03 KB |

### Verification
- ✅ `npm run build` → Multiple chunks created
- ✅ `npm run lint` → 0 errors
- ✅ `npm test -- --run` → 165 tests pass

---

## Future Optimization (Revisit Later)

Main bundle still at 552KB due to vendor dependencies (React, Supabase SDK, date-fns).

**Options to explore:**
1. **Vendor chunking** — Add `manualChunks` in vite.config.ts to split React/Supabase into separate cached chunks
2. **Bundle analysis** — Run `npx vite-bundle-visualizer` to identify heavy dependencies
3. **Tree-shaking audit** — Check if we're importing more than needed from large libraries
4. **Dynamic imports for date-fns** — Import only specific functions instead of entire library
