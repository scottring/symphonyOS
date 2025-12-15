# Symphony OS - Today/Review Mode Implementation

## Executive Summary

This document outlines the implementation of a simplified two-mode system for Symphony OS's Home view. Planning capabilities are always available in Today mode; Review mode is for evening cleanup.

**Core Philosophy:** "Today view = You are current"
- Everything is either scheduled (has a time) or in inbox (needs a decision)
- Inbox items: schedule it or defer it (decide when you'll decide)
- No limbo. No "I'll get to it eventually" pile.
- Planning is always available - no mode switch needed to drag or schedule

---

## Architecture Overview

### Current State
- `HomeViewSwitcher` toggles between `today` | `week` views
- `TodaySchedule` is the main daily view component
- `WeeklyReview` is a modal for inbox triage (currently misnamed)
- `InboxTriageModal` handles full task processing (being deprecated)
- `InboxTaskCard` shows inbox items with defer action only

### Target State
- `ModeToggle` with `today` | `review` modes (replaces Plan/Review header buttons)
- `TodaySchedule` has planning always-on (drag on hover, inbox always accessible)
- `WeeklyReview` modal is deprecated - Review becomes an inline mode
- `InboxTriageModal` is deprecated - replaced by popovers + detail panel
- `InboxTaskCard` gains Schedule + Defer actions with assignee avatar

---

## Design System Alignment

### Existing Tokens (Use These)
```css
/* Colors */
--color-primary-500: hsl(152 50% 32%);     /* Forest green - primary */
--color-warning-500: hsl(35 80% 50%);      /* Amber - attention/overdue */

/* Typography */
--font-family-display: 'Fraunces';          /* Headers */
--font-family-sans: 'DM Sans';              /* Body */

/* Spacing */
--radius-xl: 1.25rem;                       /* Card corners */
--shadow-card: existing warm shadow;

/* Transitions */
--transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
```

### New Tokens to Add
```css
/* Review mode accent (soft blue-gray for reflection) */
--color-review-50: hsl(220 25% 96%);
--color-review-100: hsl(220 20% 92%);
--color-review-500: hsl(220 30% 50%);
```


---

## Component Changes

### 1. ModeToggle (replaces Plan/Review header buttons)

**File:** `src/components/home/ModeToggle.tsx` (new)

```typescript
type ViewMode = 'today' | 'review'

interface ModeToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  inboxCount: number      // Badge on Today (shows inbox items)
  reviewCount: number     // Badge on Review (incomplete + overdue)
}
```

**Visual Spec:**
- Two-segment toggle: `[ ☀️ Today ] [ ✓ Review ]`
- Today is default (left position)
- Active state: white background, subtle shadow, darker text
- Inactive state: transparent, muted text
- Today badge: green circle with inbox count (if > 0)
- Review badge: amber/red circle with attention-needed count (if > 0)

**Icon Suggestions:**
- Today: Sun icon (existing from HomeViewSwitcher)
- Review: Clipboard with checkmark or checklist icon

**Note:** The existing Today/Week toggle (`HomeViewSwitcher`) stays in the top-right corner. This new toggle replaces the "Plan" and "Review" text buttons in the header area.


---

### 2. TodaySchedule - Always-On Planning

**File:** `src/components/schedule/TodaySchedule.tsx` (modify)

**Add mode prop:**
```typescript
interface TodayScheduleProps {
  // ... existing props
  mode: 'today' | 'review'  // NEW
}
```

**Today Mode (default) - Planning Always Available:**
- Header shows "Today" with date
- Progress bar shows completion (existing)
- **Inbox section always visible** (collapsible with badge count)
- **Drag handles appear on hover** (CSS only, no mode switch)
- **Schedule/Defer popovers always available** on inbox cards
- Click card body → detail panel opens
- All existing functionality preserved

**Drag Handles Implementation (CSS only):**
```css
.schedule-item .drag-handle {
  opacity: 0;
  transition: opacity 150ms ease;
}
.schedule-item:hover .drag-handle {
  opacity: 1;
}
```
No JavaScript mode checking needed - just CSS hover state.

**Review Mode:**
- Header changes to "Review" 
- Show review-specific sections (replaces normal timeline):
  - "Didn't Get Done" (incomplete scheduled items from today)
  - "Overdue" (items overdue > 1 day)
  - "Keeps Getting Pushed" (deferCount >= 3)
  - Quick capture input
  - Tomorrow preview (collapsed)
- Each item has: [Tomorrow] [Pick date] [Drop] actions


---

### 3. InboxTaskCard Enhancement

**File:** `src/components/schedule/InboxTaskCard.tsx` (modify)

**Current structure:**
```
[checkbox] [title] [defer-icon]
```

**New structure:**
```
[checkbox] [title] [📅 Schedule] [💤 Later] [SK avatar]
```

**Changes:**
1. Add assignee avatar (always visible, right edge)
2. Replace single defer icon with two action buttons
3. Schedule button opens `SchedulePopover`
4. Later button opens `DeferPopover`
5. Click on title/body opens detail panel (not modal)

**New sub-components needed:**
- `SchedulePopover` - date picker + time picker
- `DeferPopover` - defer options (Tomorrow, Next Week, Pick date)

---

### 4. SchedulePopover (new)

**File:** `src/components/triage/SchedulePopover.tsx` (new)

**Spec:**
```
┌─────────────────────────────────────────┐
│ When?                                   │
│                                         │
│ [Today] [Tomorrow] [Next Week] [📅]     │
│                                         │
│ What time?                              │
│ [9am] [12pm] [3pm] [6pm] [Custom ▼]     │
│                                         │
│              [Schedule]                 │
└─────────────────────────────────────────┘
```

**Time picker requirements:**
- Quick preset buttons for common times
- Custom dropdown with 5-minute increments
- Scroll wheel on mobile, dropdown on desktop
- Type-ahead support on desktop


---

### 5. DeferPopover (enhance existing DeferPicker)

**File:** `src/components/triage/DeferPicker.tsx` (modify)

Keep current functionality but ensure it's clear this is "decide later" not "schedule for later".

**Label change:** "Decide Later" or "Snooze Decision"

---

### 6. ReviewSection (new)

**File:** `src/components/review/ReviewSection.tsx` (new)

**Renders in Review mode, replaces normal timeline:**

```typescript
interface ReviewSectionProps {
  incompleteTasks: Task[]        // Scheduled for today, not done
  overdueTasks: Task[]           // Overdue > 1 day
  staleDeferredTasks: Task[]     // deferCount >= 3
  onReschedule: (id: string, date: Date) => void
  onDrop: (id: string) => void
  onCapture: (text: string) => void
}
```

**Sections:**
1. **Didn't Get Done** - amber/warning styling
2. **Overdue** - red/danger styling with "Be honest with yourself" prompt
3. **Keeps Getting Pushed** - gray/muted with defer count badge
4. **Quick Capture** - simple input, goes to inbox
5. **Tomorrow Preview** - collapsed accordion showing tomorrow's items


---

## Data Model Changes

### Task model additions (if not present)
```typescript
interface Task {
  // ... existing fields
  deferCount?: number        // Track how many times deferred
  deferredAt?: Date          // When last deferred (for staleness calc)
}
```

### New hook: useReviewData
```typescript
function useReviewData(tasks: Task[], viewedDate: Date) {
  // Returns categorized tasks for Review mode
  return {
    incompleteTasks,      // scheduledFor === today && !completed
    overdueTasks,         // scheduledFor < today && !completed
    staleDeferredTasks,   // deferCount >= 3
    tomorrowTasks,        // scheduledFor === tomorrow
  }
}
```

---

## Implementation Scope

**In scope:**
- ModeToggle component (today/review)
- SchedulePopover with time picker
- InboxTaskCard redesign (Schedule + Defer buttons, avatar)
- Drag handles on hover (CSS)
- ReviewSection + useReviewData hook
- Deprecate WeeklyReview modal and InboxTriageModal

**Out of scope (separate feature):**
- Prep task time picker
- Meal time defaults in settings


---

## Files to Create
- `src/components/home/ModeToggle.tsx`
- `src/components/triage/SchedulePopover.tsx`
- `src/components/review/ReviewSection.tsx`
- `src/hooks/useReviewData.ts`

## Files to Modify
- `src/index.css` (add review color tokens)
- `src/components/home/HomeView.tsx` (add mode state)
- `src/components/home/HomeViewSwitcher.tsx` (add ModeToggle or replace Plan/Review buttons)
- `src/components/schedule/TodaySchedule.tsx` (mode awareness for review)
- `src/components/schedule/InboxTaskCard.tsx` (new layout with Schedule/Defer buttons)
- `src/components/schedule/ScheduleItem.tsx` (drag handles on hover via CSS)
- `src/types/task.ts` (deferCount, deferredAt if needed)

## Files to Deprecate
- `src/components/review/WeeklyReview.tsx` (keep code, remove from UI)
- `src/components/triage/InboxTriageModal.tsx` (keep code, remove from UI)

---

## Testing Checklist

### ModeToggle
- [ ] Renders two options (Today, Review)
- [ ] Today is default
- [ ] Badges show correct counts
- [ ] Mode changes propagate to TodaySchedule

### InboxTaskCard
- [ ] Assignee avatar visible
- [ ] Schedule popover opens and works
- [ ] Defer popover opens and works
- [ ] Click body opens detail panel (not modal)


### Today Mode (Always-On Planning)
- [ ] Inbox section visible and collapsible
- [ ] Drag handles appear on hover (CSS)
- [ ] Can drag items to reschedule
- [ ] Schedule/Defer buttons work on inbox cards

### Review Mode
- [ ] Shows correct sections
- [ ] Incomplete items from today appear
- [ ] Overdue items appear
- [ ] Stale deferred items appear (if deferCount >= 3)
- [ ] Quick capture works
- [ ] Tomorrow preview works

### Time Picker (in SchedulePopover)
- [ ] 5-minute increments
- [ ] Quick preset buttons work
- [ ] Custom time selection works
- [ ] Type-ahead on desktop

---

## Questions to Answer Before Starting

1. Is `deferCount` already tracked in the Task model?
2. Is there an existing popover/dropdown component to extend?
3. Current drag-and-drop library used in PlanningSession?
