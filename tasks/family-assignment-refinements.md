# Family Assignment Refinements + Mobile Swipe Overhaul

**Date:** 2025-12-04
**Priority:** High
**Status:** Not Started
**Depends on:** family-assignment.md (completed)

---

## Overview

This task combines several refinements to the mobile experience:

1. Fix: Family assignment not showing on mobile/PWA
2. Replace "?" with person silhouette icon for unassigned
3. Add local-only assignment for calendar events
4. Replace interactive checkboxes with non-interactive type icons (mobile only)
5. Overhaul swipe gestures:
   - Swipe LEFT → Complete
   - Swipe RIGHT → Reveal action buttons [Tomorrow] [Skip] [More]
   - Tap on avatar → Opens assignment dropdown
   - Tap on card body → Nothing (disabled)

---

## Task 1: Debug Mobile/PWA Family Assignment

First, investigate why family assignment isn't appearing on mobile.

**Check SwipeableCard.tsx:**
- Verify `familyMembers` prop is being received
- Verify `AssigneeDropdown` is being rendered
- Check if any mobile-specific CSS is hiding it

**Check TodaySchedule.tsx:**
- Verify `familyMembers` is passed to `SwipeableCard` component
- Compare props passed to `ScheduleItem` (desktop) vs `SwipeableCard` (mobile)

**Check for service worker caching:**
If code is correct but not showing, it may be cached. Add a note to test with cache cleared.

---

## Task 2: Replace Question Mark with Silhouette Icon

**File:** `src/components/family/AssigneeAvatar.tsx`

Find:
```typescript
const initials = member?.initials || '?'
```

Change to:
```typescript
const initials = member?.initials || null
```

Then in the return JSX, replace the initials render with:

```tsx
{member?.avatar_url ? (
  <img 
    src={member.avatar_url} 
    alt={name}
    className="w-full h-full rounded-full object-cover"
  />
) : initials ? (
  initials
) : (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className="w-4 h-4"
  >
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
)}
```

**File:** `src/components/family/AssigneeDropdown.tsx`

Find the unassigned button's inner div with "?":
```tsx
<div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm font-semibold">
  ?
</div>
```

Replace with:
```tsx
<div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className="w-5 h-5"
  >
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
</div>
```

---

## Task 3: Add Event Assignment (Local-Only)

### Step 3a: Database migration

**Create file:** `supabase/migrations/20241204_event_assignment.sql`

```sql
-- Add assigned_to to event_notes for local event assignment
alter table event_notes
  add column if not exists assigned_to uuid references family_members(id);

create index if not exists idx_event_notes_assigned_to on event_notes(assigned_to);
```

Run: `cd supabase && supabase db push`

### Step 3b: Update EventNote type and hook

**File:** `src/hooks/useEventNotes.ts`

Add to EventNote interface:
```typescript
assigned_to?: string | null
```

Add new function to the hook:
```typescript
const updateEventAssignment = useCallback(async (eventId: string, memberId: string | null) => {
  if (!user) return

  const { error } = await supabase
    .from('event_notes')
    .upsert({
      user_id: user.id,
      google_event_id: eventId,
      assigned_to: memberId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,google_event_id',
    })

  if (error) {
    console.error('Error updating event assignment:', error)
    return
  }

  setEventNotes(prev => {
    const newMap = new Map(prev)
    const existing = newMap.get(eventId)
    newMap.set(eventId, {
      ...existing,
      google_event_id: eventId,
      assigned_to: memberId,
      notes: existing?.notes || null,
    } as EventNote)
    return newMap
  })
}, [user])
```

Return `updateEventAssignment` from the hook.

### Step 3c: Wire through TodaySchedule

**File:** `src/components/schedule/TodaySchedule.tsx`

When building eventItems, include assignment from eventNotesMap:
```typescript
const eventItems = filteredEvents.map((event) => {
  const item = eventToTimelineItem(event)
  const eventId = event.google_event_id || event.id
  const eventNote = eventNotesMap?.get(eventId)
  if (eventNote?.notes) {
    item.notes = eventNote.notes
  }
  if (eventNote?.assigned_to) {
    item.assignedTo = eventNote.assigned_to
  }
  return item
})
```

Add prop and pass through:
```typescript
onAssignEvent?: (eventId: string, memberId: string | null) => void
```

When rendering items, determine correct handler:
```typescript
onAssign={
  item.type === 'task' && taskId && onAssignTask
    ? (memberId) => onAssignTask(taskId, memberId)
    : item.type === 'event' && onAssignEvent
    ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
    : undefined
}
```

### Step 3d: Wire from App.tsx

Pass `updateEventAssignment` from useEventNotes as `onAssignEvent` to TodaySchedule.

---

## Task 4: Create TypeIcon Component

**Create file:** `src/components/schedule/TypeIcon.tsx`

```tsx
interface TypeIconProps {
  type: 'task' | 'routine' | 'event'
  completed?: boolean
  className?: string
}

export function TypeIcon({ type, completed, className = '' }: TypeIconProps) {
  const baseClasses = `w-4 h-4 ${completed ? 'text-neutral-300' : 'text-neutral-400'} ${className}`

  if (type === 'task') {
    // Stylized circle-check - indicates completable item
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={baseClasses}>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    )
  }

  if (type === 'routine') {
    // Repeat/loop arrows - indicates recurring item
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={baseClasses}>
        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
      </svg>
    )
  }

  // Event - calendar icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={baseClasses}>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
    </svg>
  )
}
```

---

## Task 5: Overhaul SwipeableCard Gestures

This is a significant rewrite of `src/components/schedule/SwipeableCard.tsx`.

### New gesture model:

| Gesture | Action |
|---------|--------|
| Swipe LEFT | Complete (green checkmark appears on right) |
| Swipe RIGHT | Reveal action buttons on left: [Tomorrow] [Skip] [More] |
| Tap avatar | Open assignment dropdown |
| Tap card body | Nothing (disabled) |

### Key changes:

1. **Flip swipe directions** - Complete is now LEFT, actions revealed on RIGHT
2. **Replace checkbox with TypeIcon** - Non-interactive type indicator
3. **Add "More" button** - Opens detail panel
4. **Disable tap on card body** - Only avatar is tappable
5. **Avatar touch handling** - Distinguish tap from swipe start

### Full component rewrite:

**File:** `src/components/schedule/SwipeableCard.tsx`

```tsx
import { useRef, useState, useCallback, useMemo, type TouchEvent } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime } from '@/lib/timeUtils'
import { TypeIcon } from './TypeIcon'
import { AssigneeDropdown } from '@/components/family'

interface SwipeableCardProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onComplete: () => void
  onDefer?: (date: Date) => void
  onSkip?: () => void
  onOpenDetail?: () => void
  familyMembers?: FamilyMember[]
  onAssign?: (memberId: string | null) => void
}

// Swipe thresholds
const COMPLETE_THRESHOLD = 80
const ACTION_THRESHOLD = 60
const RESISTANCE = 0.4

export function SwipeableCard({
  item,
  selected,
  onSelect,
  onComplete,
  onDefer,
  onSkip,
  onOpenDetail,
  familyMembers = [],
  onAssign,
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isActionable = isTask || isRoutine

  // Memoize time display
  const timeText = useMemo(() => {
    if (item.allDay) return 'All day'
    if (!item.startTime) return null
    return formatTime(item.startTime)
  }, [item.allDay, item.startTime])

  // Get assigned family member
  const assignedMember = useMemo(() => {
    if (!item.assignedTo || familyMembers.length === 0) return undefined
    return familyMembers.find(m => m.id === item.assignedTo)
  }, [item.assignedTo, familyMembers])

  // Touch handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (showActions) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
    setIsDragging(true)
  }, [showActions])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - startX.current
    const diffY = currentY - startY.current

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY)
      }
    }

    if (!isHorizontalSwipe.current) return

    e.preventDefault()

    let newTranslate = diffX
    
    // LEFT swipe (negative) - for completion
    if (diffX < -COMPLETE_THRESHOLD) {
      newTranslate = -COMPLETE_THRESHOLD + (diffX + COMPLETE_THRESHOLD) * RESISTANCE
    }
    // RIGHT swipe (positive) - for action buttons
    else if (diffX > ACTION_THRESHOLD * 2) {
      newTranslate = ACTION_THRESHOLD * 2 + (diffX - ACTION_THRESHOLD * 2) * RESISTANCE
    }

    setTranslateX(newTranslate)
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    // LEFT swipe past threshold - complete (only for actionable items)
    if (translateX < -COMPLETE_THRESHOLD && isActionable) {
      onComplete()
      setTranslateX(0)
    }
    // RIGHT swipe past threshold - show action buttons
    else if (translateX > ACTION_THRESHOLD) {
      setShowActions(true)
      setTranslateX(180) // Width of 3 buttons
    }
    else {
      setTranslateX(0)
    }
  }, [isDragging, translateX, isActionable, onComplete])

  const closeActions = useCallback(() => {
    setShowActions(false)
    setTranslateX(0)
  }, [])

  const handleAction = useCallback((action: 'tomorrow' | 'skip' | 'more') => {
    if (action === 'tomorrow' && onDefer) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      onDefer(tomorrow)
    } else if (action === 'skip' && onSkip) {
      onSkip()
    } else if (action === 'more' && onOpenDetail) {
      onOpenDetail()
    }
    closeActions()
  }, [onDefer, onSkip, onOpenDetail, closeActions])

  // Visual state calculations
  // For LEFT swipe (negative translateX), show completion indicator on RIGHT
  const completeProgress = Math.min(Math.max(-translateX, 0) / COMPLETE_THRESHOLD, 1)
  const showCompleteIndicator = translateX < -20 && isActionable

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Complete indicator - appears on RIGHT when swiping LEFT */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-4"
        style={{
          width: Math.max(-translateX, 0),
          backgroundColor: completeProgress > 0.8
            ? 'hsl(152 50% 32%)'
            : `hsl(152 50% ${32 + (1 - completeProgress) * 30}%)`,
        }}
      >
        {showCompleteIndicator && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6 text-white"
            style={{
              transform: `scale(${0.5 + completeProgress * 0.5})`,
              opacity: completeProgress,
            }}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Action buttons - appear on LEFT when swiping RIGHT */}
      <div className="absolute inset-y-0 left-0 flex items-stretch">
        <button
          onClick={() => handleAction('tomorrow')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-amber-500 text-white text-xs font-medium active:bg-amber-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <span>Tomorrow</span>
        </button>
        <button
          onClick={() => handleAction('skip')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-neutral-500 text-white text-xs font-medium active:bg-neutral-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>Skip</span>
        </button>
        <button
          onClick={() => handleAction('more')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-blue-500 text-white text-xs font-medium active:bg-blue-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
          <span>More</span>
        </button>
      </div>

      {/* Main card content */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={showActions ? closeActions : undefined}
        className={`
          relative z-10 px-3 py-2.5 bg-bg-elevated border
          ${!isDragging ? 'transition-transform duration-200 ease-out' : ''}
          ${selected
            ? 'border-primary-200 shadow-md ring-1 ring-primary-200'
            : 'border-neutral-100'
          }
          ${item.completed ? 'opacity-60' : ''}
        `}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="flex items-center gap-3">
          {/* Time - compact, left side */}
          <div className="w-10 shrink-0 text-xs text-neutral-400 font-medium tabular-nums">
            {timeText || '—'}
          </div>

          {/* Type icon - non-interactive indicator */}
          <div className="w-5 shrink-0 flex items-center justify-center">
            <TypeIcon type={item.type} completed={item.completed} />
          </div>

          {/* Title */}
          <span
            className={`
              flex-1 min-w-0 text-base font-medium leading-snug truncate
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
          </span>

          {/* Assignee avatar */}
          {familyMembers.length > 0 && (
            <div 
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <AssigneeDropdown
                members={familyMembers}
                selectedId={item.assignedTo}
                onSelect={onAssign || (() => {})}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Task 6: Update TodaySchedule to pass onOpenDetail

**File:** `src/components/schedule/TodaySchedule.tsx`

Add the `onOpenDetail` prop when rendering SwipeableCard:

```tsx
<SwipeableCard
  key={item.id}
  item={item}
  selected={selectedItemId === item.id}
  onSelect={() => {}} // Disabled - no action on tap
  onComplete={() => {
    if (item.type === 'task' && taskId) {
      onToggleTask(taskId)
    }
  }}
  onDefer={item.type === 'task' && taskId && onPushTask
    ? (date: Date) => onPushTask(taskId, date)
    : undefined
  }
  onSkip={/* wire to skip handler if available */}
  onOpenDetail={() => onSelectItem(item.id)} // Opening detail = selecting the item
  familyMembers={familyMembers}
  onAssign={
    item.type === 'task' && taskId && onAssignTask
      ? (memberId) => onAssignTask(taskId, memberId)
      : item.type === 'event' && onAssignEvent
      ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
      : undefined
  }
/>
```

---

## Task 7: Ensure Routine Completion Works

Routines should also complete on swipe-left. Verify the `onComplete` handler in TodaySchedule handles routines:

```tsx
onComplete={() => {
  if (item.type === 'task' && taskId) {
    onToggleTask(taskId)
  } else if (item.type === 'routine') {
    // Handle routine completion via onRefreshInstances or similar
    // This may already be wired - verify
  }
}}
```

---

## Verification

```bash
npm run lint
npm test -- --run
npm run build
```

**Manual testing on mobile:**

1. Clear PWA cache / force refresh
2. Family avatars appear on cards
3. Tap avatar opens dropdown
4. Swipe LEFT completes task (green check on right)
5. Swipe RIGHT reveals [Tomorrow] [Skip] [More] on left
6. Tap "More" opens detail panel
7. Tap on card body does nothing
8. Events show calendar icon, can be assigned
9. Routines show repeat icon, can be completed

**Desktop should be unchanged** - ScheduleItem still has interactive checkboxes and hover PushDropdown.

---

## Summary of Changes

| File | Changes |
|------|---------|
| AssigneeAvatar.tsx | Replace "?" with silhouette SVG |
| AssigneeDropdown.tsx | Replace "?" with silhouette SVG |
| migration | Add assigned_to to event_notes |
| useEventNotes.ts | Add updateEventAssignment function |
| TypeIcon.tsx | New component (task/routine/event icons) |
| SwipeableCard.tsx | Full rewrite: flip swipes, add More, disable tap |
| TodaySchedule.tsx | Wire event assignment, pass onOpenDetail |
| App.tsx | Pass updateEventAssignment |
