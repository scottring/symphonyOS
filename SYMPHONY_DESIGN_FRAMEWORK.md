# Symphony OS - Design Framework & Architecture Guide

## Executive Summary

Symphony OS is a **family coordination system** - not a personal productivity app that happens to work for families. This distinction drives every design decision.

---

## Part 1: Strategic Positioning

### Market Analysis

The individual productivity space is saturated:
- **Things 3**: 17 years in market, beloved by Apple ecosystem users
- **Todoist**: 40M+ users, natural language parsing, freemium model
- **Motion**: $30M+ funding, AI-first auto-scheduling
- **Structured**: Visual time-blocking, timeline-centric

Family coordination apps exist but are poorly designed (Cozi, OurHome, Picniic). 

**The gap:** "No Things 3 for families" - beautifully designed family coordination with sophisticated workflow.

### Competitive Patterns Learned

**Things 3:**
- Pure GTD, opinionated simplicity
- Everything is to-do or project with temporal buckets (Today/Upcoming/Anytime/Someday)
- Repeating items via templates
- Calendar events stay external, displayed alongside tasks (read-only from Apple Calendar)
- No duplicate detection - user's responsibility

**Todoist:**
- Flexible with projects/labels/filters
- Natural language parsing: "Call mom every Sunday at 3pm #Family @calls"
- Smart capture reduces triage burden
- No explicit transformation - enrich with metadata
- Two-way Google Calendar sync (tasks become events)

**Motion:**
- AI-first auto-scheduling
- Eliminates "when" decision - algorithm finds optimal slots
- Calendar-first: tasks and events on same timeline
- Must provide duration/deadline upfront
- No someday/maybe - everything scheduled or doesn't exist

**Structured:**
- Visual time-blocking, timeline-centric
- Inbox as holding pen, drag to timeline
- Intentionally simple, no project management
- Replan feature auto-reschedules missed tasks

**Key Insight:** All apps assume single user. Family coordination is wide open.

### Symphony's Position

**What we are:**
- Family coordination system, period
- Multi-person by design, not bolted-on sharing
- Timeline Companion (subway map) as flagship differentiator
- Nordic Journal aesthetic vs cluttered family apps
- "Plan on desktop, execute on mobile"

**What gets cut:**
- GTD contexts (@calls, @computer)
- Work project management features
- Personal someday/maybe lists
- Complex tagging systems
- Single-user optimization

**What gets prioritized:**
- Multi-person assignment with handoffs
- Meal ↔ Grocery integration
- Kid-friendly views
- Driver/logistics coordination
- Recurring family rhythms

---

## Part 2: Entity Model

### Core Principle
Everything is a Task with a `category` field. This keeps the data model simple while supporting family-specific item types.

### Task Categories

| Category | Description | Key Attributes | Example |
|----------|-------------|----------------|---------|
| `task` | One-off action | assignee, due date | "Call dentist" |
| `chore` | Recurring household duty | assignee, recurrence, verification | "Take out trash" |
| `errand` | Location-based action | location, combinable | "Pick up dry cleaning" |
| `event` | Calendar-blocked time | start/end, attendees, location | "Soccer practice" |
| `activity` | Kid-related commitment | which child, duration, driver | "Ella's piano lesson" |

### Type Definition (Already Implemented)
```typescript
// src/types/task.ts
export type TaskCategory = 'task' | 'chore' | 'errand' | 'event' | 'activity'

export interface Task {
  // ... existing fields
  category?: TaskCategory  // Defaults to 'task'
}
```

### Database Migration (Already Applied)
```sql
-- Migration 028_task_category.sql
ALTER TABLE tasks 
ADD COLUMN category TEXT DEFAULT 'task' 
CHECK (category IN ('task', 'chore', 'errand', 'event', 'activity'));

CREATE INDEX idx_tasks_category ON tasks(category);
```

### Supporting Entities (Already Exist)
- `FamilyMember` - with colors, avatars, initials
- `Household` - with roles, invitations
- `Routine` - with recurrence patterns
- `ActionableInstance` - for routine instances with assignment overrides
- `CoverageRequest` - handoff system between family members
- `Meal` - meal planning integration

---

## Part 3: Capture & Triage Philosophy

### Capture Speed is Sacred
Goal: < 3 seconds from thought to captured
- Don't block on categorization
- Don't force date selection
- Don't require project assignment
- Parse intelligently, confirm later

### Smart Capture (Future Implementation)
Parse natural language at capture time:
- "Ella soccer Tuesday 4pm" → Detect: Activity, child=Ella, date=Tuesday, time=4pm
- "Buy milk" → No date detected → Inbox
- "Call mom tomorrow" → Task, date=tomorrow

If date/time detected → Schedule directly (skip inbox)
If no date detected → Inbox for triage

### Triage Philosophy: Clarify, Don't Convert
The triage modal adds context to items, not transforms them into different things.

**Old mental model:** "Convert this task to a project"
**New mental model:** "What kind of family item is this?"

### Inbox Triage Flow (Implemented)
```
User opens inbox item → Triage Modal appears

"What kind of thing is this?"
📅 Event      → Calendar-blocked time  
⚽ Activity   → Kid commitment  
🧹 Chore      → Recurring household  
🚗 Errand     → Location-based  
✅ Task       → One-off action (default)

[Contextual fields appear based on selection]
- Event: Start/end time pickers
- Activity: "Which child?" selector
- Errand/Event/Activity: Location field

[Optional enrichment]
- When: Today / Tomorrow / Next Week / Pick date / Someday
- Who: Family member assignment
- Project: Link to existing project

[Footer actions]
- Create Project (converts to project, deletes task)
- Save as Note
- Delete
- Done (applies category + metadata)
```

---

## Part 4: Duplicate Handling Philosophy

### Core Principle: Make Duplicates Visible, Not Prevented

### Why No Auto-Detection
1. **False positives worse than duplicates** - "Call Mom" Monday ≠ "Call Mom" Friday
2. **Capture speed is sacred** - Blocking modals kill flow
3. **Context matters** - Scott's dentist ≠ Ella's dentist
4. **15+ year-old apps haven't solved this** - Things, Todoist don't try

### What Symphony Does Instead

1. **Show context during capture**
   - Display that day's existing items inline while adding new item
   - User sees "oh, I already have soccer on Tuesday"

2. **Family-aware autocomplete**
   - When typing "Ella", show recent Ella-related items
   - Pattern recognition without blocking

3. **Smart merge in lists**
   - Grocery list: "Milk" added twice → qty: 2
   - Automatic consolidation where it makes sense

4. **Visual timeline makes duplicates obvious**
   - Two soccer blocks on Ella's lane = clearly visible
   - Subway map view exposes conflicts naturally

5. **Weekly family review prompt**
   - "3 items mention 'dentist' - consolidate?"
   - Batch cleanup during intentional review time

6. **Fast search (Cmd+K)**
   - Easy to check "do I have this?" without blocking capture

### Anti-Patterns to Avoid
- ❌ Blocking modals ("This may be a duplicate - continue?")
- ❌ Auto-merge without asking
- ❌ Fuzzy matching on every keystroke
- ❌ Preventing any duplicates from being created


### Visual Design
```
       6am     9am      12pm     3pm      6pm      9pm
Scott  ●━━━━━━━━━━━━━━━━━━●━━━━━━━━●━━━━━━━━━━━━━━●
                          │        │              │
Iris   ●━━━━━━━━━━━●━━━━━━●━━━━━━━━●━━━━━━━●━━━━━━●
                   │      │        │        │      │
Ella   ●━━━━━━━━━━━●━━━━━━━━━━━━━━━●━━━━━━━●━━━━━━●
                   │               │        │      │
Kaleb  ●━━━━━━━━━━━●━━━━━━━━━━━━━━━●━━━━━━━●━━━━━━●
                   ↑               ↑        ↑      ↑
              School drop    Soccer    Pickup   Dinner
```

### Key Features
- **Convergence points** = Shared family moments (meals, events, handoffs)
- **Moving dots** = Where each person is right now
- **Color coding** = Each family member's color from their profile
- **Tap to expand** = See details of any segment
- **No notifications** = Calm awareness, not anxiety

### Implementation Priority
This is the **hero feature** that differentiates Symphony:
1. Read-only visualization first (MVP)
2. Interactive planning second
3. Widget version for home screen

---

## Part 7: UI/UX Principles

### Nordic Journal Aesthetic
- Muted, warm colors (not harsh whites or neon accents)
- Generous whitespace
- Subtle shadows and borders
- Typography-focused hierarchy
- Calm vs. cluttered competitor apps

### Mobile-First Interactions
- Touch targets minimum 44x44px
- Swipe gestures for common actions
- Bottom sheet modals (not centered popups)
- Thumb-zone aware layouts

### Family-Aware Defaults
- Default context: `family` (not work/personal)
- Default assignee: Current user
- Show family member colors everywhere
- Initials/avatars as visual anchors


---

## Part 8: Implementation Status

### Completed ✅
- [x] TaskCategory type definition
- [x] Database migration for category field
- [x] Updated useSupabaseTasks hook
- [x] InboxTriageModal with category selection UI
- [x] Category-specific fields (location, time, child picker)
- [x] Triage button on inbox task cards
- [x] "Create Project" wired through component hierarchy
- [x] All tests passing (1443 tests)

### In Progress 🔄
- [ ] Google Calendar write access (see CLAUDE_CODE_GCAL_WRITE.md)

### Next Up 📋
- [ ] Natural language parsing at capture
- [ ] Timeline Companion MVP (read-only)
- [ ] Capture context panel (show existing items while adding)
- [ ] Family-aware autocomplete
- [ ] Smart grocery list merge
- [ ] Weekly review flow

---

## Part 9: File Reference

### Type Definitions
- `src/types/task.ts` - Task, TaskCategory, TaskContext types
- `src/types/family.ts` - FamilyMember, FAMILY_COLORS
- `src/types/project.ts` - Project type
- `src/types/actionable.ts` - Routine, ActionableInstance

### Key Components
- `src/components/triage/InboxTriageModal.tsx` - Category selection modal
- `src/components/schedule/InboxSection.tsx` - Inbox list with triage wiring
- `src/components/schedule/InboxTaskCard.tsx` - Individual inbox item card
- `src/components/schedule/TodaySchedule.tsx` - Main schedule view
- `src/components/home/HomeView.tsx` - Home view container

### Hooks
- `src/hooks/useSupabaseTasks.ts` - Task CRUD with category support
- `src/hooks/useGoogleCalendar.ts` - Google Calendar integration
- `src/hooks/useFamilyMembers.ts` - Family member management

### Database
- `supabase/migrations/028_task_category.sql` - Category field migration


---

## Part 10: Design Decisions Log

### Why categories instead of separate entity types?
**Decision:** Single `tasks` table with `category` field
**Rationale:** 
- Simpler data model
- Easier querying (one table, not five)
- Backwards compatible (existing tasks default to category='task')
- Category is metadata, not fundamentally different data structure

### Why no auto-duplicate detection?
**Decision:** Visual awareness over blocking prevention
**Rationale:**
- Capture speed > duplicate prevention
- False positives are worse than duplicates
- Timeline makes duplicates visually obvious
- Weekly review catches stragglers

### Why "Clarify" not "Convert" in triage?
**Decision:** Triage adds context, doesn't transform
**Rationale:**
- Mental model: "What is this?" not "What should this become?"
- Reduces cognitive load
- Item stays in same table, just gets enriched

### Why cut Work/Personal contexts?
**Decision:** Default to family, don't offer work/personal toggle
**Rationale:**
- Symphony is for families, not work productivity
- Simplifies UI
- Competitors own the work productivity space
- Focus enables differentiation

### Why family member colors everywhere?
**Decision:** Color-code by person, not by type/priority
**Rationale:**
- Family coordination = who's doing what
- Visual scanning for "my stuff" is instant
- Kids can identify their items by color
- Reinforces family-first positioning


---

## Appendix: Quick Reference

### Category Icons
- 📅 Event (calendar-blocked time)
- ⚽ Activity (kid commitment)
- 🧹 Chore (recurring household)
- 🚗 Errand (location-based)
- ✅ Task (one-off action)

### Keyboard Shortcuts (Desktop)
- `Cmd+K` - Quick add / search
- `Cmd+Shift+T` - Add to Today (future)
- `Escape` - Close modal / cancel

### Data Flow
```
Quick Add → [Parse for date?]
                ├─ Yes → Create with scheduledFor set
                └─ No  → Create in Inbox (no scheduledFor)

Inbox Item → Tap triage button → InboxTriageModal
                                      ├─ Select category
                                      ├─ Add optional details
                                      └─ Done → Update task
```

### Test Commands
```bash
# Run all tests
npm run test -- --run

# Run specific test file
npm run test -- --run InboxTriageModal

# Type check
npx tsc --noEmit

# Dev server
npm run dev
```

---

*Last updated: December 2024*
*See also: CLAUDE_CODE_GCAL_WRITE.md for Google Calendar implementation details*
