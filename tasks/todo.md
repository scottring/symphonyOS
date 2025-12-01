# Event Notes Feature

Add local notes for Google Calendar events, allowing Symphony users to annotate events with their own notes while preserving the read-only Google Calendar description.

## Completed

### 1. Database Migration
- [x] Create `event_notes` table with `google_event_id`, `user_id`, `notes`, timestamps
- [x] Add RLS policies for user isolation
- [x] Add unique constraint on (user_id, google_event_id)
- [x] Add updated_at trigger

### 2. Types & Hook
- [x] Create `useEventNotes` hook with CRUD operations (optimistic updates)
- [x] Add `googleDescription` field to `TimelineItem` type

### 3. DetailPanel Updates
- [x] Show GCal description (read-only) in a "From Google Calendar" section with blue styling
- [x] Show editable Symphony notes section labeled "My Notes"
- [x] Use same edit UX as tasks (textarea, save on change)
- [x] Add "Add Notes" button for events (opens edit mode)

### 4. Integration
- [x] Pass event notes hook to DetailPanel via App.tsx
- [x] Load notes when selecting an event
- [x] Wire up save functionality with optimistic updates

---

## Review

### Files Created
- `supabase/migrations/003_event_notes.sql` - New database table with RLS policies
- `src/hooks/useEventNotes.ts` - Hook for managing event notes with optimistic updates

### Files Modified
- `src/types/timeline.ts` - Added `googleDescription` field, updated `eventToTimelineItem`
- `src/components/detail/DetailPanel.tsx` - Added event notes UI (read-only GCal + editable Symphony notes)
- `src/App.tsx` - Integrated useEventNotes hook
- `src/App.test.tsx` - Added mock for useEventNotes

### Key Design Decisions
1. **Separation of concerns**: GCal description stays read-only in `googleDescription`, user notes go in `notes`
2. **Visual distinction**: GCal description shown with blue background/border, user notes with neutral gray
3. **Same UX pattern**: Event note editing uses same textarea pattern as task notes
4. **Optimistic updates**: Notes save immediately with rollback on error

---

## Previous Work

### Phase 2 (Completed)
- [x] Contextual actions (2.1) - View Recipe, Join Call, Get Directions
- [x] UI Refinements (2.2) - Swipe gestures, empty states, loading skeletons

### Phase 1 (Completed)
- [x] Auth (Supabase)
- [x] Task CRUD with persistence
- [x] Google Calendar integration
- [x] Desktop UI rebuild
- [x] Time-based grouping
- [x] Task scheduling
- [x] Date navigation
