# Remaining Work: Attachments & Pinned Items

## Priority Order

1. Pinned Items migration (blocking)
2. Auto-unpin on complete
3. PinButton on remaining entities
4. Tests for both features

---

## 1. Create Migration: 024_pinned_items.sql

Create `supabase/migrations/024_pinned_items.sql`:

```sql
-- Pinned items for quick sidebar access

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

## 2. Auto-Unpin on Complete

When a task or project is marked complete, automatically unpin it.

### In useSupabaseTasks.ts (or wherever task completion is handled):

Find the `toggleComplete` or equivalent function. After marking a task complete:

```typescript
// After successful completion update
if (newCompletedState === true) {
  // Auto-unpin if pinned (import unpin from usePinnedItems or call via passed function)
  // Option A: Export a standalone unpin function
  // Option B: Emit an event/callback that App.tsx handles
}
```

**Recommended approach:** Add an optional `onTaskComplete` callback prop that App.tsx can use to trigger unpin:

```typescript
// In App.tsx where tasks are managed
const handleTaskComplete = (taskId: string) => {
  pinnedItems.unpin('task', taskId) // silent if not pinned
}
```

### In useProjects.ts:

Similar pattern for when project status changes to 'completed':

```typescript
// After updating project to completed status
if (updates.status === 'completed') {
  onProjectComplete?.(projectId)
}
```

---

## 3. Add PinButton to Remaining Entities

### Projects
Find ProjectCard.tsx or project detail view. Add in header area:
```tsx
import { PinButton } from '@/components/pins'

<PinButton entityType="project" entityId={project.id} />
```

### Contacts
Find ContactCard.tsx or contact detail view. Add:
```tsx
<PinButton entityType="contact" entityId={contact.id} />
```

### Routines
Find routine detail view. Add:
```tsx
<PinButton entityType="routine" entityId={routine.id} />
```

### Lists (Reference Lists)
Find list detail view. Add:
```tsx
<PinButton entityType="list" entityId={list.id} />
```

**Note:** If any of these entities don't have detail views yet, just add PinButton where the entity is displayed with enough space (card header, list item trailing icon, etc.)

---

## 4. Tests

### Tests for useAttachments

Create `src/hooks/__tests__/useAttachments.test.ts`:

```typescript
describe('useAttachments', () => {
  it('fetches attachments for an entity')
  it('uploads a file and creates attachment record')
  it('validates file type before upload')
  it('validates file size before upload')
  it('deletes attachment and removes from storage')
  it('generates signed URL for file access')
  it('handles upload errors gracefully')
  it('uses optimistic updates for upload')
  it('uses optimistic updates for delete')
  it('rejects files exceeding MAX_FILE_SIZE')
  it('rejects files with disallowed MIME types')
})
```

### Tests for Attachment Components

Create `src/components/attachments/__tests__/FileUpload.test.tsx`:

```typescript
describe('FileUpload', () => {
  it('renders upload zone')
  it('accepts valid file types')
  it('rejects invalid file types')
  it('shows loading state during upload')
  it('calls onUpload with file when dropped')
  it('calls onUpload with file when clicked and selected')
  it('shows error message on validation failure')
  it('renders compact mode correctly')
})
```

Create `src/components/attachments/__tests__/AttachmentList.test.tsx`:

```typescript
describe('AttachmentList', () => {
  it('renders list of attachments')
  it('shows correct icon for each file type')
  it('displays file name and formatted size')
  it('calls onDelete when delete button clicked')
  it('calls onOpen when attachment clicked')
  it('shows loading state during delete')
  it('renders empty state when no attachments')
})
```

### Tests for usePinnedItems

Create `src/hooks/__tests__/usePinnedItems.test.ts`:

```typescript
describe('usePinnedItems', () => {
  it('fetches pinned items on mount')
  it('pins an item')
  it('unpins an item')
  it('enforces MAX_PINS limit')
  it('returns canPin=false when at limit')
  it('isPinned returns correct boolean')
  it('markAccessed updates lastAccessedAt')
  it('refreshStale resets lastAccessedAt')
  it('computes isStale correctly after 14 days')
  it('auto-unpins items older than 21 days on load')
  it('reorder updates display_order')
})
```

### Tests for Pin Components

Create `src/components/pins/__tests__/PinnedSection.test.tsx`:

```typescript
describe('PinnedSection', () => {
  it('renders when there are pinned items')
  it('does not render when no pins')
  it('toggles collapse on header click')
  it('persists collapse state to localStorage')
  it('calls onNavigate when pin clicked')
  it('shows stale indicator for old pins')
  it('calls refreshStale when refresh icon clicked')
})
```

Create `src/components/pins/__tests__/PinButton.test.tsx`:

```typescript
describe('PinButton', () => {
  it('shows filled icon when item is pinned')
  it('shows outline icon when not pinned')
  it('calls pin() on click when not pinned')
  it('calls unpin() on click when pinned')
  it('shows toast when at max pins limit')
  it('disables button during loading')
})
```

---

## Checklist

- [ ] Create `024_pinned_items.sql` migration
- [ ] Wire auto-unpin on task complete
- [ ] Wire auto-unpin on project complete  
- [ ] Add PinButton to Projects
- [ ] Add PinButton to Contacts
- [ ] Add PinButton to Routines
- [ ] Add PinButton to Lists
- [ ] Create useAttachments.test.ts
- [ ] Create FileUpload.test.tsx
- [ ] Create AttachmentList.test.tsx
- [ ] Create usePinnedItems.test.ts
- [ ] Create PinnedSection.test.tsx
- [ ] Create PinButton.test.tsx
- [ ] TypeScript clean
- [ ] All tests pass
