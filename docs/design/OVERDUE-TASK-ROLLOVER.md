# Design Spec: Overdue Task Rollover

**Date:** December 6, 2025  
**Priority:** High  
**Context:** Tasks scheduled for previous days that weren't completed currently disappear from the schedule view. They should roll forward to today with clear visual distinction.

---

## Design Philosophy

Symphony uses a **warm, organic, refined** aesthetic:
- Fraunces display font for headers
- Warm cream backgrounds with soft shadows
- Muted, nature-inspired state colors
- Generous whitespace and soft rounded corners

The overdue treatment should feel **gently urgent** - prompting action without creating anxiety. We use the **warning palette** (warm amber) rather than danger (red) to maintain the app's calm, supportive tone.

---

## Behavior Specification

### When viewing TODAY:
1. Show tasks scheduled for today (existing behavior)
2. **NEW:** Also show uncompleted tasks from ANY previous day
3. Overdue tasks appear in a dedicated "Overdue" section at the TOP of the schedule

### When viewing OTHER days (past or future):
- Show only tasks scheduled for that specific day (no rollover)
- This allows reviewing what was originally planned for historical days

---

## Visual Design: Overdue Section

### Section Header
Follows existing pattern (like Inbox section) but with warning accent:

```tsx
<div className="mb-8">
  <h2 className="font-display text-sm tracking-wide uppercase mb-4 flex items-center gap-2"
      style={{ color: 'hsl(32 80% 44%)' }}> {/* warning-600 */}
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      {/* Clock with exclamation or alert icon */}
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
    Overdue ({count})
  </h2>
  {/* Overdue task items */}
</div>
```

### Section Container
Subtle warning background to group overdue items:

```tsx
<div className="rounded-2xl p-4 mb-8"
     style={{ 
       backgroundColor: 'hsl(38 75% 96%)',  /* warning-50 */
       border: '1px solid hsl(38 60% 88%)'  /* slightly darker for definition */
     }}>
  {/* Header and items inside */}
</div>
```

---

## Visual Design: Overdue Task Items

Each overdue task card receives subtle visual treatments to distinguish it from regular tasks while maintaining scannability.

### Card Modifications

1. **Left edge indicator** - Amber accent stripe (instead of or in addition to project color):
```tsx
{isOverdue && (
  <div 
    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
    style={{ backgroundColor: 'hsl(35 80% 50%)' }} /* warning-500 */
  />
)}
```

2. **Original date badge** - Show when it was due:
```tsx
{isOverdue && originalDueDate && (
  <span 
    className="text-xs font-medium px-2 py-0.5 rounded-full"
    style={{ 
      backgroundColor: 'hsl(38 75% 96%)',  /* warning-50 */
      color: 'hsl(32 80% 44%)'              /* warning-600 */
    }}>
    Due {formatRelativeDate(originalDueDate)} {/* "Due yesterday", "Due 3 days ago" */}
  </span>
)}
```

3. **Time column treatment** - Replace time with relative due indicator:
```tsx
{/* Instead of showing "2:00 PM" for an overdue task, show: */}
<span className="text-xs font-medium" style={{ color: 'hsl(32 80% 44%)' }}>
  {daysOverdue === 1 ? 'Yesterday' : `${daysOverdue}d ago`}
</span>
```

---

## Interaction: Quick Reschedule

Overdue tasks should be easy to reschedule. Consider adding a quick-action button:

```tsx
<button
  onClick={() => onRescheduleToToday(task.id)}
  className="opacity-0 group-hover:opacity-100 transition-opacity
             px-2 py-1 text-xs font-medium rounded-lg"
  style={{
    backgroundColor: 'hsl(38 75% 96%)',
    color: 'hsl(32 80% 44%)',
    border: '1px solid hsl(38 60% 88%)'
  }}>
  → Today
</button>
```

Or simply rely on the existing Push dropdown which already handles rescheduling.

---

## Implementation: TodaySchedule.tsx Changes

### 1. Update filteredTasks to include overdue

```typescript
const filteredTasks = useMemo(() => {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)

  return tasks.filter((task) => {
    if (!task.scheduledFor) return false
    
    const taskDate = new Date(task.scheduledFor)
    
    // Tasks scheduled for this exact day
    if (taskDate >= startOfDay && taskDate <= endOfDay) {
      return true
    }
    
    // When viewing today: also show overdue uncompleted tasks
    if (isToday && !task.completed && taskDate < startOfDay) {
      return true
    }
    
    return false
  })
}, [tasks, viewedDate, isToday])
```

### 2. Separate overdue from today's tasks

```typescript
const { overdueTasks, todayTasks } = useMemo(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const overdue: Task[] = []
  const scheduled: Task[] = []
  
  filteredTasks.forEach(task => {
    if (!task.scheduledFor) return
    const taskDate = new Date(task.scheduledFor)
    taskDate.setHours(0, 0, 0, 0)
    
    if (taskDate < today && !task.completed) {
      overdue.push(task)
    } else {
      scheduled.push(task)
    }
  })
  
  // Sort overdue by how old they are (oldest first, or newest first - TBD)
  overdue.sort((a, b) => 
    new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime()
  )
  
  return { overdueTasks: overdue, todayTasks: scheduled }
}, [filteredTasks])
```

### 3. Render overdue section before time groups

```tsx
return (
  <div>
    {/* Overdue section - only on today's view */}
    {isToday && overdueTasks.length > 0 && (
      <OverdueSection 
        tasks={overdueTasks}
        onSelectTask={onSelectItem}
        onToggleTask={onToggleTask}
        onPushTask={onPushTask}
        // ... other props
      />
    )}
    
    {/* Inbox section */}
    {isToday && inboxTasks.length > 0 && (
      <InboxSection ... />
    )}
    
    {/* Regular time groups */}
    {sections.map(section => (
      <TimeGroup ... />
    ))}
  </div>
)
```

---

## New Component: OverdueSection.tsx

Create `src/components/schedule/OverdueSection.tsx`:

```tsx
import type { Task } from '@/types/task'
// ... imports

interface OverdueSectionProps {
  tasks: Task[]
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onPushTask?: (taskId: string, date: Date) => void
  // ... other props from ScheduleItem
}

export function OverdueSection({ tasks, ...props }: OverdueSectionProps) {
  if (tasks.length === 0) return null
  
  return (
    <div 
      className="rounded-2xl p-4 mb-8"
      style={{ 
        backgroundColor: 'hsl(38 75% 96%)',
        border: '1px solid hsl(38 60% 88%)'
      }}
    >
      <h2 
        className="font-display text-sm tracking-wide uppercase mb-4 flex items-center gap-2"
        style={{ color: 'hsl(32 80% 44%)' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        Overdue ({tasks.length})
      </h2>
      
      <div className="space-y-3">
        {tasks.map(task => (
          <OverdueTaskCard 
            key={task.id}
            task={task}
            {...props}
          />
        ))}
      </div>
    </div>
  )
}
```

---

## Helper: Relative Date Formatting

Add to `src/lib/timeUtils.ts`:

```typescript
export function formatOverdueDate(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const taskDate = new Date(date)
  taskDate.setHours(0, 0, 0, 0)
  
  const diffDays = Math.floor((today.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return 'Last week'
  return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

---

## Ordering on Today's View

Final section order:
1. **Overdue** - Amber container, catches attention first
2. **Inbox** - Needs triage/scheduling  
3. **Morning/Afternoon/Evening** - Today's scheduled items

This prioritizes: overdue items → unscheduled items → scheduled items

---

## Edge Cases

1. **Many overdue tasks** - Consider collapsing after 5 items with "Show X more"
2. **Very old tasks** - Tasks overdue by 30+ days might warrant special treatment (archive prompt?)
3. **Completed overdue tasks** - Once completed, immediately remove from overdue section

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/schedule/OverdueSection.tsx` | Create new |
| `src/components/schedule/OverdueTaskCard.tsx` | Create new (or extend ScheduleItem) |
| `src/components/schedule/TodaySchedule.tsx` | Add overdue filtering and section |
| `src/lib/timeUtils.ts` | Add `formatOverdueDate` helper |

---

## Accessibility Notes

- Overdue section should have `role="region"` and `aria-label="Overdue tasks"`
- Color alone should not convey status - include text labels ("Due yesterday")
- Warning colors pass WCAG contrast requirements against white/cream backgrounds
