# Unified DetailPanel Implementation

## Overview
Make desktop task clicks open the side DetailPanel instead of navigating to full-page TaskView. This creates consistent UX where all item types (tasks, events, routines) open in the side panel.

## Prerequisites
Read the design spec first: `docs/design/UNIFIED-DETAIL-PANEL.md`

## Implementation Steps

### Step 1: Update App.tsx handleSelectItem

**File:** `src/App.tsx`
**Location:** Around line 360-380, in the `handleSelectItem` function

**Current behavior:**
```typescript
if (itemId.startsWith('task-')) {
  if (isMobile) {
    setSelectedItemId(itemId)  // Mobile: DetailPanel
  } else {
    const taskId = itemId.replace('task-', '')
    setSelectedTaskId(taskId)   // Desktop: Full-page TaskView
    setActiveView('task-detail')
  }
}
```

**New behavior - remove the desktop branching:**
```typescript
if (itemId.startsWith('task-')) {
  setSelectedItemId(itemId)  // Always use DetailPanel
}
```

Or even simpler, since events and routines already just call `setSelectedItemId(itemId)`, the task-specific branch may be able to be removed entirely if that's all it does differently.

### Step 2: Verify DetailPanel handles tasks fully

Check that `src/components/detail/DetailPanel.tsx` (or DetailPanelRedesign.tsx if that's active) can:
- [x] Display task title (editable)
- [x] Toggle completion checkbox
- [x] Edit scheduled date/time
- [x] Edit notes
- [x] Show/edit contact linkage
- [x] Show/edit project linkage
- [x] Show subtasks
- [x] Delete task

This should already be implemented since it works on mobile.

### Step 3: Test the change

1. Desktop: Click a task in TodaySchedule → should open side panel, NOT navigate away
2. Desktop: Click an event → should open side panel (unchanged)
3. Desktop: Click a routine → should open side panel (unchanged)
4. Mobile: All items should still open side panel (unchanged)
5. Verify all task editing functions work in the side panel

### Step 4: Consider removing/deprecating TaskView navigation

If TaskView is no longer reachable from normal navigation:
- Keep the component for now (may be useful for deep-link URLs)
- Or add a "Open full page" button in DetailPanel that navigates to TaskView for power users who want more space

## Visual Enhancement (Phase 2 - Optional)

After the behavior change works, consider porting the card-based section styling from TaskView to DetailPanel for better visual hierarchy. See the design doc for details on the card styling pattern.

## Verification

```bash
npm run build
npm run lint
```

Then manual testing of click behaviors on desktop and mobile.
