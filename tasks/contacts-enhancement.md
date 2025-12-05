# Contacts Enhancement: Edit & Multi-Contact Support

## Overview
Two related enhancements to the contacts system:
1. **Small**: Allow editing existing contacts via a dedicated contact detail page
2. **Medium**: Support multiple contacts per task (many-to-many relationship)

---

## Part 1: Contact Detail/Edit Page (Small)

### Goal
Users should be able to click on a contact name (e.g., in TaskView) to navigate to a dedicated contact page where they can view and edit the contact's details.

### Requirements

1. **Create `ContactView` component** (`src/components/contact/ContactView.tsx`)
   - Similar structure to `TaskView` or `RoutineForm`
   - Header with back button and contact name
   - Editable fields: name, phone, email, notes
   - Delete contact button (with confirmation)
   - Show list of tasks/events linked to this contact (read-only, clickable)

2. **Add contact view routing in App.tsx**
   - New state: `selectedContactId`
   - New view type: `'contact-detail'`
   - Wire up `onViewChange` to handle contact navigation

3. **Make contact names clickable**
   - In `TaskView.tsx`: contact chip should be clickable → navigates to contact detail
   - In `DetailPanel.tsx`: same behavior for the contact section
   - In `InboxTaskCard.tsx`: contact chip clickable (desktop only)

4. **Props to pass through**
   ```typescript
   interface ContactViewProps {
     contact: Contact
     onBack: () => void
     onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>
     onDelete: (id: string) => Promise<void>
     // For showing linked items
     tasks: Task[]
     onSelectTask: (taskId: string) => void
   }
   ```

### Files to modify
- `src/App.tsx` - add contact view state and routing
- `src/components/contact/ContactView.tsx` - create new
- `src/components/contact/index.ts` - export ContactView
- `src/components/lazy.tsx` - add lazy ContactView
- `src/components/task/TaskView.tsx` - make contact clickable
- `src/components/detail/DetailPanel.tsx` - make contact clickable

---

## Part 2: Multiple Contacts per Task (Medium)

### Goal
A task can have multiple contacts associated with it. Example: "Fix basement leak" might involve Sarah (referral) and O'Neill Plumbing (contractor).

### Database Changes

1. **Create junction table** (new migration)
   ```sql
   -- Create task_contacts junction table
   CREATE TABLE task_contacts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
     role TEXT, -- optional: 'referral', 'provider', 'collaborator', etc.
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE(task_id, contact_id)
   );

   -- Enable RLS
   ALTER TABLE task_contacts ENABLE ROW LEVEL SECURITY;

   -- RLS policy (users can manage their own task contacts)
   CREATE POLICY "Users can manage their own task contacts"
     ON task_contacts FOR ALL
     USING (
       EXISTS (
         SELECT 1 FROM tasks 
         WHERE tasks.id = task_contacts.task_id 
         AND tasks.user_id = auth.uid()
       )
     );

   -- Index for efficient lookups
   CREATE INDEX idx_task_contacts_task_id ON task_contacts(task_id);
   CREATE INDEX idx_task_contacts_contact_id ON task_contacts(contact_id);
   ```

2. **Migrate existing data**
   ```sql
   -- Migrate existing contactId data to junction table
   INSERT INTO task_contacts (task_id, contact_id)
   SELECT id, contact_id FROM tasks WHERE contact_id IS NOT NULL;

   -- Optional: remove contactId column after verifying migration
   -- ALTER TABLE tasks DROP COLUMN contact_id;
   ```

   > Note: Keep `contactId` column for now during transition, remove in future cleanup

### Type Changes

1. **Update Task type** (`src/types/task.ts`)
   ```typescript
   interface Task {
     // ... existing fields
     contactId?: string      // DEPRECATED - keep for backwards compat
     contactIds?: string[]   // NEW - array of contact IDs
   }
   ```

2. **Create TaskContact type**
   ```typescript
   interface TaskContact {
     id: string
     taskId: string
     contactId: string
     role?: string
     createdAt: Date
   }
   ```

### Hook Changes

1. **Update `useSupabaseTasks`**
   - Fetch task_contacts when loading tasks
   - Populate `contactIds` array on each task
   - Update `updateTask` to handle contactIds changes
   - Add `addTaskContact(taskId, contactId, role?)` method
   - Add `removeTaskContact(taskId, contactId)` method

2. **Alternative: Create `useTaskContacts` hook**
   - Might be cleaner separation of concerns
   - Handles CRUD for task_contacts table
   - Returns methods: `addContact`, `removeContact`, `getContactsForTask`

### UI Changes

1. **TaskView contact section**
   - Show list of contacts (chips) instead of single contact
   - Each chip has X button to remove
   - "Add contact" button opens picker
   - Contact picker allows selecting additional contacts (filter out already-added)

2. **InboxTaskCard / TriageCard**
   - Show multiple contact chips (limit to 2-3 visible, "+N more" if overflow)
   - AssignPicker becomes multi-select or "add another" flow

3. **DetailPanel**
   - Same multi-contact display as TaskView

### Migration Strategy
1. Deploy schema migration first
2. Update hooks to read from both `contactId` and `task_contacts`
3. Update UI to support multiple contacts
4. Write migration script to move all `contactId` → `task_contacts`
5. Future: deprecate and remove `contactId` column

---

## Implementation Order

1. **Part 1 first** (contact editing) - no schema changes, lower risk
2. **Part 2 schema** - create migration, junction table
3. **Part 2 hooks** - update data fetching
4. **Part 2 UI** - update components

---

## Testing Checklist

### Part 1
- [ ] Can navigate to contact page from TaskView
- [ ] Can edit contact name, phone, email, notes
- [ ] Can delete contact (with confirmation)
- [ ] Back button returns to previous view
- [ ] Linked tasks display correctly
- [ ] Can click linked task to navigate to it

### Part 2
- [ ] Can add multiple contacts to a task
- [ ] Can remove individual contacts from a task
- [ ] Existing single-contact tasks still work
- [ ] Contact deletion cascades correctly (removes from task_contacts)
- [ ] Task deletion cascades correctly (removes from task_contacts)
- [ ] UI displays multiple contacts cleanly
- [ ] Contact picker filters out already-added contacts

---

## Notes
- Keep the `AssignPicker` component for quick single-contact assignment in triage flows
- The multi-contact UI is primarily for the detail views (TaskView, DetailPanel)
- Consider adding a "role" field later (referral, provider, etc.) but not required for v1
