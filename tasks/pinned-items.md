# Pinned Items Feature

## Overview
Add a "Pinned" section to the sidebar for quick access to frequently-used items. Supports pinning Projects, Tasks, Contacts, Routines, and Lists.

**Prerequisites:** Complete Attachments feature first (023_attachments.sql)

---

## Database

Create migration `supabase/migrations/024_pinned_items.sql`:

```sql
CREATE TABLE pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL 
    CHECK (entity_type IN ('task', 'project', 'contact', 'routine', 'list')),
  entity_id TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  pinned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(user_id, entity_type, entity_id)
);

-- Indexes
CREATE INDEX pinned_items_user_id_idx ON pinned_items(user_id);
CREATE INDEX pinned_items_entity_idx ON pinned_items(entity_type, entity_id);

-- RLS
ALTER TABLE pinned_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pins"
  ON pinned_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pins"
  ON pinned_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pins"
  ON pinned_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pins"
  ON pinned_items FOR DELETE
  USING (auth.uid() = user_id);
```

---

## Types

Create `src/types/pin.ts`:

```typescript
export type PinnableEntityType = 'task' | 'project' | 'contact' | 'routine' | 'list'

export interface PinnedItem {
  id: string
  entityType: PinnableEntityType
  entityId: string
  displayOrder: number
  pinnedAt: Date
  lastAccessedAt: Date
  isStale: boolean  // computed: lastAccessedAt > 14 days ago
}

export interface DbPinnedItem {
  id: string
  user_id: string
  entity_type: PinnableEntityType
  entity_id: string
  display_order: number
  pinned_at: string
  last_accessed_at: string
}

export const MAX_PINS = 7
export const STALE_THRESHOLD_DAYS = 14
export const AUTO_UNPIN_THRESHOLD_DAYS = 21
```

---

## Hook

Create `src/hooks/usePinnedItems.ts`:

```typescript
interface UsePinnedItems {
  pins: PinnedItem[]
  isLoading: boolean
  error: string | null
  
  // Actions
  pin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  unpin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  unpinById: (id: string) => Promise<boolean>
  reorder: (orderedIds: string[]) => Promise<void>
  markAccessed: (entityType: PinnableEntityType, entityId: string) => Promise<void>
  refreshStale: (id: string) => Promise<void>  // resets lastAccessedAt
  
  // Queries
  isPinned: (entityType: PinnableEntityType, entityId: string) => boolean
  canPin: () => boolean  // false if at MAX_PINS
}
```

**Implementation notes:**
- Use optimistic updates (see useEventNotes.ts pattern)
- Compute `isStale` client-side from `lastAccessedAt`
- On load, auto-unpin items past AUTO_UNPIN_THRESHOLD_DAYS (with console log)
- Sort by `displayOrder` ascending

---

## Business Rules

| Rule | Implementation |
|------|----------------|
| Max 7 pins | Reject `pin()` if `pins.length >= MAX_PINS`, return false |
| Stale after 14 days | `isStale = daysSince(lastAccessedAt) >= STALE_THRESHOLD_DAYS` |
| Auto-unpin after 21 days stale | On hook init, unpin items where `daysSince(lastAccessedAt) >= AUTO_UNPIN_THRESHOLD_DAYS` |
| Auto-unpin on complete | When task/project marked complete, call `unpin()` |
| Clicking pin updates access | Call `markAccessed()` when user navigates via pin |

---

## Components

Create `src/components/pins/`:

### PinnedSection.tsx
- Sidebar section positioned between Search and Home nav
- Collapsible header "📌 Pinned" with chevron
- Persist collapse state to localStorage (`symphony-pins-collapsed`)
- Maps over pins, renders PinnedItem for each
- Empty state: don't render section at all (no "No pins" message)

### PinnedItem.tsx
Props: `pin: PinnedItem`, `entity: Task | Project | Contact | Routine | List`, `onClick: () => void`

- Shows icon based on entityType (folder for project, check for task, etc.)
- Shows entity name (need to resolve from entityId)
- If `isStale`: dim text (text-neutral-400), show refresh icon
- Click → calls onClick (parent handles navigation + markAccessed)
- Refresh icon click → calls `refreshStale(pin.id)`, stops propagation

### PinButton.tsx
Props: `entityType: PinnableEntityType`, `entityId: string`, `size?: 'sm' | 'md'`

- Reusable toggle button for detail panels
- Uses `usePinnedItems` hook
- Filled pin icon if pinned, outline if not
- On click when not pinned:
  - If `canPin()` → call `pin()`
  - Else → show toast "Unpin something first (max 7)"
- On click when pinned → call `unpin()`

### index.ts
Barrel export all components

---

## UI Placement

### Sidebar location:
```
┌─────────────────────┐
│ 🎵 Symphony         │
├─────────────────────┤
│ 🔍 Search...        │
├─────────────────────┤
│ 📌 Pinned        ▾  │  ← NEW: Collapsible section
│   📁 Kitchen Reno   │
│   ✓ Call insurance  │
│   👤 Contractor Mike│
├─────────────────────┤
│ 🏠 Home             │
│ 📁 Projects         │
│ 🔄 Routines         │
│ 📋 Lists            │
└─────────────────────┘
```

### Stale item appearance:
```
│   📁 Tax Prep      ⟳│  ← dimmed text, refresh icon on right
```
Tooltip on refresh icon: "Still need this? Click to keep pinned"

---

## Integration Points

1. **Sidebar.tsx**
   - Import and render `<PinnedSection />` between search and nav
   - Pass navigation handler to open entity detail

2. **DetailPanelRedesign.tsx**
   - Add `<PinButton entityType="task" entityId={task.id} />` in header for tasks
   - Add for events (entityType="task" since events use event_notes)

3. **ProjectCard.tsx** or project detail
   - Add `<PinButton entityType="project" entityId={project.id} />`

4. **ContactCard.tsx**
   - Add `<PinButton entityType="contact" entityId={contact.id} />`

5. **Routine detail** (wherever that lives)
   - Add `<PinButton entityType="routine" entityId={routine.id} />`

6. **List detail**
   - Add `<PinButton entityType="list" entityId={list.id} />`

7. **useSupabaseTasks.ts** — In `toggleComplete`, if task becomes completed:
   ```typescript
   // After marking complete
   unpinIfPinned('task', taskId)
   ```

8. **useProjects.ts** — In `updateProject` when status becomes 'completed':
   ```typescript
   // After marking complete
   unpinIfPinned('project', projectId)
   ```

---

## Entity Resolution

PinnedSection needs to display entity names. Options:

**Option A: Fetch on mount**
- PinnedSection fetches all pinned entities on mount
- Store in local state: `Map<string, Task | Project | ...>`
- Con: extra queries

**Option B: Denormalize name into pinned_items**
- Add `entity_name TEXT` column
- Update on pin, potentially stale if entity renamed
- Con: data duplication

**Option C: Use existing hooks**
- Pass tasks/projects/contacts/routines/lists from App.tsx context
- Resolve in PinnedSection
- Pro: no extra fetches, always fresh
- Con: requires data to be loaded

**Recommendation:** Option C — leverage existing data that's already loaded in App

---

## Tests

### usePinnedItems.test.ts
- Fetches pins on mount
- `pin()` adds item, respects MAX_PINS limit
- `unpin()` removes item
- `isPinned()` returns correct boolean
- `canPin()` returns false at limit
- `markAccessed()` updates lastAccessedAt
- `refreshStale()` resets lastAccessedAt
- Auto-unpins items past 21 days on init
- `isStale` computed correctly

### PinnedSection.test.tsx
- Renders pinned items
- Doesn't render when no pins
- Collapse toggle works
- Click navigates to entity
- Stale items show refresh icon

### PinButton.test.tsx
- Shows filled icon when pinned
- Shows outline icon when not pinned
- Toggles on click
- Shows toast at max limit

---

## Checklist

- [ ] Migration `024_pinned_items.sql`
- [ ] Types `src/types/pin.ts`
- [ ] Hook `src/hooks/usePinnedItems.ts`
- [ ] Component `src/components/pins/PinnedSection.tsx`
- [ ] Component `src/components/pins/PinnedItem.tsx`
- [ ] Component `src/components/pins/PinButton.tsx`
- [ ] Component `src/components/pins/index.ts`
- [ ] Integrate into Sidebar.tsx
- [ ] Add PinButton to DetailPanelRedesign (tasks)
- [ ] Add PinButton to ProjectCard
- [ ] Add PinButton to ContactCard
- [ ] Add PinButton to routine detail
- [ ] Add PinButton to list detail
- [ ] Auto-unpin on task complete
- [ ] Auto-unpin on project complete
- [ ] Tests for hook
- [ ] Tests for components
- [ ] TypeScript clean
- [ ] All tests pass
