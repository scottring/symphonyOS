# Second Brain Phase 1: Implementation Spec

## Overview

Transform Symphony OS into a "second brain" by surfacing emergent knowledge from lived experience. The core insight: tasks aren't just to-dos—they're records of decisions, relationships, and outcomes. This phase enriches contacts and makes completed task history browsable.

**Goal:** Answer questions like "Who was that plumber we used?" by searching "plumber" and finding:
- The contact (Joe's Plumbing, category: service_provider)
- The task context ("Fix kitchen leak", completed Dec 2024)
- Any notes ("$150, same-day service, great work")

---

## Current State (Verified)

| Feature | Status | Notes |
|---------|--------|-------|
| Task `notes` field | ✅ Exists | `src/types/task.ts` |
| Contact `notes` field | ✅ Exists | `src/types/contact.ts` |
| ContactView component | ✅ Exists | `src/components/contact/ContactView.tsx` |
| Contact routing | ✅ Exists | `selectedContactId` state, `contact-detail` view type |
| Task history on ContactView | ✅ Exists | Filters tasks by `contactId` |
| Universal search | ✅ Exists | `src/hooks/useSearch.ts` with Fuse.js |
| Search includes notes | ✅ Exists | Tasks, contacts, projects all searchable by notes |

**Contact type currently has only:** `id`, `name`, `phone`, `email`, `notes`, `createdAt`, `updatedAt`

---

## What This Spec Adds

| Feature | Priority | Effort |
|---------|----------|--------|
| Contact `category` field | High | Small |
| Contact `birthday` field | Medium | Small |
| Contact `relationship` field | Medium | Small |
| Contact `preferences` field | High | Small |
| CategoryPicker component | High | Small |
| Update ContactView for new fields | High | Medium |
| Update search to include new fields | High | Small |
| CompletedTasksView (History browser) | Medium | Medium |
| History nav item in Sidebar | Medium | Small |

---

## Implementation Tasks

### Task 1: Database Migration

**File:** `supabase/migrations/XXX_add_contact_enrichment.sql`

```sql
-- Add category field with enum constraint
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

### Task 2: Update Contact Type

**File:** `src/types/contact.ts`

```typescript
export type ContactCategory =
  | 'family'
  | 'friend'
  | 'service_provider'
  | 'professional'
  | 'school'
  | 'medical'
  | 'other'

export interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string

  // NEW fields
  category?: ContactCategory
  birthday?: string        // ISO date string (YYYY-MM-DD)
  relationship?: string    // "son", "spouse", "mother", etc.
  preferences?: string     // Freeform facts: "shoe size 5, allergic to peanuts"

  createdAt: Date
  updatedAt: Date
}

// For DB operations
export interface DbContact {
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  category: string | null
  birthday: string | null
  relationship: string | null
  preferences: string | null
  created_at: string
  updated_at: string
}
```

---

### Task 3: Update useContacts Hook

**File:** `src/hooks/useContacts.ts`

Add new fields to:
1. `toContact()` mapper function - map `category`, `birthday`, `relationship`, `preferences`
2. `addContact()` - accept new fields in input
3. `updateContact()` - handle new fields in updates

```typescript
// Update toContact mapper
function toContact(db: DbContact): Contact {
  return {
    id: db.id,
    name: db.name,
    phone: db.phone ?? undefined,
    email: db.email ?? undefined,
    notes: db.notes ?? undefined,
    category: db.category as ContactCategory | undefined,
    birthday: db.birthday ?? undefined,
    relationship: db.relationship ?? undefined,
    preferences: db.preferences ?? undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}
```

---

### Task 4: Update Search Hook

**File:** `src/hooks/useSearch.ts`

Add `category` and `preferences` to contact search keys:

```typescript
// Find the contactFuse configuration and add:
const contactFuse = new Fuse(contacts, {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'email', weight: 1.5 },
    { name: 'phone', weight: 1.5 },
    { name: 'notes', weight: 1 },
    { name: 'category', weight: 1 },      // NEW
    { name: 'preferences', weight: 1 },   // NEW
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true,
})
```

---

### Task 5: Create CategoryPicker Component

**File:** `src/components/contact/CategoryPicker.tsx`

Simple dropdown for selecting contact category.

```typescript
interface CategoryPickerProps {
  value?: ContactCategory
  onChange: (category: ContactCategory | undefined) => void
  className?: string
}
```

**Categories with icons:**
| Category | Icon | Color |
|----------|------|-------|
| family | Users | blue |
| friend | Heart | pink |
| service_provider | Wrench | amber |
| professional | Briefcase | slate |
| school | GraduationCap | green |
| medical | Stethoscope | red |
| other | User | gray |

Use Lucide React icons. Render as a `<select>` or custom dropdown matching existing UI patterns.

---

### Task 6: Update ContactView Component

**File:** `src/components/contact/ContactView.tsx`

The component already exists with:
- Name editing (click to edit)
- Phone, email, notes fields with debounced updates
- Task history section
- Delete with confirmation

**Add:**

1. **Category picker** below the name
   - Show category badge next to name when set
   - CategoryPicker dropdown to change

2. **Family fields section** (only when `category === 'family'`)
   ```
   DETAILS
   ┌─────────────────────────────────────┐
   │ 🎂 Birthday      [date picker]      │
   │ 👥 Relationship  [text input]       │
   └─────────────────────────────────────┘
   ```

3. **Preferences field** (for all categories)
   - Rename/add section: "PREFERENCES & FACTS" for family, "NOTES" for others
   - Or keep both `notes` and `preferences` as separate fields
   - Textarea with debounced save

4. **Enhanced task history display**
   - Already shows linked tasks
   - Add: show task.notes snippet under each task title
   - Add: show completion date for completed tasks

**Wireframe for service provider:**
```
┌─────────────────────────────────────────────────┐
│  ← Back                              [Delete]   │
├─────────────────────────────────────────────────┤
│  👤 Joe's Plumbing                              │
│     [Service Provider ▾]                        │  ← CategoryPicker
├─────────────────────────────────────────────────┤
│  CONTACT INFO                                   │
│  📞 555-123-4567                    [Copy]      │
│  📧 joe@joesplumbing.com            [Copy]      │
├─────────────────────────────────────────────────┤
│  NOTES                                          │
│  ┌─────────────────────────────────────────┐   │
│  │ Fast, reasonable prices. Referred by    │   │
│  │ Sarah. Licensed and insured.            │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  HISTORY (3)                                    │
│  ✓ Fix kitchen leak              Dec 15, 2024  │
│    "$150, fixed in 30 minutes"                  │
│  ✓ Check water heater            Oct 3, 2024   │
│    "Annual inspection, all good"                │
│  ✓ Install new faucet            Aug 20, 2024  │
└─────────────────────────────────────────────────┘
```

**Wireframe for family member:**
```
┌─────────────────────────────────────────────────┐
│  ← Back                              [Delete]   │
├─────────────────────────────────────────────────┤
│  👤 Max                                         │
│     [Family ▾] · Son                            │
├─────────────────────────────────────────────────┤
│  DETAILS                                        │
│  🎂 Birthday      March 15                      │
│  👥 Relationship  Son                           │
├─────────────────────────────────────────────────┤
│  PREFERENCES & FACTS                            │
│  ┌─────────────────────────────────────────┐   │
│  │ Shoe size: 5                            │   │
│  │ Loves dinosaurs, especially T-Rex       │   │
│  │ Allergic to peanuts                     │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  HISTORY (12)                                   │
│  ✓ Buy Max new sneakers          Dec 10, 2024  │
│    "Size 5, Nike, $45 at Target"                │
│  ○ Sign up for summer camp           Pending   │
└─────────────────────────────────────────────────┘
```

---

### Task 7: Create CompletedTasksView Component

**File:** `src/components/history/CompletedTasksView.tsx`

Browse completed tasks grouped by month.

```typescript
interface CompletedTasksViewProps {
  tasks: Task[]
  contacts: Contact[]
  onBack: () => void
  onSelectTask: (taskId: string) => void
}
```

**Features:**
1. Filter tasks to `completed === true`
2. Sort by completion date (most recent first)
3. Group by month (December 2024, November 2024, etc.)
4. Each task shows:
   - Checkbox (checked, grayed out)
   - Title
   - Completion date
   - Contact name (if contactId set)
   - Notes snippet (first ~50 chars)
5. Click task → call `onSelectTask`
6. Local search input (filter by title/notes using Fuse.js)
7. "Load more" pagination (show 20 at a time)

**Wireframe:**
```
┌─────────────────────────────────────────────────┐
│  ← Back                History                  │
├─────────────────────────────────────────────────┤
│  🔍 Search completed tasks...                   │
├─────────────────────────────────────────────────┤
│  DECEMBER 2024                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ ✓ Fix kitchen leak              Dec 15  │   │
│  │   Joe's Plumbing · "$150, same-day"     │   │
│  ├─────────────────────────────────────────┤   │
│  │ ✓ Buy Max new sneakers          Dec 10  │   │
│  │   "Size 5, Nike, $45"                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  NOVEMBER 2024                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ ✓ Schedule Max dentist           Nov 5  │   │
│  │   Dr. Chen · "No cavities"              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│            [Load more...]                       │
└─────────────────────────────────────────────────┘
```

---

### Task 8: Add History to Sidebar

**File:** `src/components/layout/Sidebar.tsx`

Add "History" nav item:

```typescript
// Add to nav items array, after Routines
{
  icon: Clock,  // from lucide-react
  label: 'History',
  view: 'history' as ViewType,
}
```

**File:** `src/components/layout/Sidebar.tsx` (ViewType)

Add `'history'` to ViewType union if not already present.

---

### Task 9: Wire Up History View in App.tsx

**File:** `src/App.tsx`

1. Add `'history'` to ViewType if needed
2. Add rendering case for history view:

```typescript
{activeView === 'history' && (
  <Suspense fallback={<LoadingFallback />}>
    <CompletedTasksView
      tasks={tasks}
      contacts={contacts}
      onBack={() => setActiveView('home')}
      onSelectTask={(taskId) => {
        setSelectedTaskId(taskId)
        setActiveView('task-detail')
      }}
    />
  </Suspense>
)}
```

3. Add lazy import for CompletedTasksView

---

## Files Summary

### Create
```
supabase/migrations/XXX_add_contact_enrichment.sql
src/components/contact/CategoryPicker.tsx
src/components/history/CompletedTasksView.tsx
src/components/history/index.ts
```

### Modify
```
src/types/contact.ts                    # Add ContactCategory, new fields
src/hooks/useContacts.ts                # Handle new fields in mapper/CRUD
src/hooks/useSearch.ts                  # Add category, preferences to search
src/components/contact/ContactView.tsx  # Add category picker, family fields, preferences
src/components/layout/Sidebar.tsx       # Add History nav item
src/App.tsx                             # Wire up history view
src/components/lazy.tsx                 # Add lazy CompletedTasksView (if using lazy loading)
```

---

## Testing Checklist

### Contact Enrichment
- [ ] Migration runs without error
- [ ] Can set category on contact via ContactView
- [ ] Category persists after refresh
- [ ] Family fields (birthday, relationship) only show when category = 'family'
- [ ] Preferences field saves and displays
- [ ] Search finds contacts by category (e.g., search "service" finds service_provider contacts)
- [ ] Search finds contacts by preferences content

### ContactView Updates
- [ ] CategoryPicker dropdown works
- [ ] Category badge displays next to name
- [ ] Birthday date picker works (for family)
- [ ] Relationship text input works (for family)
- [ ] Task history shows notes snippet for each task
- [ ] Task history shows completion date

### History View
- [ ] History nav item appears in sidebar
- [ ] Clicking History shows CompletedTasksView
- [ ] Completed tasks are grouped by month
- [ ] Tasks show title, date, contact, notes snippet
- [ ] Local search filters tasks
- [ ] Clicking task navigates to task-detail view
- [ ] Load more pagination works
- [ ] Back button returns to home

---

## Future Phases (Not in This Spec)

**Phase 1.1: Completion Notes Prompt**
- Toast prompt when completing task without notes
- "Add a note about what happened?" with text input
- Auto-dismiss after 5 seconds

**Phase 2: Knowledge Connections**
- "Related tasks" section on TaskView (same contact)
- Contact recommendations based on task history

**Phase 3: Proactive Surfacing**
- "Max's birthday is in 2 weeks" notification
- "It's been 6 months since you contacted Dr. Smith"
