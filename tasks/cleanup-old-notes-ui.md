# Cleanup: Remove Old Notes UI

## Problem

There are now TWO notes sections appearing in views like ProjectView:

1. **Old notes** - A simple text field (`project.notes`) showing "No notes"
2. **New entity notes** - The linked notes system (`EntityNotesSection`) showing "No notes yet" with "Add a note..."

We need to remove the old notes UI and keep only the new entity notes system.

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

- [ ] ProjectView shows only ONE notes section (EntityNotesSection)
- [ ] ContactView shows contact.notes field AND EntityNotesSection (both needed)
- [ ] TaskView shows task.notes field AND EntityNotesSection (both needed)
- [ ] Adding a note via EntityNotesSection works on all three views
- [ ] No "No notes" empty state from old UI visible
