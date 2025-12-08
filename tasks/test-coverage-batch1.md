# Test Coverage Batch 1: Attachments & Pins

## Priority
HIGH — These features are built but have zero test coverage. Blocks production readiness.

---

## Tests to Create

### 1. useAttachments.test.ts

Location: `src/hooks/useAttachments.test.ts`

```typescript
describe('useAttachments', () => {
  // Setup/teardown
  beforeEach(() => {
    // Mock Supabase client
  })

  // Fetching
  it('fetches attachments for an entity')
  it('returns empty array when no attachments exist')
  it('handles fetch errors gracefully')

  // Uploading
  it('uploads a file and creates attachment record')
  it('uses optimistic updates for upload')
  it('validates file type before upload')
  it('rejects files with disallowed MIME types')
  it('validates file size before upload')
  it('rejects files exceeding MAX_FILE_SIZE')
  it('handles upload errors gracefully')
  it('rolls back optimistic update on upload failure')

  // Deleting
  it('deletes attachment and removes from storage')
  it('uses optimistic updates for delete')
  it('handles delete errors gracefully')
  it('rolls back optimistic update on delete failure')

  // Signed URLs
  it('generates signed URL for file access')
  it('handles signed URL generation errors')

  // Cache
  it('caches attachments by entity')
  it('getAttachments returns cached data synchronously')
})
```

### 2. usePinnedItems.test.ts

Location: `src/hooks/usePinnedItems.test.ts`

```typescript
describe('usePinnedItems', () => {
  // Setup/teardown
  beforeEach(() => {
    // Mock Supabase client
    // Clear localStorage
  })

  // Fetching
  it('fetches pinned items on mount')
  it('returns empty array when no pins exist')
  it('sorts pins by display_order')

  // Pinning
  it('pins an item')
  it('enforces MAX_PINS limit (7)')
  it('returns false when trying to pin at limit')
  it('uses optimistic updates for pin')

  // Unpinning
  it('unpins an item')
  it('unpins by entity type and id')
  it('uses optimistic updates for unpin')

  // Queries
  it('isPinned returns true for pinned items')
  it('isPinned returns false for unpinned items')
  it('canPin returns true when under limit')
  it('canPin returns false when at limit')

  // Access tracking
  it('markAccessed updates lastAccessedAt')
  it('refreshStale resets lastAccessedAt')

  // Stale logic
  it('computes isStale=true after 14 days without access')
  it('computes isStale=false for recently accessed items')
  it('auto-unpins items older than 21 days on load')

  // Reordering
  it('reorder updates display_order for all items')
})
```

### 3. FileUpload.test.tsx

Location: `src/components/attachments/__tests__/FileUpload.test.tsx`

```typescript
describe('FileUpload', () => {
  // Rendering
  it('renders upload zone with drop area')
  it('renders compact mode correctly')
  it('shows loading state during upload')

  // File selection
  it('opens file picker on click')
  it('calls onUpload with file when selected via picker')

  // Drag and drop
  it('shows drag-over state when file dragged over')
  it('calls onUpload with file when dropped')
  it('resets drag state when file leaves')

  // Validation
  it('accepts valid file types (png, jpg, pdf, etc.)')
  it('rejects invalid file types')
  it('shows error message for invalid file type')
  it('rejects files over MAX_FILE_SIZE')
  it('shows error message for oversized files')

  // Accessibility
  it('has accessible button/input')
})
```

### 4. AttachmentList.test.tsx

Location: `src/components/attachments/__tests__/AttachmentList.test.tsx`

```typescript
describe('AttachmentList', () => {
  // Rendering
  it('renders list of attachments')
  it('renders empty state when no attachments')
  it('shows correct icon for image files')
  it('shows correct icon for PDF files')
  it('shows correct icon for document files (docx)')
  it('shows correct icon for spreadsheet files (xlsx)')
  it('shows correct icon for audio files (mp3)')
  it('shows correct icon for text/csv files')
  it('displays file name')
  it('displays formatted file size')

  // Interactions
  it('calls onOpen when attachment row clicked')
  it('calls onDelete when delete button clicked')
  it('shows loading state during delete')
  it('delete button stops event propagation')

  // Accessibility
  it('has accessible delete buttons with labels')
})
```

### 5. PinButton.test.tsx

Location: `src/components/pins/__tests__/PinButton.test.tsx`

```typescript
describe('PinButton', () => {
  // Rendering
  it('shows filled Pin icon when isPinned=true')
  it('shows outline Pin icon when isPinned=false')
  it('renders sm size correctly')
  it('renders md size correctly')

  // Interactions
  it('calls onPin when clicked and not pinned')
  it('calls onUnpin when clicked and pinned')
  it('does not call onPin when canPin=false')
  it('calls onMaxPinsReached when canPin=false and clicked')
  it('stops event propagation on click')

  // Titles/tooltips
  it('shows "Unpin" title when pinned')
  it('shows "Pin for quick access" title when not pinned and can pin')
  it('shows max pins warning title when cannot pin')
})
```

### 6. PinnedSection.test.tsx

Location: `src/components/pins/__tests__/PinnedSection.test.tsx`

```typescript
describe('PinnedSection', () => {
  // Rendering
  it('renders when there are pinned items')
  it('does not render when pins array is empty')
  it('renders correct number of PinnedItem components')
  it('shows collapsed view when sidebar is collapsed')

  // Entity resolution
  it('displays task name for task pins')
  it('displays project name for project pins')
  it('displays contact name for contact pins')
  it('displays routine name for routine pins')
  it('displays list name for list pins')
  it('shows "Unknown" for missing entities')

  // Collapse toggle
  it('toggles collapse on header click')
  it('persists collapse state to localStorage')
  it('reads initial collapse state from localStorage')
  it('shows chevron rotated when expanded')

  // Interactions
  it('calls onNavigate when pin clicked')
  it('calls onMarkAccessed when pin clicked')
  it('calls onRefreshStale when refresh icon clicked on stale item')
})
```

### 7. PinnedItem.test.tsx

Location: `src/components/pins/__tests__/PinnedItem.test.tsx`

```typescript
describe('PinnedItem', () => {
  // Rendering
  it('renders pin name')
  it('shows folder icon for project type')
  it('shows check icon for task type')
  it('shows user icon for contact type')
  it('shows repeat icon for routine type')
  it('shows list icon for list type')

  // Stale state
  it('shows normal styling when not stale')
  it('shows dimmed styling when stale')
  it('shows refresh icon when stale')
  it('hides refresh icon when not stale')

  // Interactions
  it('calls onClick when row clicked')
  it('calls onRefresh when refresh icon clicked')
  it('refresh click stops propagation')
})
```

---

## Test Utilities Needed

Check if these already exist, create if not:

```typescript
// src/test/mocks/supabase.ts
// Mock Supabase client for storage operations

// src/test/mocks/localStorage.ts  
// Mock localStorage for persistence tests
```

---

## Patterns to Follow

Look at these existing tests for patterns:
- `src/hooks/useEventNotes.test.ts` — hook testing with Supabase mocks
- `src/hooks/useNotes.test.ts` — similar CRUD hook
- `src/components/detail/DetailPanel.test.tsx` — component testing patterns
- `src/components/planning/PlanningSession.test.tsx` — complex component tests

---

## Checklist

- [ ] Create `src/hooks/useAttachments.test.ts`
- [ ] Create `src/hooks/usePinnedItems.test.ts`
- [ ] Create `src/components/attachments/__tests__/FileUpload.test.tsx`
- [ ] Create `src/components/attachments/__tests__/AttachmentList.test.tsx`
- [ ] Create `src/components/pins/__tests__/PinButton.test.tsx`
- [ ] Create `src/components/pins/__tests__/PinnedSection.test.tsx`
- [ ] Create `src/components/pins/__tests__/PinnedItem.test.tsx`
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Run full test suite to ensure no regressions

---

## Verification

After completion, run:
```bash
npm test -- --coverage --collectCoverageFrom='src/hooks/useAttachments.ts' --collectCoverageFrom='src/hooks/usePinnedItems.ts' --collectCoverageFrom='src/components/attachments/**/*.tsx' --collectCoverageFrom='src/components/pins/**/*.tsx'
```

Target: >80% coverage on these files.
