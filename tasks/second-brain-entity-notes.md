# Second Brain: Entity Notes

## Overview

Enable the existing notes system and connect it to Symphony's entities (tasks, projects, contacts, events). This unlocks the "second brain" use case where information captured anywhere is findable everywhere.

**The problem this solves:**

> "Tony the painter texted me an electrician's number. I also texted another electrician I already knew. The 'Find an electrician' task has some notes, but how do I keep track of all of this?!"

> "I need the hotel info for my Quebec vacation. Where did I put that?"

**The solution:**

Notes can be linked to any entity. When you view a task, project, or contact, you see all related notes. When you search, notes surface alongside tasks and contacts.

---

## Current State (Already Built)

| Component | Status | Location |
|-----------|--------|----------|
| Database schema | ✅ Complete | `supabase/migrations/022_notes.sql` |
| Note types | ✅ Complete | `src/types/note.ts` |
| useNotes hook | ✅ Complete | `src/hooks/useNotes.ts` |
| NotesPage | ✅ Complete | `src/components/notes/NotesPage.tsx` |
| NotesQuickCapture | ✅ Complete | `src/components/notes/NotesQuickCapture.tsx` |
| NotesList | ✅ Complete | `src/components/notes/NotesList.tsx` |
| NoteDetail | ✅ Complete | `src/components/notes/NoteDetail.tsx` |
| TopicFilter | ✅ Complete | `src/components/notes/TopicFilter.tsx` |
| Feature flag | ❌ Off | `FEATURES.notes = false` |

**What the hook already supports:**
- `addNote(input)` - Create note
- `updateNote(id, updates)` - Update note
- `deleteNote(id)` - Delete note
- `addEntityLink(noteId, { entityType, entityId })` - Link note to entity
- `removeEntityLink(linkId)` - Remove link
- `getNotesForEntity(entityType, entityId)` - Get all notes for an entity
- `searchNotes(query)` - Search notes

---

## What This Spec Adds

| Feature | Priority | Effort |
|---------|----------|--------|
| Enable notes feature flag | High | Tiny |
| Entity linking UI in NoteDetail | High | Small |
| Notes section in TaskView | High | Medium |
| Notes section in ProjectView | High | Medium |
| Notes section in ContactView | Medium | Medium |
| Quick note from entity context | Medium | Small |
| Include notes in global search | High | Small |

---

## Implementation Tasks

### Task 1: Enable Feature Flag

**File:** `src/lib/features.ts` (or wherever FEATURES is defined)

```typescript
export const FEATURES = {
  // ...
  notes: true,  // Change from false to true
}
```

This immediately makes Notes appear in the sidebar and enables the full NotesPage.

---

### Task 2: Add Entity Linking UI to NoteDetail

**File:** `src/components/notes/NoteDetail.tsx`

Currently shows note content and topics. Add ability to link/unlink entities.

**Add section:**
```
LINKED TO
┌─────────────────────────────────────────────────┐
│ 📋 Find an electrician                    [×]   │  ← task
│ 📁 Home Renovation                        [×]   │  ← project
│ 👤 Tony the Painter                       [×]   │  ← contact
│                                                 │
│ [+ Link to task/project/contact...]             │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Show existing entity links with type icon and name
- Click [×] to remove link
- Click [+ Link...] to open entity picker (search tasks, projects, contacts)
- Entity picker similar to existing contact/project pickers in TaskView

**Props to add:**
```typescript
interface NoteDetailProps {
  // existing props...
  tasks?: Task[]
  projects?: Project[]
  contacts?: Contact[]
  onAddEntityLink?: (noteId: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onRemoveEntityLink?: (linkId: string) => Promise<void>
}
```

---

### Task 3: Add Notes Section to TaskView

**File:** `src/components/task/TaskView.tsx`

Add a "NOTES" section that shows all notes linked to this task.

**Wireframe:**
```
┌─────────────────────────────────────────────────┐
│  ... existing task fields ...                   │
├─────────────────────────────────────────────────┤
│  NOTES (2)                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Tony referred Mike's Electric, 555-1234 │   │
│  │ Dec 17, 2024                            │   │
│  ├─────────────────────────────────────────┤   │
│  │ Texted Joe, waiting to hear back        │   │
│  │ Dec 16, 2024                            │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [+ Add note]                                   │
└─────────────────────────────────────────────────┘
```

**Implementation:**
1. Call `getNotesForEntity('task', task.id)` on mount/task change
2. Display notes in a collapsible section
3. Click note → expand inline or navigate to NoteDetail
4. [+ Add note] → inline quick capture that auto-links to this task

**Props to add:**
```typescript
interface TaskViewProps {
  // existing props...
  notes?: Note[]
  onAddNote?: (content: string, entityType: NoteEntityType, entityId: string) => Promise<Note | null>
}
```

---

### Task 4: Add Notes Section to ProjectView

**File:** `src/components/project/ProjectView.tsx`

Same pattern as TaskView. Projects are especially useful for notes because they group related information (like the Quebec vacation example).

**Wireframe:**
```
┌─────────────────────────────────────────────────┐
│  Quebec Vacation                                │
│  ... existing project fields ...                │
├─────────────────────────────────────────────────┤
│  NOTES (3)                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Hotel: Fairmont Le Château, conf #12345 │   │
│  │ Check-in 3pm, checkout 11am             │   │
│  │ Dec 10, 2024                            │   │
│  ├─────────────────────────────────────────┤   │
│  │ Flight: AC 456, Dec 20, 8:30am          │   │
│  │ Dec 8, 2024                             │   │
│  ├─────────────────────────────────────────┤   │
│  │ Restaurant reservation: Chez Marie      │   │
│  │ Dec 21, 7pm, conf #789                  │   │
│  │ Dec 5, 2024                             │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [+ Add note]                                   │
└─────────────────────────────────────────────────┘
```

---

### Task 5: Add Notes Section to ContactView

**File:** `src/components/contact/ContactView.tsx`

Notes about a person that aren't tied to a specific task.

**Wireframe:**
```
┌─────────────────────────────────────────────────┐
│  👤 Tony the Painter                            │
│  ... existing contact fields ...                │
├─────────────────────────────────────────────────┤
│  NOTES (1)                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Referred Mike's Electric for our job    │   │
│  │ Said they're fast and reasonable        │   │
│  │ Dec 17, 2024                            │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [+ Add note]                                   │
├─────────────────────────────────────────────────┤
│  HISTORY (5 tasks)                              │
│  ... existing task history ...                  │
└─────────────────────────────────────────────────┘
```

---

### Task 6: Quick Note from Entity Context

**File:** `src/components/notes/EntityNoteCapture.tsx` (new)

Lightweight inline note capture that appears in TaskView/ProjectView/ContactView.

```typescript
interface EntityNoteCaptureProps {
  entityType: NoteEntityType
  entityId: string
  onSave: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  placeholder?: string
}
```

**Behavior:**
- Shows as [+ Add note] button
- Click → expands to textarea
- Enter to save (creates note + auto-links to entity)
- Escape to cancel
- Collapses after save

**Wireframe expanded:**
```
┌─────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────┐   │
│  │ Type your note...                       │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                              [Cancel] [Save]    │
└─────────────────────────────────────────────────┘
```

---

### Task 7: Include Notes in Global Search

**File:** `src/hooks/useSearch.ts`

Add notes to the existing Fuse.js search.

```typescript
// Add to search configuration
const notesFuse = new Fuse(notes, {
  keys: [
    { name: 'content', weight: 2 },
    { name: 'title', weight: 1.5 },
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true,
})

// Add to SearchResult type
type SearchResultType = 'task' | 'project' | 'contact' | 'routine' | 'list' | 'note'

// Add notes to grouped results
interface GroupedSearchResults {
  // ...existing
  notes: SearchResult[]
}
```

**File:** `src/components/search/SearchModal.tsx`

Add notes section to search results display.

---

## Files Summary

### Create
```
src/components/notes/EntityNoteCapture.tsx    # Inline note capture for entities
src/components/notes/EntityNotesSection.tsx   # Reusable notes section for views
src/components/notes/EntityLinkPicker.tsx     # Picker for linking notes to entities
```

### Modify
```
src/lib/features.ts                           # Enable notes flag
src/components/notes/NoteDetail.tsx           # Add entity linking UI
src/components/task/TaskView.tsx              # Add notes section
src/components/project/ProjectView.tsx        # Add notes section
src/components/contact/ContactView.tsx        # Add notes section
src/hooks/useSearch.ts                        # Include notes in search
src/components/search/SearchModal.tsx         # Display note results
src/App.tsx                                   # Wire up notes to entity views
```

---

## Wiring in App.tsx

The NotesPage is already wired but uses `useNotes` internally. For entity views, we need to pass notes-related props down.

**Option A: Fetch notes per entity view**
Each view (TaskView, ProjectView, ContactView) calls `getNotesForEntity()` internally.

**Option B: Pass notes from App.tsx**
App.tsx uses `useNotes()` and passes relevant methods to views.

**Recommendation:** Option A is simpler. Each view manages its own notes fetching via the `getNotesForEntity` function from useNotes.

```typescript
// In TaskView
const { getNotesForEntity, addNote, addEntityLink } = useNotes()
const [taskNotes, setTaskNotes] = useState<Note[]>([])

useEffect(() => {
  getNotesForEntity('task', task.id).then(setTaskNotes)
}, [task.id, getNotesForEntity])

const handleAddNote = async (content: string) => {
  const note = await addNote({ content })
  if (note) {
    await addEntityLink(note.id, { entityType: 'task', entityId: task.id })
    setTaskNotes(prev => [note, ...prev])
  }
}
```

---

## User Flow: The Electrician Example

1. User has task "Find an electrician"
2. Tony texts an electrician referral
3. User opens the task in Symphony
4. Clicks [+ Add note] in the Notes section
5. Types "Tony referred Mike's Electric, 555-1234"
6. Saves → note is created and linked to the task
7. Later, user texts another electrician (Joe)
8. Opens task again, adds another note: "Texted Joe, waiting to hear back"
9. All notes visible on the task
10. Search "electrician" → finds the task AND the notes
11. Task completion → notes remain as historical record

---

## User Flow: The Quebec Hotel Example

1. User has project "Quebec Vacation"
2. Books hotel, receives confirmation
3. Opens project in Symphony
4. Clicks [+ Add note]
5. Types "Hotel: Fairmont Le Château, conf #12345, check-in 3pm"
6. Saves → note linked to project
7. Later, needs hotel info
8. Opens project → sees all notes including hotel details
9. OR searches "quebec hotel" → note surfaces in results

---

## Testing Checklist

### Feature Flag
- [ ] Setting `FEATURES.notes = true` makes Notes appear in sidebar
- [ ] NotesPage loads and displays notes

### Entity Linking in NoteDetail
- [ ] Can see existing entity links on a note
- [ ] Can add link to task/project/contact
- [ ] Can remove entity link
- [ ] Entity picker searches and filters correctly

### Notes on TaskView
- [ ] Notes section appears on task
- [ ] Shows all notes linked to this task
- [ ] Can add new note via inline capture
- [ ] New note is auto-linked to task
- [ ] Clicking note expands or navigates

### Notes on ProjectView
- [ ] Notes section appears on project
- [ ] Shows all notes linked to this project
- [ ] Can add new note via inline capture

### Notes on ContactView
- [ ] Notes section appears on contact
- [ ] Shows all notes linked to this contact
- [ ] Can add new note via inline capture

### Global Search
- [ ] Notes appear in search results
- [ ] Note content is searchable
- [ ] Clicking note result navigates appropriately

---

## Future Enhancements (Not in This Spec)

- **Note types in capture** - Choose quick_capture vs meeting_note when creating
- **Voice notes** - Record audio, transcribe, link to entity
- **Note templates** - Pre-filled templates for common note types
- **Bi-directional linking** - Note mentions @task or #project, auto-links
- **Calendar event notes** - Notes linked to Google Calendar events
