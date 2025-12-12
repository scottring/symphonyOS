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

## Current State Assessment

### What Already Exists

| Feature | Status | Location |
|---------|--------|----------|
| Task `notes` field | ✅ Exists | `src/types/task.ts` |
| Contact `notes` field | ✅ Exists | `src/types/contact.ts` |
| Notes in TaskView | ✅ Exists | `src/components/task/TaskView.tsx` |
| Notes in DetailPanel | ✅ Exists | `src/components/detail/DetailPanel.tsx` |
| Universal search | ✅ Exists | `src/hooks/useSearch.ts` |
| Search includes notes | ✅ Exists | Fuse.js searches task.notes, contact.notes |
| Standalone notes system | ✅ Scaffolded | `supabase/migrations/022_notes.sql` |

### What's Missing

| Feature | Status | Priority |
|---------|--------|----------|
| Contact `category` field | ❌ Missing | High |
| Contact family fields (birthday, etc.) | ❌ Missing | Medium |
| Contact detail view | ❌ Missing | High |
| Task history on contact view | ❌ Missing | High |
| "Add note on completion" prompt | ❌ Missing | Medium |
| Completed tasks browser | ❌ Missing | Medium |
| Search filter for completed tasks | ❌ Missing | Low |

---

## Phase 1 Scope

This spec covers the foundation for "Second Brain":

1. **Contact enrichment** — Category, family fields, prominent notes
2. **Contact detail view** — Full profile with task history
3. **Completion notes prompt** — Gentle nudge to capture outcomes
4. **Completed tasks visibility** — Browse and search history

---

## Data Model Changes

### Contact Type Updates

```typescript
// src/types/contact.ts

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
  birthday?: string           // ISO date string (no year for privacy option)
  relationship?: string       // "son", "spouse", "mother", etc.

  // NEW: Preferences/facts (freeform, for any category)
  preferences?: string        // "Likes dinosaurs, hates carrots, shoe size 5"

  createdAt: Date
  updatedAt: Date
}
```

### Database Migration

```sql
-- Migration: add_contact_enrichment.sql

-- Add category enum
ALTER TABLE contacts
ADD COLUMN category TEXT CHECK (category IN (
  'family', 'friend', 'service_provider', 'professional', 'school', 'medical', 'other'
));

-- Add family/personal fields
ALTER TABLE contacts ADD COLUMN birthday DATE;
ALTER TABLE contacts ADD COLUMN relationship TEXT;
ALTER TABLE contacts ADD COLUMN preferences TEXT;

-- Index for category filtering
CREATE INDEX idx_contacts_category ON contacts(user_id, category);
```

---

## UI Components

### 1. ContactView (Full-Page Contact Detail)

**File:** `src/components/contact/ContactView.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          [Delete]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  👤 Joe's Plumbing                                          │  ← text-2xl font-display
│     Service Provider                                        │  ← category badge
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  CONTACT INFO                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📞 555-123-4567                          [Copy]      │   │
│  │ 📧 joe@joesplumbing.com                  [Copy]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  NOTES                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Fast, reasonable prices, came same day. Referred by │   │
│  │ Sarah. Licensed and insured.                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  HISTORY (3 tasks)                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Fix kitchen leak                     Dec 15, 2024 │   │
│  │   "$150, fixed in 30 minutes"                       │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✓ Check water heater                   Oct 3, 2024  │   │
│  │   "Annual inspection, all good"                     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✓ Install new faucet                   Aug 20, 2024 │   │
│  │   "$200 + parts"                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Editable name (click to edit, like TaskView)
- Category picker (dropdown)
- Contact info with copy buttons
- Freeform notes (auto-save, debounced)
- **Task history section** — All tasks (completed AND active) linked to this contact
- Task history shows: title, completion date, task notes snippet
- Click task → navigate to TaskView/DetailPanel

### 2. ContactView for Family Members

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          [Delete]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  👤 Max                                                     │
│     Family · Son                                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  DETAILS                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🎂 Birthday      March 15                           │   │
│  │ 👟 Relationship  Son                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PREFERENCES & FACTS                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Shoe size: 5                                        │   │
│  │ Loves dinosaurs, especially T-Rex                   │   │
│  │ Allergic to peanuts                                 │   │
│  │ Best friend: Tommy from school                      │   │
│  │ Hates carrots but will eat them if hidden          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  HISTORY (12 tasks)                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Buy Max new sneakers                 Dec 10, 2024 │   │
│  │   "Size 5, Nike, $45 at Target"                     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✓ Schedule Max dentist                 Nov 5, 2024  │   │
│  │   "Dr. Chen, no cavities"                           │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ Sign up Max for summer camp              Pending  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Family-specific behavior:**
- Shows birthday field
- Shows relationship field
- "Preferences & Facts" section instead of generic notes
- Same task history section

### 3. Category Picker Component

**File:** `src/components/contact/CategoryPicker.tsx`

Simple dropdown with category options:
- Family
- Friend
- Service Provider
- Professional
- School
- Medical
- Other

Each category has an icon and color badge.

### 4. Completion Notes Prompt

When a user marks a task complete, show a subtle prompt to add notes:

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Fix kitchen leak                              [Undo]    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Add a note? (cost, outcome, what you learned...)   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                    [Skip]  [Add Note]       │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Appears inline (toast or expandable section) after completion
- Auto-dismisses after 5 seconds if ignored
- "Add Note" expands a text input
- Saving note closes the prompt
- "Skip" dismisses immediately
- Only shows for tasks that don't already have notes

**Alternative (simpler):** Just make the notes field more prominent in the completion animation / confirmation.

### 5. Completed Tasks Browser

**File:** `src/components/history/CompletedTasksView.tsx`

Access via: Sidebar link "History" or search filter

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                History                              │
├─────────────────────────────────────────────────────────────┤
│  🔍 Search completed tasks...                               │
├─────────────────────────────────────────────────────────────┤
│  DECEMBER 2024                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Fix kitchen leak                          Dec 15  │   │
│  │   Joe's Plumbing · "$150, same-day"                 │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✓ Buy Max new sneakers                      Dec 10  │   │
│  │   "Size 5, Nike, $45"                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  NOVEMBER 2024                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Schedule Max dentist                       Nov 5  │   │
│  │   Dr. Chen · "No cavities"                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│               [Load more...]                                │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Grouped by month
- Shows task title, date, contact (if any), notes snippet
- Search filters within completed tasks
- Click task → TaskView/DetailPanel
- Pagination or infinite scroll

---

## Implementation Tasks

### Phase 1A: Contact Enrichment (Database + Types)

1. **Create migration:** `add_contact_enrichment.sql`
   - Add `category`, `birthday`, `relationship`, `preferences` columns

2. **Update Contact type:** `src/types/contact.ts`
   - Add new fields and `ContactCategory` type

3. **Update useContacts hook:** `src/hooks/useContacts.ts`
   - Handle new fields in CRUD operations

4. **Update search:** `src/hooks/useSearch.ts`
   - Add `category` and `preferences` to contact search keys

### Phase 1B: Contact Detail View

5. **Create ContactView:** `src/components/contact/ContactView.tsx`
   - Full-page contact editor
   - Editable fields: name, category, phone, email, notes
   - Family fields shown conditionally (birthday, relationship, preferences)

6. **Create CategoryPicker:** `src/components/contact/CategoryPicker.tsx`
   - Dropdown for selecting contact category

7. **Add task history section to ContactView**
   - Query tasks where `contactId` matches
   - Show both completed and active tasks
   - Display title, date, notes snippet

8. **Wire up routing in App.tsx**
   - Add `selectedContactId` state
   - Add `'contact-detail'` view type
   - Render ContactView when selected

9. **Make contacts clickable**
   - TaskView: contact chip → ContactView
   - DetailPanel: contact section → ContactView
   - Search results: contact → ContactView

### Phase 1C: Completion Notes Prompt

10. **Add completion notes prompt**
    - In TaskCard/checkbox handler OR
    - In TaskView/DetailPanel completion flow
    - Show inline prompt after marking complete
    - Auto-dismiss after timeout
    - Optional: make notes field pulse/highlight instead

### Phase 1D: Completed Tasks Browser

11. **Create CompletedTasksView:** `src/components/history/CompletedTasksView.tsx`
    - List of completed tasks grouped by month
    - Search within completed tasks
    - Pagination

12. **Add History to sidebar navigation**
    - New nav item: "History" with clock icon
    - Routes to CompletedTasksView

---

## Files to Create

```
src/components/contact/ContactView.tsx      # Full contact detail page
src/components/contact/CategoryPicker.tsx   # Category dropdown
src/components/history/CompletedTasksView.tsx # Browse completed tasks
supabase/migrations/XXX_add_contact_enrichment.sql
```

## Files to Modify

```
src/types/contact.ts        # Add category, family fields
src/hooks/useContacts.ts    # Handle new fields
src/hooks/useSearch.ts      # Search new fields
src/App.tsx                 # Contact view routing
src/components/task/TaskView.tsx      # Clickable contacts
src/components/detail/DetailPanel.tsx # Clickable contacts
src/components/layout/Sidebar.tsx     # History nav link
```

---

## Search Behavior Updates

The existing search already supports notes. Updates needed:

1. **Add new contact fields to search:**
   ```typescript
   const contactFuse = new Fuse(contacts, {
     keys: [
       { name: 'name', weight: 2 },
       { name: 'email', weight: 1.5 },
       { name: 'phone', weight: 1.5 },
       { name: 'notes', weight: 1 },
       { name: 'category', weight: 1 },      // NEW
       { name: 'preferences', weight: 1 },   // NEW
     ],
     // ...
   })
   ```

2. **Consider search result grouping:**
   - Current: Tasks, Projects, Contacts, Routines
   - Could add: "Completed Tasks" as separate group
   - Or: toggle to include/exclude completed

---

## Testing Checklist

### Contact Enrichment
- [ ] Can set category on new contact
- [ ] Can edit category on existing contact
- [ ] Family fields appear when category = 'family'
- [ ] Preferences field saves and displays correctly
- [ ] Birthday field works (date picker)

### Contact Detail View
- [ ] Navigating to contact shows ContactView
- [ ] Can edit all contact fields
- [ ] Task history shows all linked tasks
- [ ] Completed tasks show in history with date and notes
- [ ] Can click task in history to navigate to it
- [ ] Back button returns to previous view
- [ ] Delete contact works (with confirmation)

### Completion Notes
- [ ] Prompt appears after marking task complete
- [ ] Can add note from prompt
- [ ] Prompt auto-dismisses if ignored
- [ ] Skip button dismisses immediately
- [ ] Note saves correctly

### Completed Tasks Browser
- [ ] History view shows completed tasks
- [ ] Tasks grouped by month
- [ ] Search filters completed tasks
- [ ] Can navigate to task from history
- [ ] Pagination/load more works

### Search Integration
- [ ] Searching "plumber" finds service provider contact
- [ ] Searching "plumber" finds tasks with "plumber" in title/notes
- [ ] Contact category is searchable
- [ ] Contact preferences are searchable

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

## Design Notes

### Why Freeform Preferences?

The `preferences` field is intentionally unstructured. Trying to create fields for every possible fact about a person (shoe size, allergies, favorite color) leads to:
- Overwhelming forms
- Missed edge cases
- Friction that prevents capture

Instead: one freeform field where you jot facts as you learn them. Search handles retrieval.

### Why Not a Separate Notes System?

Symphony already has a notes system scaffolded (migration 022). But for Phase 1, we're focusing on **task-anchored knowledge**—notes that are attached to actions taken.

The standalone notes system is valuable for:
- Meeting notes
- Voice memos
- Ideas not tied to tasks

That's Phase 2+. For now, task notes + contact enrichment covers 80% of "second brain" use cases.

### Category vs. Tags

We chose a single `category` field over a tags system because:
- Simpler mental model
- Categories are mutually exclusive (a contact is ONE type)
- Reduces decision fatigue
- Easier filtering

If multi-categorization becomes necessary, we can add tags later.

---

## Summary

Phase 1 of Second Brain focuses on **making existing data retrievable**:

1. **Enrich contacts** so they're useful reference documents
2. **Show task history** on contacts to answer "what did we do with X?"
3. **Prompt for notes** on completion to capture outcomes
4. **Browse completed tasks** to see your action history

No new data model paradigms. No separate wiki. Just surfacing the knowledge that's already being captured through daily task flow.
