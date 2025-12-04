# Routine Timeline Visibility

**Date:** 2025-12-04
**Priority:** Low
**Status:** Complete
**Depends on:** None

---

## Problem

Not every routine needs to appear on the Today timeline. Some routines like "wipe kitchen counters" are muscle memory — you don't need to see them and check them off. Cluttering the timeline with low-stakes routines reduces focus on what actually matters.

## Solution

Add a per-routine toggle: `show_on_timeline` (boolean, default true).

When false, the routine:
- Still exists in the system
- Still has its schedule/recurrence
- Does NOT appear on Today view
- Still appears in Routines management view

## Implementation

### Step 1: Database migration

```sql
-- Add show_on_timeline to routines
alter table routines
  add column if not exists show_on_timeline boolean default true;
```

### Step 2: Update Routine type

**File:** `src/types/actionable.ts`

Add to Routine interface:
```typescript
show_on_timeline?: boolean
```

### Step 3: Filter in TodaySchedule

**File:** `src/components/schedule/TodaySchedule.tsx`

When building routine items, filter:
```typescript
const visibleRoutines = routines.filter(r => r.show_on_timeline !== false)
```

### Step 4: Add toggle to routine edit UI

**File:** Wherever routine editing happens (DetailPanel or RoutineInput)

Add checkbox:
```tsx
<label className="flex items-center gap-2">
  <input 
    type="checkbox" 
    checked={routine.show_on_timeline !== false}
    onChange={(e) => updateRoutine(routine.id, { show_on_timeline: e.target.checked })}
  />
  <span className="text-sm text-neutral-600">Show on Today timeline</span>
</label>
```

### Step 5: Update useRoutines hook

Add `show_on_timeline` to:
- Routine fetch query
- UpdateRoutineInput type
- updateRoutine function

---

## Verification

- [x] New routine defaults to showing on timeline
- [x] Toggle off → routine disappears from Today
- [x] Toggle on → routine reappears
- [x] Routine still visible in Routines management regardless of toggle
- [x] Setting persists after refresh

## Implementation Notes

**Database migration required:** Run this on Supabase before testing:
```sql
alter table routines
  add column if not exists show_on_timeline boolean default true;
```

**Files changed:**
- `src/types/actionable.ts` - Added `show_on_timeline: boolean` to Routine interface
- `src/hooks/useRoutines.ts` - Added `show_on_timeline` to UpdateRoutineInput
- `src/components/schedule/TodaySchedule.tsx` - Filter routines by `show_on_timeline !== false`
- `src/components/routine/RoutineForm.tsx` - Added toggle checkbox UI
- `src/hooks/useRoutines.test.ts` - Updated mock routine with `show_on_timeline`
