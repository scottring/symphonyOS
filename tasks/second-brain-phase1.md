# Second Brain Phase 1: Emergent Knowledge from Lived Experience

## Philosophy

**Symphony OS already captures the actions of your life.** Tasks, contacts, projects—every completed item is a record of a decision made, a relationship formed, knowledge gained.

The problem: that knowledge evaporates once a task is marked complete. You hired a plumber, but six months later you can't remember who or how much they charged. You found a great summer camp, but the details are lost.

**Second Brain doesn't mean adding a notes system.** It means surfacing the knowledge that already exists in your task history, and making it easy to capture the small details that transform a completed task into retrievable wisdom.

### The Key Insight

> "Who was that plumber we used?"

This question should be answerable by searching "plumber"—and getting back:
- The contact (Joe's Plumbing)
- The task context ("Fix kitchen leak", completed Dec 2024)
- Any notes you added ("$150, same-day service, great work")

The data model already supports this. We just need to:
1. Make it easy to add outcome notes when completing tasks
2. Enrich contacts so they're useful reference documents
3. Surface task history on contacts
4. Make completed tasks browsable

---

## Implementation Status

### Completed (Phase 1A, 1B, 1C, 1D)

| Feature | Status | Location |
|---------|--------|----------|
| Contact `category` field | ✅ Implemented | Migration 034, `src/types/contact.ts` |
| Contact `birthday` field | ✅ Implemented | Migration 034, `src/types/contact.ts` |
| Contact `relationship` field | ✅ Implemented | Migration 034, `src/types/contact.ts` |
| Contact `preferences` field | ✅ Implemented | Migration 034, `src/types/contact.ts` |
| CategoryPicker component | ✅ Implemented | `src/components/contact/CategoryPicker.tsx` |
| ContactView with category | ✅ Implemented | `src/components/contact/ContactView.tsx` |
| ContactView family fields | ✅ Implemented | Birthday, relationship, preferences sections |
| Task history with notes snippet | ✅ Implemented | Shows notes preview in ContactView |
| Search new contact fields | ✅ Implemented | `src/hooks/useSearch.ts` |
| CompletedTasksView | ✅ Implemented | `src/components/history/CompletedTasksView.tsx` |
| History sidebar nav | ✅ Implemented | `src/components/layout/Sidebar.tsx` |
| Completion notes prompt | ✅ Implemented | `src/components/task/CompletionNotesPrompt.tsx` |
| Task `updatedAt` field | ✅ Implemented | `src/types/task.ts` |

---

## Data Model Changes

### Contact Type Updates

```typescript
export type ContactCategory =
  | 'family'           // Immediate family members
  | 'friend'           // Personal friends
  | 'service_provider' // Plumber, doctor, mechanic, etc.
  | 'professional'     // Work contacts
  | 'school'           // Teachers, school staff
  | 'medical'          // Doctors, specialists
  | 'other'

export interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string

  // NEW: Categorization
  category?: ContactCategory

  // NEW: Family-specific fields (only relevant when category = 'family')
  birthday?: string           // ISO date string (YYYY-MM-DD)
  relationship?: string       // "son", "spouse", "mother", etc.

  // NEW: Preferences/facts (freeform, for any category)
  preferences?: string        // "Likes dinosaurs, hates carrots, shoe size 5"

  createdAt: Date
  updatedAt: Date
}
```

### Database Migration

Created `supabase/migrations/034_add_contact_enrichment.sql`:
- Added `category` column with enum constraint
- Added `birthday`, `relationship`, `preferences` columns
- Added index for category filtering

---

## Files Created

```
src/components/contact/CategoryPicker.tsx      # Category dropdown picker
src/components/history/CompletedTasksView.tsx  # Browse completed tasks
src/components/task/CompletionNotesPrompt.tsx  # Post-completion note prompt
supabase/migrations/034_add_contact_enrichment.sql
tasks/second-brain-phase1.md                   # This spec
```

## Files Modified

```
src/types/contact.ts        # Added category, family fields, helpers
src/types/task.ts           # Added updatedAt field
src/hooks/useContacts.ts    # Handle new contact fields
src/hooks/useSupabaseTasks.ts # Expose updatedAt
src/hooks/useSearch.ts      # Search new contact fields
src/components/contact/ContactView.tsx  # Full redesign with new features
src/components/task/TaskView.tsx        # Added completion notes prompt
src/components/layout/Sidebar.tsx       # Added History nav item
src/App.tsx                             # Added History view routing
src/test/mocks/factories.ts             # Updated test factories
+ Various test files                     # Added updatedAt to mocks
```

---

## UI Components

### ContactView Enhancements

The ContactView now shows:
- Category picker at the top
- Family-specific fields (birthday, relationship) when category = 'family'
- Preferences & Facts section (freeform text for any category)
- Task History section with:
  - Active tasks shown first
  - Completed tasks with completion date
  - Notes snippet preview for each task

### CompletedTasksView (History)

- Full-page view accessible from sidebar
- Completed tasks grouped by month
- Search within completed tasks
- Shows task title, date, contact, project, and notes snippet
- Click to navigate to task detail

### CompletionNotesPrompt

- Appears in TaskView after marking a task complete (if no notes exist)
- Collapsed: shows "Add note" button, auto-dismisses after 5 seconds
- Expanded: textarea to enter notes, Save/Skip buttons
- Non-intrusive but encourages knowledge capture

---

## Search Behavior Updates

Search now includes:
- `category` field for contacts
- `preferences` field for contacts
- `relationship` field for contacts

Search result subtitles for contacts now show: "Category · Phone/Email"

---

## Future Phases (Not in This Spec)

### Phase 2: Richer Task Outcomes
- Structured outcome fields (cost, rating, would-use-again)
- Outcome templates per task type
- Auto-suggestions based on contact category

### Phase 3: Knowledge Connections
- "Related" tasks on task view (same contact, same project)
- Contact recommendations ("You used Joe's Plumbing for similar work")
- Timeline view across entities

### Phase 4: Proactive Surfacing
- "It's been 6 months since you contacted Dr. Smith"
- "Max's birthday is in 2 weeks"
- "You last used [service provider] for [task type]"

---

## Summary

Phase 1 of Second Brain focuses on **making existing data retrievable**:

1. **Enrich contacts** so they're useful reference documents
2. **Show task history** on contacts to answer "what did we do with X?"
3. **Prompt for notes** on completion to capture outcomes
4. **Browse completed tasks** to see your action history

No new data model paradigms. No separate wiki. Just surfacing the knowledge that's already being captured through daily task flow.
