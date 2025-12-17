# Cleanup: Notes UI Improvements

## Problems

### 1. Duplicate Notes Sections
There are now TWO notes sections appearing in views like ProjectView:
- **Old notes** - A simple text field (`project.notes`) showing "No notes"
- **New entity notes** - The linked notes system (`EntityNotesSection`) showing "No notes yet" with "Add a note..."

We need to remove the old notes UI and keep only the new entity notes system.

### 2. Notes are Hard to Read/Edit
The small inline text boxes make it difficult to:
- View longer notes
- Edit content comfortably
- Format content

**Solution:** Full-sized modal for viewing/editing notes with basic rich text editing.

## Screenshot Reference

The ProjectView shows:
- Right sidebar has "NOTES" section saying "No notes" (OLD - remove this)
- Below that, "▽ NOTES" section with entity notes capture (NEW - keep this)

---

## Tasks

### Task 1: Remove Old Notes from ProjectView

**File:** `src/components/project/ProjectView.tsx` or `ProjectViewRedesign.tsx`

Find and remove:
- The "NOTES" section that displays `project.notes`
- Any references to the old `notes` field display

Keep:
- The `EntityNotesSection` component

### Task 2: Remove Old Notes from ContactView

**File:** `src/components/contact/ContactView.tsx` or `ContactViewRedesign.tsx`

Check if there's a similar duplicate. Contact has:
- `notes` field (old)
- `preferences` field (for facts/preferences)
- Entity notes (new)

Decision: Keep `notes` field for contact-level info (like "Good plumber, referred by Sarah") but make sure entity notes section is also present for task-linked notes.

### Task 3: Check TaskView

**File:** `src/components/task/TaskView.tsx`

Task has a `notes` field that IS used for task-specific notes. This should stay.

But verify there's no duplicate with entity notes section - they serve different purposes:
- `task.notes` = Notes about THIS task
- Entity notes linked to task = Additional context notes

### Task 4: Audit All Views

Check these files for duplicate notes UI:
- `src/components/project/ProjectView.tsx`
- `src/components/project/ProjectViewRedesign.tsx`
- `src/components/contact/ContactView.tsx`
- `src/components/contact/ContactViewRedesign.tsx`
- `src/components/task/TaskView.tsx`
- `src/components/task/TaskViewRedesign.tsx`

### Task 5: Create NoteModal Component

**File:** `src/components/notes/NoteModal.tsx` (new file)

Create a full-sized modal for viewing and editing notes. The current inline text boxes in `EntityNotesSection` and `NoteDetail` are too small for comfortable reading/editing.

**Requirements:**
- Full-screen modal on mobile, large centered modal on desktop (similar to `SearchModal.tsx` pattern)
- Escape key and click-outside to close
- Header with note title/timestamp and close button
- Large content area that fills available space
- Edit/Save/Cancel buttons
- Topic picker integration

**Props:**
```typescript
interface NoteModalProps {
  note: Note | null
  isOpen: boolean
  onClose: () => void
  topics: NoteTopic[]
  onUpdate: (id: string, updates: UpdateNoteInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddTopic?: (name: string) => Promise<NoteTopic | null>
}
```

**Integration points:**
- `NoteDetail` can open this modal for expanded editing
- `EntityNotesSection` can open this modal when clicking on a note
- `NotesPage` can use this for mobile view

### Task 6: Add Basic Rich Text Editor

**Dependencies to install:**
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-task-list @tiptap/extension-task-item
```

**File:** `src/components/notes/RichTextEditor.tsx` (new file)

Create a minimal RTE wrapper using Tiptap. Keep it simple - we don't need a full word processor.

**Required features:**
1. **Toggle lists (task lists)** - Checkboxes that can be checked/unchecked
2. **Basic tables** - Simple tables (add row, add column, delete)
3. **Basic formatting** - Bold, italic, bullet lists, numbered lists
4. **Headings** - H1, H2, H3

**Toolbar layout:**
```
[B] [I] | [•] [1.] [☐] | [⊞ Table] | [H1] [H2]
```

**Props:**
```typescript
interface RichTextEditorProps {
  content: string              // HTML or plain text
  onChange: (content: string) => void
  placeholder?: string
  editable?: boolean           // false = read-only mode
  className?: string
}
```

**Styling:**
- Match Nordic Journal design system
- Minimal chrome - content-focused
- Tables should have light borders
- Task items should use primary color checkbox

### Task 7: Integrate RTE into NoteModal

Update `NoteModal` to use `RichTextEditor` instead of plain textarea.

**Changes:**
- Replace `<textarea>` with `<RichTextEditor>`
- Store content as HTML in database
- Handle backwards compatibility with plain text notes (auto-convert)

### Task 8: Update Note Schema for HTML Content

**File:** `src/types/note.ts`

Add optional field to indicate content format:

```typescript
interface Note {
  // ... existing fields
  contentFormat?: 'plain' | 'html'  // default 'plain' for backwards compat
}
```

**Migration strategy:**
- Existing notes remain as `plain` text
- New notes created via RTE are saved as `html`
- Display logic checks format and renders accordingly

---

## Clarification: What Notes to Keep

| Entity | Old Field | Keep? | Entity Notes | Keep? |
|--------|-----------|-------|--------------|-------|
| **Project** | `project.notes` | ❌ Remove UI | EntityNotesSection | ✅ Keep |
| **Contact** | `contact.notes` | ✅ Keep (general info) | EntityNotesSection | ✅ Keep |
| **Task** | `task.notes` | ✅ Keep (task outcome) | EntityNotesSection | ✅ Keep |

For **Projects**: The old `notes` field is redundant - entity notes serve the same purpose better.

For **Contacts**: Keep both - `notes` is for general contact info, entity notes are for linked contextual notes.

For **Tasks**: Keep both - `task.notes` is for the task outcome/result, entity notes are for additional context.

---

## Testing

### UI Cleanup Tests
- [ ] ProjectView shows only ONE notes section (EntityNotesSection)
- [ ] ContactView shows contact.notes field AND EntityNotesSection (both needed)
- [ ] TaskView shows task.notes field AND EntityNotesSection (both needed)
- [ ] Adding a note via EntityNotesSection works on all three views
- [ ] No "No notes" empty state from old UI visible

### NoteModal Tests
- [ ] Modal opens when clicking on a note in EntityNotesSection
- [ ] Modal closes on Escape key
- [ ] Modal closes on click outside
- [ ] Edit mode works - can modify content and save
- [ ] Delete confirmation works
- [ ] Topic picker works within modal
- [ ] Mobile: Modal is full-screen
- [ ] Desktop: Modal is centered with max-width

### Rich Text Editor Tests
- [ ] Can type and format text (bold, italic)
- [ ] Toggle lists work - can check/uncheck items
- [ ] Basic tables work - can add/delete rows and columns
- [ ] Headings render correctly
- [ ] Toolbar buttons are clickable and work
- [ ] Content saves as HTML
- [ ] Plain text notes display correctly (backwards compat)
- [ ] Editor matches Nordic Journal styling

## Implementation Order

Recommended sequence:
1. **Tasks 1-4**: Remove duplicate notes UI (quick wins)
2. **Task 5**: Create NoteModal (improves UX immediately)
3. **Task 6**: Add RTE component (standalone, testable)
4. **Tasks 7-8**: Integrate RTE into modal and update schema
