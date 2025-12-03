# Planning & Inbox Management Implementation

## Overview

Transform task capture into a proper GTD-style inbox workflow with intentional scheduling vs. deferral.

**Core insight**: The inbox is "stuff without a temporal home." A date gives it that home. The distinction between *scheduling* (commitment) and *deferring* (punt) creates intentionality.

## Core Concepts

### Inbox
Items without a `scheduled_date`. These need triage.

### Two ways to give an item a date

| Action | Meaning | Where it appears |
|--------|---------|------------------|
| **Schedule** | "I commit to doing this Tuesday" | Main task list on that day |
| **Defer** | "Remind me again Tuesday" | Inbox on that day (requires re-triage) |

Deferred items cycle back through inbox until you schedule, complete, or delete them.

## Data Model

### Migration

```sql
-- Rename due_date to scheduled_date for clarity
ALTER TABLE tasks RENAME COLUMN due_date TO scheduled_date;

-- Add deferral tracking
ALTER TABLE tasks ADD COLUMN deferred_until DATE;
ALTER TABLE tasks ADD COLUMN defer_count INTEGER DEFAULT 0;
```

### TypeScript Interface

```typescript
interface Task {
  id: string
  user_id: string
  title: string
  status: 'pending' | 'completed'
  scheduled_date: string | null   // When you'll do it (commitment)
  deferred_until: string | null   // Show in inbox again on this date (punt)
  defer_count: number             // Times deferred
  context: string | null
  assigned_to: string | null
  project_id: string | null
  is_all_day: boolean
  created_at: string
  updated_at: string
}
```

## Item Lifecycle

```
Capture (Cmd+K)
    ↓
Today's Inbox
    ↓
Triage card appears inline (~4s auto-collapse)
    ↓
┌──────────────────────────────────────────────┐
│  [📅 Schedule]  [↻ Defer ▾]  [🏷️]  [👤]     │
└──────────────────────────────────────────────┘
    ↓                         ↓
 (ignored)                 (action taken)
    ↓                         ↓
Collapses to              Schedule → sets scheduled_date
Inbox section             Defer → sets deferred_until, increments defer_count
```

## Today View Structure

```
┌─────────────────────────────────────────┐
│ Today                [📋 Weekly Review] │
├─────────────────────────────────────────┤
│ ▸ Tasks                                 │  ← scheduled_date = today
│   □ Call dentist                        │
│   □ Review PR                           │
│   □ Pick up groceries                   │
├─────────────────────────────────────────┤
│ ▸ Inbox (4)                             │  ← needs triage
│   □ New idea just captured              │
│   □ Deferred from Monday ↻2             │
│   □ Thing I forgot about                │
└─────────────────────────────────────────┘
```

### Query Logic

**Tasks section** (commitments for today):
```sql
WHERE scheduled_date = CURRENT_DATE
  AND status = 'pending'
```

**Inbox section** (needs triage):
```sql
WHERE (scheduled_date IS NULL OR deferred_until <= CURRENT_DATE)
  AND status = 'pending'
```

## Triage Card UI

### Inline Card (appears after capture)

```
┌────────────────────────────────────────────┐
│ Buy groceries                              │
│                                            │
│ [📅 Schedule]  [↻ Defer ▾]  [🏷️]  [👤]    │
└────────────────────────────────────────────┘
```

### Defer Dropdown

```
↻ Defer ▾
├── Tomorrow
├── Next Week
└── Pick date...
```

### Behaviors

- **Schedule**: Opens WhenPicker (two-step from V1.5), sets `scheduled_date`, clears `deferred_until`
- **Defer → Tomorrow**: Sets `deferred_until` to tomorrow, increments `defer_count`
- **Defer → Next Week**: Sets `deferred_until` to +7 days, increments `defer_count`
- **Defer → Pick date**: Opens date picker for `deferred_until`
- **Context (🏷️)**: Opens context picker (existing)
- **Assign (👤)**: Opens contact picker (existing)

### Auto-collapse

- Card appears inline after Cmd+K save
- After ~4 seconds of no interaction, card animates down to Inbox section as normal row
- Timing configurable (hardcode 4s default for now)

### Defer Badge

Show `↻N` badge when `defer_count >= 2`:

```
□ Reschedule dentist ↻3
```

Subtle indicator, not judgmental. Helps surface chronic punters during Weekly Review.

## Weekly Review

### Trigger
Button in Today view header:

```
┌─────────────────────────────────────────┐
│ Today                [📋 Weekly Review] │
```

Button always visible but shows count badge when inbox has items.

### View
Opens focused modal/panel showing all inbox items:

```
┌─────────────────────────────────────────┐
│ Weekly Review                     ✕     │
├─────────────────────────────────────────┤
│ 12 items to process                     │
│                                         │
│ □ Call insurance company ↻4             │
│   [📅 Schedule]  [↻ Defer ▾]  [🗑️]     │
│                                         │
│ □ Research vacation spots               │
│   [📅 Schedule]  [↻ Defer ▾]  [🗑️]     │
│                                         │
│ □ Fix leaky faucet ↻2                   │
│   [📅 Schedule]  [↻ Defer ▾]  [🗑️]     │
│                                         │
└─────────────────────────────────────────┘
```

### Completion
When inbox is empty:

```
┌─────────────────────────────────────────┐
│            ✓ Review Complete            │
│                                         │
│     All items have temporal homes.      │
│                                         │
│              [Done]                     │
└─────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Data Model
- [ ] Create migration: rename `due_date` → `scheduled_date`, add `deferred_until`, `defer_count`
- [ ] Update Task type in `src/types/actionable.ts`
- [ ] Update `useTasks` hook to handle new fields

### Phase 2: Query Logic
- [ ] Create `useInbox` hook or extend `useTasks` with inbox filtering
- [ ] Scheduled tasks query: `scheduled_date = today`
- [ ] Inbox query: `scheduled_date IS NULL OR deferred_until <= today`

### Phase 3: Schedule & Defer Actions
- [ ] Add `scheduleTask(id, date)` function - sets `scheduled_date`, clears `deferred_until`
- [ ] Add `deferTask(id, date)` function - sets `deferred_until`, increments `defer_count`
- [ ] Wire up WhenPicker for scheduling
- [ ] Create Defer dropdown component with presets

### Phase 4: Today View Restructure
- [ ] Split Today into Tasks section + Inbox section
- [ ] Tasks section shows `scheduled_date = today` items
- [ ] Inbox section shows items needing triage
- [ ] Add defer badge display (`↻N` when count >= 2)

### Phase 5: Triage Card
- [ ] Create `TriageCard` component with action buttons
- [ ] Add auto-collapse timer (~4s)
- [ ] Integrate with QuickCapture flow
- [ ] Card appears inline, collapses to Inbox row

### Phase 6: Weekly Review
- [ ] Add "Weekly Review" button to Today header
- [ ] Create `WeeklyReview` modal/panel component
- [ ] Show all inbox items with triage actions
- [ ] Add completion celebration when empty

## File Changes

### Create
- `src/components/task/TriageCard.tsx`
- `src/components/task/DeferDropdown.tsx`
- `src/components/review/WeeklyReview.tsx`
- `src/hooks/useInbox.ts` (or extend useTasks)
- `supabase/migrations/XXX_add_planning_fields.sql`

### Modify
- `src/types/actionable.ts` - Update Task interface
- `src/hooks/useTasks.ts` - Add schedule/defer functions, update queries
- `src/components/today/TodayView.tsx` - Split into Tasks + Inbox sections
- `src/components/layout/QuickCapture.tsx` - Trigger triage card on save
- `src/App.tsx` - Wire up Weekly Review

## Test Cases

### Scheduling
- [ ] Schedule task for today → appears in Tasks section
- [ ] Schedule task for future date → not visible today
- [ ] Scheduling clears any existing `deferred_until`

### Deferring
- [ ] Defer to tomorrow → appears in Inbox tomorrow
- [ ] Defer increments `defer_count`
- [ ] Deferred item with `defer_count >= 2` shows badge

### Inbox Logic
- [ ] New capture (no dates) → appears in Inbox
- [ ] `deferred_until = today` → appears in Inbox
- [ ] `deferred_until = yesterday` → appears in Inbox (overdue)
- [ ] `scheduled_date = today` → appears in Tasks, NOT Inbox

### Triage Card
- [ ] Card appears after Cmd+K save
- [ ] Card auto-collapses after ~4s
- [ ] Clicking action prevents auto-collapse
- [ ] Actions work correctly (schedule, defer, context, assign)

### Weekly Review
- [ ] Button shows in Today header
- [ ] Opens modal with all inbox items
- [ ] Processing items removes them from list
- [ ] Empty inbox shows completion message
