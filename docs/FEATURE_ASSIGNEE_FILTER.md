# Feature: Assignee Filter

## Overview
Add an expandable filter icon in the upper right corner (alongside Today/Week/Review icons) that lets users filter tasks by assignee.

## UI Behavior

### Collapsed State
```
[☀️ Today] [📅 Week] [📋 Review] [👤 Filter]
```
- Filter icon (Users or Filter icon from Lucide)
- When a filter is active, show the active avatar instead of generic icon
- Small dot indicator if filter is active

### Expanded State (on click)
```
[☀️ Today] [📅 Week] [📋 Review] [👤▼]
                                    ↓
                              ┌─────────┐
                              │ [All]   │
                              │ [SK]    │
                              │ [IR]    │
                              │ [?]     │  ← Unassigned
                              └─────────┘
```
- Dropdown/popover with avatar buttons
- "All" option at top (default, shows everything)
- Only show family members who have tasks in current view
- "Unassigned" option (shows tasks with no assignee)
- Click outside to close

## Filter Logic

### Who appears in the dropdown
- Only family members with at least 1 task visible in the current view
- Always show "All" 
- Always show "Unassigned" if there are unassigned tasks

### What gets filtered
- ScheduleItems (tasks/events with times)
- Inbox items
- All day items
- Review mode items (when in Review view)

## Implementation

### New Components
- `src/components/home/AssigneeFilter.tsx` - the dropdown filter component

### Props
```tsx
interface AssigneeFilterProps {
  selectedAssignee: string | null  // null = "All"
  onSelectAssignee: (id: string | null) => void
  assigneesWithTasks: FamilyMember[]  // only those with tasks today
  hasUnassignedTasks: boolean
}
```

### State Location
- Filter state lives in `HomeView.tsx`
- Pass filter down to `TodaySchedule`, `WeekSchedule`, etc.
- Each view filters its own data based on selected assignee

### Filter State Persistence
- For now: reset to "All" when switching views
- Can revisit if this feels wrong in practice

## Icons (Lucide)
```tsx
import { Users, Filter, User } from 'lucide-react'
```
- Collapsed with no filter: `Users` or `Filter` icon
- Collapsed with active filter: Show the selected avatar
- Unassigned option: `User` with question mark or dashed circle

## Files to Modify
- `src/components/home/HomeView.tsx` - add filter state, compute assigneesWithTasks
- `src/components/home/HomeViewSwitcher.tsx` - add filter button/dropdown
- `src/components/schedule/TodaySchedule.tsx` - accept filter prop, filter displayed items
- `src/components/schedule/WeekSchedule.tsx` - same
- `src/components/review/ReviewSection.tsx` - same
