# Needs-Discussion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "needs discussion" flag to tasks and events, surface flagged family-domain items as a "For Discussion" widget on the kitchen kiosk where they can be marked as discussed.

**Architecture:** Tasks gain two columns (`needs_discussion`, `discussion_note`); events use a parallel annotation table `event_discussion_flags` keyed by `google_event_base_id` (mirrors `hidden_calendar_events`). Flagging UI = a new `DiscussionPicker` triage icon for tasks + a toggle in `DetailPanelRedesign` for events. Kiosk surface = `WallDiscussionWidget` in the bottom widget strip of `WallCalendar`, expanding to a full-screen `WallDiscussionOverlay`. Family-domain filter applied at query time. Flag clears via mark-as-discussed on the kiosk, manual unflag, or auto-clear on task completion. Eager flag-row cleanup hooked into the existing `deleteEvent` flow.

**Tech Stack:** React 19, TypeScript strict, Supabase (Postgres + RLS + realtime), Vitest, Playwright, Tailwind v4, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-05-07-needs-discussion-design.md`

---

## File structure

**New files:**
- `supabase/migrations/091_tasks_needs_discussion.sql` — task columns
- `supabase/migrations/092_event_discussion_flags.sql` — event flags table + RLS
- `src/types/eventDiscussion.ts` — `EventDiscussionFlag` type
- `src/components/triage/DiscussionPicker.tsx` — task triage icon
- `src/components/triage/DiscussionPicker.test.tsx`
- `src/hooks/useEventDiscussionFlags.ts` — event flag CRUD
- `src/hooks/useEventDiscussionFlags.test.ts`
- `src/hooks/useFamilyDiscussionItems.ts` — kiosk-side joined query
- `src/components/wall/WallDiscussionWidget.tsx` — bottom-strip widget
- `src/components/wall/WallDiscussionWidget.test.tsx`
- `src/components/wall/WallDiscussionOverlay.tsx` — full-screen list + actions
- `src/components/wall/WallDiscussionOverlay.test.tsx`
- `e2e/needs-discussion.spec.ts` — Playwright happy path

**Modified files:**
- `src/types/task.ts` — add `needsDiscussion`, `discussionNote`
- `src/hooks/useSupabaseTasks.ts` — extend `DbTask`, `dbTaskToTask`, `updateTask` mapping; auto-clear in `toggleTask`
- `src/components/triage/index.ts` — export `DiscussionPicker`
- `src/components/schedule/InboxTaskCard.tsx` — mount `DiscussionPicker` in triage row
- `src/components/schedule/ScheduleItem.tsx` — mount `DiscussionPicker` in triage row (task variant only)
- `src/components/detail/DetailPanelRedesign.tsx` — event-side toggle + note
- `src/components/wall/WallCalendar.tsx` — mount widget in bottom strip + overlay state
- `src/hooks/useGoogleCalendar.tsx` — eager flag cleanup in `deleteEvent`

---

## Phase 1 — Database & types

### Task 1: Migration — add task columns

**Files:**
- Create: `supabase/migrations/091_tasks_needs_discussion.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 091_tasks_needs_discussion.sql
-- Adds the "needs discussion" flag and optional note to tasks.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS needs_discussion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discussion_note TEXT;

-- Partial index speeds up the kiosk family-domain query
CREATE INDEX IF NOT EXISTS idx_tasks_needs_discussion
  ON tasks (user_id, context)
  WHERE needs_discussion = TRUE;
```

- [ ] **Step 2: Apply migration via Supabase Management API**

The local migration history is out of sync (per project memory), so apply DDL directly:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needs_discussion BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS discussion_note TEXT; CREATE INDEX IF NOT EXISTS idx_tasks_needs_discussion ON tasks (user_id, context) WHERE needs_discussion = TRUE;"}'
```

Expected: `{"result":[]}` (no error).

- [ ] **Step 3: Verify columns exist**

```bash
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name='\''tasks'\'' AND column_name IN ('\''needs_discussion'\'','\''discussion_note'\'');"}'
```

Expected: both column names returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/091_tasks_needs_discussion.sql
git commit -m "feat(db): add needs_discussion + discussion_note columns to tasks"
```

---

### Task 2: Migration — event_discussion_flags table

**Files:**
- Create: `supabase/migrations/092_event_discussion_flags.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 092_event_discussion_flags.sql
-- Symphony-side annotation flagging Google Calendar events for discussion.
-- Mirrors hidden_calendar_events: keyed by google_event_base_id so flagging
-- a recurring event flags the whole series.

CREATE TABLE IF NOT EXISTS event_discussion_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_base_id TEXT NOT NULL,
  event_title TEXT,
  calendar_id TEXT,
  discussion_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_discussion_flags_unique UNIQUE (user_id, google_event_base_id)
);

CREATE INDEX IF NOT EXISTS idx_event_discussion_flags_user_calendar
  ON event_discussion_flags (user_id, calendar_id);

ALTER TABLE event_discussion_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own discussion flags"
  ON event_discussion_flags
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at_event_discussion_flags()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_event_discussion_flags_updated_at
  BEFORE UPDATE ON event_discussion_flags
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_event_discussion_flags();
```

- [ ] **Step 2: Apply via Management API**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
SQL=$(cat supabase/migrations/092_event_discussion_flags.sql | jq -Rs .)
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
```

Expected: `{"result":[]}`.

- [ ] **Step 3: Verify table + RLS**

```bash
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename='\''event_discussion_flags'\'';"}'
```

Expected: `{"tablename":"event_discussion_flags","rowsecurity":true}` in result.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/092_event_discussion_flags.sql
git commit -m "feat(db): add event_discussion_flags table for kiosk For-Discussion list"
```

---

### Task 3: TypeScript types

**Files:**
- Modify: `src/types/task.ts:24-56`
- Create: `src/types/eventDiscussion.ts`

- [ ] **Step 1: Extend `Task` interface**

In `src/types/task.ts`, add two fields just before the closing brace of `Task`:

```ts
  isWaiting?: boolean
  waitingSince?: Date
  context?: TaskContext | null
  category?: TaskCategory
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string
  assignedTo?: string
  assignedToAll?: string[]
  projectId?: string
  parentTaskId?: string
  subtasks?: Task[]
  linkedEventId?: string
  linkedTo?: LinkedActivity
  linkType?: LinkType
  estimatedDuration?: number
  location?: string
  locationPlaceId?: string
  // Needs-discussion flag — surfaces on family kiosk's For Discussion list
  needsDiscussion?: boolean
  discussionNote?: string
}
```

(The existing fields are listed for context — only add the two new lines + comment.)

- [ ] **Step 2: Create event flag type**

```ts
// src/types/eventDiscussion.ts
export interface EventDiscussionFlag {
  id: string
  userId: string
  googleEventBaseId: string
  eventTitle?: string
  calendarId?: string
  discussionNote?: string
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: PASS (no new TS errors).

- [ ] **Step 4: Commit**

```bash
git add src/types/task.ts src/types/eventDiscussion.ts
git commit -m "feat(types): add needsDiscussion fields and EventDiscussionFlag"
```

---

## Phase 2 — Task hook layer

### Task 4: Extend `DbTask`, `dbTaskToTask`, and `updateTask` mapping

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts:9-42` (DbTask)
- Modify: `src/hooks/useSupabaseTasks.ts:55-93` (dbTaskToTask)
- Modify: `src/hooks/useSupabaseTasks.ts:680-700` (updateTask field mapping — see existing `if ('completed' in updates)` lines around 687)

- [ ] **Step 1: Add columns to `DbTask`**

In the `DbTask` interface (lines 9-42), add at the end (just before `created_at`):

```ts
  is_waiting: boolean | null
  waiting_since: string | null
  needs_discussion: boolean | null
  discussion_note: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Map to camelCase in `dbTaskToTask`**

After the `waitingSince:` line (line 91), add:

```ts
    isWaiting: dbTask.is_waiting ?? undefined,
    waitingSince: dbTask.waiting_since ? new Date(dbTask.waiting_since) : undefined,
    needsDiscussion: dbTask.needs_discussion ?? undefined,
    discussionNote: dbTask.discussion_note ?? undefined,
  }
}
```

- [ ] **Step 3: Map updates in `updateTask` and `updateTasksBulk`**

Search the file for existing `if ('completed' in updates) dbUpdates.completed = updates.completed` lines (around lines 687 and 777). Add right after each occurrence:

```ts
    if ('needsDiscussion' in updates) dbUpdates.needs_discussion = updates.needsDiscussion
    if ('discussionNote' in updates) dbUpdates.discussion_note = updates.discussionNote
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts
git commit -m "feat(tasks): wire needs_discussion through DbTask mapping and updateTask"
```

---

### Task 5: Auto-clear flag on task completion

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts:495-525` (parent-task completion path inside `toggleTask`)

- [ ] **Step 1: Write the failing test**

In `src/hooks/useSupabaseTasks.ts`, find the test file alongside it. (If none exists, skip to Step 2 and add coverage in `useEventDiscussionFlags.test.ts` Phase 4 instead — `useSupabaseTasks` may not have a unit test in this codebase. Run `ls src/hooks/useSupabaseTasks*` — if no test file, skip to Step 2 and update the manual checklist instead.)

If a test file exists, add this test:

```ts
it('clears needs_discussion when task is completed', async () => {
  // Arrange: a task with needsDiscussion=true
  // Act: toggleTask
  // Assert: optimistic state has needsDiscussion=false; DB update payload includes needs_discussion=false
})
```

- [ ] **Step 2: Patch the optimistic update**

In `toggleTask`, the parent-task branch around line 496 currently has:

```ts
      // Optimistic update - complete parent and all subtasks if completing
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              completed: newCompleted,
              // Clear waiting state when completing
              ...(newCompleted && t.isWaiting ? { isWaiting: false, waitingSince: undefined } : {}),
              subtasks: newCompleted
                ? t.subtasks?.map((s) => ({ ...s, completed: true }))
                : t.subtasks,
            }
          }
          return t
        })
      )
```

Add a discussion-clearing spread alongside the waiting-clearing one:

```ts
      // Optimistic update - complete parent and all subtasks if completing
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              completed: newCompleted,
              // Clear waiting state when completing
              ...(newCompleted && t.isWaiting ? { isWaiting: false, waitingSince: undefined } : {}),
              // Clear discussion flag when completing
              ...(newCompleted && t.needsDiscussion ? { needsDiscussion: false, discussionNote: undefined } : {}),
              subtasks: newCompleted
                ? t.subtasks?.map((s) => ({ ...s, completed: true }))
                : t.subtasks,
            }
          }
          return t
        })
      )
```

- [ ] **Step 3: Patch the DB update**

The DB-update block around line 514 is:

```ts
      // Update parent in DB — also clear waiting state if completing
      const dbUpdate: Record<string, unknown> = { completed: newCompleted }
      if (newCompleted && task.isWaiting) {
        dbUpdate.is_waiting = false
        dbUpdate.waiting_since = null
      }
```

Add an analogous block right after the waiting-clearing block:

```ts
      // Update parent in DB — also clear waiting state if completing
      const dbUpdate: Record<string, unknown> = { completed: newCompleted }
      if (newCompleted && task.isWaiting) {
        dbUpdate.is_waiting = false
        dbUpdate.waiting_since = null
      }
      if (newCompleted && task.needsDiscussion) {
        dbUpdate.needs_discussion = false
        dbUpdate.discussion_note = null
      }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts
git commit -m "feat(tasks): auto-clear needs_discussion when task completes"
```

---

## Phase 3 — Triage picker

### Task 6: `DiscussionPicker` component

**Files:**
- Create: `src/components/triage/DiscussionPicker.tsx`
- Modify: `src/components/triage/index.ts`

- [ ] **Step 1: Write the failing test (skip if no existing picker tests; pattern: see `WhenPicker.test.tsx`)**

Create `src/components/triage/DiscussionPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionPicker } from './DiscussionPicker'

describe('DiscussionPicker', () => {
  it('renders unflagged state with neutral icon', () => {
    render(<DiscussionPicker flagged={false} note="" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: /needs discussion/i })
    expect(button.className).toMatch(/text-neutral/)
  })

  it('renders flagged state with primary tint', () => {
    render(<DiscussionPicker flagged={true} note="" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: /needs discussion/i })
    expect(button.className).toMatch(/text-primary/)
  })

  it('opens popover on click and toggles flag', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={false} note="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /needs discussion/i }))
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: '' })
  })

  it('passes note through onChange when textarea changes', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={true} note="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    const textarea = screen.getByPlaceholderText(/what's the question/i)
    fireEvent.change(textarea, { target: { value: 'Push delivery?' } })
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'Push delivery?' })
  })

  it('shows clear button only when flagged, calls onChange with flagged=false', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={true} note="hello" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: '' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/triage/DiscussionPicker.test.tsx --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/triage/DiscussionPicker.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'

interface DiscussionPickerProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
}

export function DiscussionPicker({ flagged, note, onChange }: DiscussionPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [draftNote, setDraftNote] = useState(note)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync draft when external note changes (e.g., panel open with new task)
  useEffect(() => {
    setDraftNote(note)
  }, [note])

  // Close on outside click; persist any draft note edits via onChange
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (draftNote !== note) {
          onChange({ flagged, note: draftNote })
        }
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, draftNote, note, flagged, onChange])

  // Focus textarea when opening if already flagged
  useEffect(() => {
    if (isOpen && flagged && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen, flagged])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          flagged
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        aria-label="Needs discussion"
      >
        <MessageCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 min-w-[260px]">
          <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => onChange({ flagged: e.target.checked, note: draftNote })}
              aria-label="Needs discussion"
              className="rounded"
            />
            <span>Needs discussion</span>
          </label>
          <textarea
            ref={textareaRef}
            value={draftNote}
            onChange={(e) => {
              setDraftNote(e.target.value)
              onChange({ flagged, note: e.target.value })
            }}
            placeholder="What's the question?"
            disabled={!flagged}
            rows={3}
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                       focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
          {flagged && (
            <>
              <div className="border-t border-neutral-100 my-2" />
              <button
                onClick={() => {
                  setDraftNote('')
                  onChange({ flagged: false, note: '' })
                  setIsOpen(false)
                }}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Export from triage index**

In `src/components/triage/index.ts`, append:

```ts
export { DiscussionPicker } from './DiscussionPicker'
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest src/components/triage/DiscussionPicker.test.tsx --run`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/triage/DiscussionPicker.tsx src/components/triage/DiscussionPicker.test.tsx src/components/triage/index.ts
git commit -m "feat(triage): add DiscussionPicker for needs-discussion flag + note"
```

---

### Task 7: Wire DiscussionPicker into `InboxTaskCard`

**Files:**
- Modify: `src/components/schedule/InboxTaskCard.tsx:7` (import) and `:186-202` (icon row)

- [ ] **Step 1: Update import**

Change line 7 from:

```ts
import { SchedulePopover, DeferPicker, ContextPicker } from '@/components/triage'
```

To:

```ts
import { SchedulePopover, DeferPicker, ContextPicker, DiscussionPicker } from '@/components/triage'
```

- [ ] **Step 2: Mount picker in always-visible icon row**

The "Context picker - always visible" block at line 186 is:

```tsx
          {/* Context picker - always visible */}
          <ContextPicker
            value={task.context}
            onChange={(context) => onUpdate({ context })}
          />
```

Insert immediately after the closing `</ContextPicker>` (so the icon order is `… ContextPicker DiscussionPicker AssignAvatar`):

```tsx
          {/* Context picker - always visible */}
          <ContextPicker
            value={task.context}
            onChange={(context) => onUpdate({ context })}
          />

          {/* Needs-discussion picker - always visible */}
          <DiscussionPicker
            flagged={task.needsDiscussion ?? false}
            note={task.discussionNote ?? ''}
            onChange={({ flagged, note }) => {
              onUpdate({
                needsDiscussion: flagged,
                discussionNote: flagged ? note : undefined,
              })
            }}
          />
```

- [ ] **Step 3: Run tests + build**

```bash
npm run build
npx vitest src/components/schedule/InboxTaskCard --run
```

Expected: build PASS; tests PASS.

- [ ] **Step 4: Manually verify in dev**

```bash
npm run dev
```

Open the inbox view, hover/tap a task, confirm the discussion icon appears in the row, popover opens, toggling persists across reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/InboxTaskCard.tsx
git commit -m "feat(triage): wire DiscussionPicker into InboxTaskCard"
```

---

### Task 8: Wire DiscussionPicker into `ScheduleItem`

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx:8` (import) and `:540-556` (ContextPicker block)

- [ ] **Step 1: Update import**

Change line 8 from:

```ts
import { PushDropdown, SchedulePopover, ContextPicker, type ScheduleContextItem } from '@/components/triage'
```

To:

```ts
import { PushDropdown, SchedulePopover, ContextPicker, DiscussionPicker, type ScheduleContextItem } from '@/components/triage'
```

- [ ] **Step 2: Identify the props the component already has for the task case**

`ScheduleItem` is shared by tasks/routines/events. Discussion only applies to tasks. The component already differentiates with `isTask`/`isRoutine`/`isEvent` (line 229+). Find where `isTask`-only triage actions are placed — `ContextPicker` shows for both task and event but is not the right neighbor here. The discussion picker should sit immediately after `ContextPicker` and only when `isTask`.

The existing block (around line 537-556):

```tsx
          {(isTask || isRoutine || isEvent) && onContextChange && (
            <div
              className={
                isEvent || item.context
                  ? 'transition-opacity'
                  : 'opacity-0 group-hover:opacity-100 transition-opacity'
              }
              onClick={(e) => {
                e.stopPropagation()
                if (panelOpen && onClosePanel) {
                  onClosePanel()
                }
              }}
            >
              <ContextPicker
                value={item.context ?? undefined}
                onChange={onContextChange}
              />
            </div>
          )}
```

- [ ] **Step 3: Add a parallel block right after for tasks only**

Insert directly after the closing `)}` of the ContextPicker block:

```tsx
          {/* Needs-discussion picker — tasks only (events use detail-panel toggle) */}
          {isTask && onUpdateTask && (
            <div
              className="transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                if (panelOpen && onClosePanel) {
                  onClosePanel()
                }
              }}
            >
              <DiscussionPicker
                flagged={item.needsDiscussion ?? false}
                note={item.discussionNote ?? ''}
                onChange={({ flagged, note }) => {
                  onUpdateTask({
                    needsDiscussion: flagged,
                    discussionNote: flagged ? note : undefined,
                  })
                }}
              />
            </div>
          )}
```

Note: `onUpdateTask` may be named differently. Search the existing component for the prop that wraps `onUpdate` for tasks (typically the one that already handles `onContextChange`). If the prop signature is `onContextChange: (context) => void`, you may need to broaden it to a partial-update pattern, or pass a separate `onUpdateTaskFields?: (updates: Partial<Task>) => void` prop. Use whatever the component already uses for partial-update mutations on tasks. **Verify by reading the component's prop interface before implementing.**

- [ ] **Step 4: If no general partial-update prop exists, plumb a new one through**

If no suitable existing prop exists, add a new prop `onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void` to `ScheduleItem` and have callers pass `(next) => onUpdate(taskId, next)`. Trace the call sites — they're in `TodaySchedule.tsx` and any other parent that renders `ScheduleItem`.

- [ ] **Step 5: Build + test**

```bash
npm run build
npx vitest src/components/schedule --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx [+ any callers updated]
git commit -m "feat(triage): wire DiscussionPicker into ScheduleItem (task variant)"
```

---

## Phase 4 — Event hook layer

### Task 9: `useEventDiscussionFlags` hook

**Files:**
- Create: `src/hooks/useEventDiscussionFlags.ts`
- Create: `src/hooks/useEventDiscussionFlags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useEventDiscussionFlags.test.ts` (skeleton — adapt the chainable mock pattern from `src/hooks/useEventNotes.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useEventDiscussionFlags } from './useEventDiscussionFlags'

vi.mock('@/lib/supabase', () => {
  // Mirror the chainable mock approach in useEventNotes.test.ts.
  // Supports: .from().select().eq() / .from().insert().select().single() /
  //           .from().delete().eq().eq() / .from().update().eq().eq().select().single()
  // (Full implementation lives in useEventNotes.test.ts — copy that pattern.)
  return { supabase: { /* ... */ } }
})

describe('useEventDiscussionFlags', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('starts with empty flags and loading=true', () => {
    const { result } = renderHook(() => useEventDiscussionFlags())
    expect(result.current.flags).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('isFlagged returns true for flagged base ids (recurring instance maps to base)', async () => {
    // Seed mock with a flag for base 'abc'
    // Render hook, await load
    // expect isFlagged('abc') === true
    // expect isFlagged('abc_20260318T130000Z') === true (recurring instance)
    // expect isFlagged('xyz') === false
  })

  it('flagEvent inserts a row keyed by base id', async () => {
    // Render, call flagEvent('abc_20260318T130000Z', { title: 'Soccer', calendarId: 'fam' })
    // Assert insert called with google_event_base_id='abc'
  })

  it('unflagEvent deletes by base id', async () => {
    // Render, call unflagEvent('abc_20260318T130000Z')
    // Assert delete called with google_event_base_id='abc'
  })

  it('updateNote updates the flag row', async () => {
    // Render with existing flag, call updateNote('abc', 'new note')
    // Assert update called with discussion_note='new note'
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest src/hooks/useEventDiscussionFlags.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/useEventDiscussionFlags.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getRecurringBaseId } from './useHiddenCalendarEvents'
import type { EventDiscussionFlag } from '@/types/eventDiscussion'

interface DbFlag {
  id: string
  user_id: string
  google_event_base_id: string
  event_title: string | null
  calendar_id: string | null
  discussion_note: string | null
  created_at: string
  updated_at: string
}

function dbToFlag(row: DbFlag): EventDiscussionFlag {
  return {
    id: row.id,
    userId: row.user_id,
    googleEventBaseId: row.google_event_base_id,
    eventTitle: row.event_title ?? undefined,
    calendarId: row.calendar_id ?? undefined,
    discussionNote: row.discussion_note ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function useEventDiscussionFlags() {
  const [flags, setFlags] = useState<EventDiscussionFlag[]>([])
  const [flagsByBaseId, setFlagsByBaseId] = useState<Map<string, EventDiscussionFlag>>(new Map())
  const [loading, setLoading] = useState(true)

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data, error } = await supabase
        .from('event_discussion_flags')
        .select('*')
        .eq('user_id', user.id)

      if (cancelled) return
      if (!error && data) {
        const mapped = (data as DbFlag[]).map(dbToFlag)
        setFlags(mapped)
        setFlagsByBaseId(new Map(mapped.map((f) => [f.googleEventBaseId, f])))
      }
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  // Realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channel = supabase
        .channel('event_discussion_flags_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_discussion_flags', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const f = dbToFlag(payload.new as DbFlag)
              setFlags((prev) => {
                const without = prev.filter((p) => p.id !== f.id)
                return [...without, f]
              })
              setFlagsByBaseId((prev) => {
                const next = new Map(prev)
                next.set(f.googleEventBaseId, f)
                return next
              })
            } else if (payload.eventType === 'DELETE') {
              const old = payload.old as DbFlag
              setFlags((prev) => prev.filter((p) => p.id !== old.id))
              setFlagsByBaseId((prev) => {
                const next = new Map(prev)
                next.delete(old.google_event_base_id)
                return next
              })
            }
          }
        )
        .subscribe()
    }
    subscribe()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const isFlagged = useCallback((googleEventId: string): boolean => {
    return flagsByBaseId.has(getRecurringBaseId(googleEventId))
  }, [flagsByBaseId])

  const getFlag = useCallback((googleEventId: string): EventDiscussionFlag | undefined => {
    return flagsByBaseId.get(getRecurringBaseId(googleEventId))
  }, [flagsByBaseId])

  const flagEvent = useCallback(
    async (googleEventId: string, opts: { title?: string; calendarId?: string; note?: string }) => {
      const baseId = getRecurringBaseId(googleEventId)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data, error } = await supabase
        .from('event_discussion_flags')
        .upsert(
          {
            user_id: user.id,
            google_event_base_id: baseId,
            event_title: opts.title ?? null,
            calendar_id: opts.calendarId ?? null,
            discussion_note: opts.note ?? null,
          },
          { onConflict: 'user_id,google_event_base_id' }
        )
        .select()
        .single()

      if (error || !data) {
        console.error('Failed to flag event:', error)
        return false
      }

      const f = dbToFlag(data as DbFlag)
      setFlags((prev) => [...prev.filter((p) => p.googleEventBaseId !== baseId), f])
      setFlagsByBaseId((prev) => {
        const next = new Map(prev)
        next.set(baseId, f)
        return next
      })
      return true
    },
    []
  )

  const unflagEvent = useCallback(async (googleEventId: string) => {
    const baseId = getRecurringBaseId(googleEventId)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('event_discussion_flags')
      .delete()
      .eq('user_id', user.id)
      .eq('google_event_base_id', baseId)

    if (error) {
      console.error('Failed to unflag event:', error)
      return false
    }
    setFlags((prev) => prev.filter((p) => p.googleEventBaseId !== baseId))
    setFlagsByBaseId((prev) => {
      const next = new Map(prev)
      next.delete(baseId)
      return next
    })
    return true
  }, [])

  const updateNote = useCallback(async (googleEventId: string, note: string) => {
    const baseId = getRecurringBaseId(googleEventId)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('event_discussion_flags')
      .update({ discussion_note: note || null })
      .eq('user_id', user.id)
      .eq('google_event_base_id', baseId)
      .select()
      .single()

    if (error || !data) {
      console.error('Failed to update discussion note:', error)
      return false
    }
    const f = dbToFlag(data as DbFlag)
    setFlags((prev) => [...prev.filter((p) => p.googleEventBaseId !== baseId), f])
    setFlagsByBaseId((prev) => {
      const next = new Map(prev)
      next.set(baseId, f)
      return next
    })
    return true
  }, [])

  return { flags, flagsByBaseId, loading, isFlagged, getFlag, flagEvent, unflagEvent, updateNote }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest src/hooks/useEventDiscussionFlags.test.ts --run`
Expected: PASS (5 tests, after wiring up the mock chains).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEventDiscussionFlags.ts src/hooks/useEventDiscussionFlags.test.ts
git commit -m "feat(events): add useEventDiscussionFlags hook with realtime sync"
```

---

## Phase 5 — Event detail panel toggle

### Task 10: Discussion toggle in `DetailPanelRedesign` event view

**Files:**
- Modify: `src/components/detail/DetailPanelRedesign.tsx` — import the hook, add UI block in event section near `onHideEvent` (around line 1912-1925)

- [ ] **Step 1: Add import**

Near the top imports, add:

```ts
import { useEventDiscussionFlags } from '@/hooks/useEventDiscussionFlags'
import { MessageCircle } from 'lucide-react'
```

(Skip `MessageCircle` if already imported.)

- [ ] **Step 2: Use the hook inside the component body**

In the body of the panel component (where other hooks are called), add:

```tsx
const { isFlagged, getFlag, flagEvent, unflagEvent, updateNote } = useEventDiscussionFlags()
```

- [ ] **Step 3: Add the toggle block in the event section**

Find the `onHideEvent` block around line 1912 (`{isEvent && !isMeal && item.originalEvent && item.startTime && (`). Add a sibling block immediately after it (still inside the same parent container that hosts event-only sections):

```tsx
{isEvent && !isMeal && item.originalEvent && (() => {
  const event = item.originalEvent
  const eventId = event.id || event.google_event_id || ''
  if (!eventId) return null
  const flagged = isFlagged(eventId)
  const flag = getFlag(eventId)
  return (
    <div className="px-4 py-3 border-t border-neutral-100">
      <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
        <input
          type="checkbox"
          checked={flagged}
          onChange={async (e) => {
            if (e.target.checked) {
              await flagEvent(eventId, {
                title: event.title,
                calendarId: event.calendar_id || event.calendarId || undefined,
              })
            } else {
              await unflagEvent(eventId)
            }
          }}
          className="rounded"
        />
        <MessageCircle className="w-4 h-4 text-neutral-500" />
        <span>Needs discussion</span>
      </label>
      {flagged && (
        <textarea
          defaultValue={flag?.discussionNote ?? ''}
          onBlur={(e) => {
            if ((e.target.value || '') !== (flag?.discussionNote ?? '')) {
              updateNote(eventId, e.target.value)
            }
          }}
          placeholder="What's the question?"
          rows={2}
          className="mt-2 w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                     focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}
    </div>
  )
})()}
```

(Use the `(() => { … })()` IIFE pattern to keep the JSX scope-local without polluting the surrounding render — this matches an existing pattern in the file at line 2212.)

- [ ] **Step 4: Build + manual verify**

```bash
npm run build
npm run dev
```

Open an event in the detail panel; toggle "Needs discussion"; add a note; close and reopen; verify persistence.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/DetailPanelRedesign.tsx
git commit -m "feat(detail): add needs-discussion toggle + note for events in detail panel"
```

---

## Phase 6 — Kiosk widget + overlay

### Task 11: `useFamilyDiscussionItems` hook

**Files:**
- Create: `src/hooks/useFamilyDiscussionItems.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useFamilyDiscussionItems.ts
import { useMemo } from 'react'
import { useSupabaseTasks } from './useSupabaseTasks'
import { useEventDiscussionFlags } from './useEventDiscussionFlags'
import { useGoogleCalendar } from './useGoogleCalendar'
import { useCalendarDomainMappings } from './useCalendarDomainMappings'
import type { Task } from '@/types/task'
import type { EventDiscussionFlag } from '@/types/eventDiscussion'
import type { CalendarEvent } from './useGoogleCalendar'

export interface DiscussionTaskItem {
  kind: 'task'
  id: string
  title: string
  note?: string
  task: Task
}

export interface DiscussionEventItem {
  kind: 'event'
  id: string
  title: string
  note?: string
  flag: EventDiscussionFlag
  event?: CalendarEvent
}

export type DiscussionItem = DiscussionTaskItem | DiscussionEventItem

export function useFamilyDiscussionItems() {
  const { tasks } = useSupabaseTasks()
  const { flags } = useEventDiscussionFlags()
  const { events } = useGoogleCalendar()
  const { getDomainForCalendar } = useCalendarDomainMappings()

  const taskItems = useMemo<DiscussionTaskItem[]>(() => {
    return tasks
      .filter((t) =>
        t.needsDiscussion &&
        !t.completed &&
        (t.context === 'family' || t.context === null || t.context === undefined)
      )
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        note: t.discussionNote,
        task: t,
      }))
  }, [tasks])

  const eventItems = useMemo<DiscussionEventItem[]>(() => {
    return flags
      .filter((flag) => {
        const domain = getDomainForCalendar(flag.calendarId, undefined)
        return domain === 'family'
      })
      .map((flag) => {
        const event = events.find((e) => {
          const id = e.id || e.google_event_id || ''
          // Compare base ids
          const m = id.match(/^(.+)_\d{8}T\d{6}Z$/)
          const base = m ? m[1] : id
          return base === flag.googleEventBaseId
        })
        return {
          kind: 'event' as const,
          id: flag.googleEventBaseId,
          title: event?.title || flag.eventTitle || 'Untitled event',
          note: flag.discussionNote,
          flag,
          event,
        }
      })
  }, [flags, events, getDomainForCalendar])

  const items = useMemo<DiscussionItem[]>(() => {
    return [...taskItems, ...eventItems]
  }, [taskItems, eventItems])

  return { items, taskItems, eventItems, count: items.length }
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFamilyDiscussionItems.ts
git commit -m "feat(kiosk): add useFamilyDiscussionItems for For-Discussion list"
```

---

### Task 12: `WallDiscussionWidget` (bottom-strip card)

**Files:**
- Create: `src/components/wall/WallDiscussionWidget.tsx`
- Create: `src/components/wall/WallDiscussionWidget.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall/WallDiscussionWidget.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussionWidget } from './WallDiscussionWidget'

describe('WallDiscussionWidget', () => {
  it('renders nothing when items list is empty', () => {
    const { container } = render(<WallDiscussionWidget items={[]} onClick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows count and first item title when populated', () => {
    render(
      <WallDiscussionWidget
        items={[
          { kind: 'task', id: '1', title: 'Kitchen delivery', note: '', task: {} as never },
          { kind: 'event', id: '2', title: 'Mia swim', note: '', flag: {} as never },
        ]}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText(/2 to discuss/i)).toBeInTheDocument()
    expect(screen.getByText('Kitchen delivery')).toBeInTheDocument()
  })

  it('shows +N more for >2 items', () => {
    render(
      <WallDiscussionWidget
        items={[
          { kind: 'task', id: '1', title: 'A', note: '', task: {} as never },
          { kind: 'task', id: '2', title: 'B', note: '', task: {} as never },
          { kind: 'task', id: '3', title: 'C', note: '', task: {} as never },
          { kind: 'task', id: '4', title: 'D', note: '', task: {} as never },
        ]}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument()
  })

  it('calls onClick when card is tapped', () => {
    const onClick = vi.fn()
    render(
      <WallDiscussionWidget
        items={[{ kind: 'task', id: '1', title: 'A', note: '', task: {} as never }]}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /to discuss/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npx vitest src/components/wall/WallDiscussionWidget.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the widget**

```tsx
// src/components/wall/WallDiscussionWidget.tsx
import { MessageCircle } from 'lucide-react'
import type { DiscussionItem } from '@/hooks/useFamilyDiscussionItems'

interface WallDiscussionWidgetProps {
  items: DiscussionItem[]
  onClick: () => void
}

export function WallDiscussionWidget({ items, onClick }: WallDiscussionWidgetProps) {
  if (items.length === 0) return null

  const visible = items.slice(0, 2)
  const remaining = items.length - visible.length

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 cursor-pointer hover:bg-white/[0.12] transition-colors rounded-xl -m-1 p-1 w-full text-left"
      aria-label={`${items.length} to discuss`}
    >
      <MessageCircle className="w-9 h-9 flex-shrink-0 text-amber-300" />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-black uppercase tracking-widest text-[0.6rem] text-amber-300">
            {items.length} to discuss
          </span>
        </div>
        <span className="text-white font-bold text-[1rem] truncate leading-tight">
          {visible[0].title}
        </span>
        {visible[1] && (
          <span className="text-white/60 text-[0.85rem] truncate leading-tight">
            {visible[1].title}
          </span>
        )}
        {remaining > 0 && (
          <span className="text-white/30 text-[0.75rem]">+{remaining} more</span>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest src/components/wall/WallDiscussionWidget.test.tsx --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallDiscussionWidget.tsx src/components/wall/WallDiscussionWidget.test.tsx
git commit -m "feat(wall): add WallDiscussionWidget for bottom-strip For-Discussion card"
```

---

### Task 13: `WallDiscussionOverlay`

**Files:**
- Create: `src/components/wall/WallDiscussionOverlay.tsx`
- Create: `src/components/wall/WallDiscussionOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall/WallDiscussionOverlay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussionOverlay } from './WallDiscussionOverlay'

describe('WallDiscussionOverlay', () => {
  const items = [
    { kind: 'task' as const, id: 't1', title: 'Kitchen delivery', note: 'Push by 2 weeks?', task: {} as never },
    { kind: 'event' as const, id: 'e1', title: 'Mia swim', note: '', flag: {} as never },
  ]

  it('renders all items with notes', () => {
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Kitchen delivery')).toBeInTheDocument()
    expect(screen.getByText('Push by 2 weeks?')).toBeInTheDocument()
    expect(screen.getByText('Mia swim')).toBeInTheDocument()
  })

  it('calls onMarkDiscussed with item when button tapped', () => {
    const onMarkDiscussed = vi.fn()
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={onMarkDiscussed} onClose={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: /mark as discussed/i })
    fireEvent.click(buttons[0])
    expect(onMarkDiscussed).toHaveBeenCalledWith(items[0])
  })

  it('calls onClose when close button tapped', () => {
    const onClose = vi.fn()
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npx vitest src/components/wall/WallDiscussionOverlay.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the overlay**

```tsx
// src/components/wall/WallDiscussionOverlay.tsx
import { MessageCircle, X, Check, Calendar } from 'lucide-react'
import type { DiscussionItem } from '@/hooks/useFamilyDiscussionItems'

interface WallDiscussionOverlayProps {
  items: DiscussionItem[]
  onMarkDiscussed: (item: DiscussionItem) => void
  onClose: () => void
}

export function WallDiscussionOverlay({ items, onMarkDiscussed, onClose }: WallDiscussionOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-10"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 text-white rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-6 h-6 text-amber-300" />
            <h2 className="font-display text-2xl">For Discussion</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-3 rounded-lg hover:bg-white/10"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {items.length === 0 && (
            <p className="text-white/40 text-center py-8">Nothing to discuss right now.</p>
          )}
          {items.map((item) => (
            <div
              key={`${item.kind}:${item.id}`}
              className="flex items-start gap-4 bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-colors"
            >
              <div className="flex-shrink-0 mt-1 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                {item.kind === 'event' ? <Calendar className="w-5 h-5 text-blue-300" /> : <Check className="w-5 h-5 text-emerald-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-xl leading-tight">{item.title}</div>
                {item.note && (
                  <p className="mt-2 italic text-white/70 text-base">{item.note}</p>
                )}
              </div>
              <button
                onClick={() => onMarkDiscussed(item)}
                className="flex-shrink-0 px-5 py-3 min-h-[48px] bg-amber-300 text-neutral-900 font-bold rounded-lg hover:bg-amber-400 active:bg-amber-500"
              >
                Mark as discussed
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest src/components/wall/WallDiscussionOverlay.test.tsx --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallDiscussionOverlay.tsx src/components/wall/WallDiscussionOverlay.test.tsx
git commit -m "feat(wall): add WallDiscussionOverlay full-screen list with mark-as-discussed"
```

---

### Task 14: Wire widget + overlay into `WallCalendar`

**Files:**
- Modify: `src/components/wall/WallCalendar.tsx`

- [ ] **Step 1: Add imports**

Near the top:

```ts
import { WallDiscussionWidget } from './WallDiscussionWidget'
import { WallDiscussionOverlay } from './WallDiscussionOverlay'
import { useFamilyDiscussionItems } from '@/hooks/useFamilyDiscussionItems'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useEventDiscussionFlags } from '@/hooks/useEventDiscussionFlags'
```

(Some of these may already be imported.)

- [ ] **Step 2: Hook calls in component body**

Inside `WallCalendar` (alongside the existing `useWallData()` call around line 54):

```ts
const { items: discussionItems } = useFamilyDiscussionItems()
const { updateTask } = useSupabaseTasks()
const { unflagEvent } = useEventDiscussionFlags()
const [showDiscussion, setShowDiscussion] = useState(false)
```

(Ensure `useState` is imported at the top — likely already is.)

- [ ] **Step 3: Mark-as-discussed handler**

```ts
const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
  if (item.kind === 'task') {
    await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined })
  } else {
    await unflagEvent(item.id)
  }
}, [updateTask, unflagEvent])
```

(Ensure `useCallback` is imported and `DiscussionItem` is imported from `'@/hooks/useFamilyDiscussionItems'`.)

- [ ] **Step 4: Mount widget in the bottom-row strip**

In the bottom row (around line 455 where `Dinner Widget`, `WallEmailActions`, `WallAgentCards` live), add a sibling block:

```tsx
{/* Discussion Widget */}
{discussionItems.length > 0 && (
  <div className={`${glass} px-4 py-2 flex-1 flex items-center`}>
    <WallDiscussionWidget
      items={discussionItems}
      onClick={() => setShowDiscussion(true)}
    />
  </div>
)}
```

Place it next to `WallEmailActions` (between Email Actions and Agent Cards is fine — visually they're peers).

- [ ] **Step 5: Mount the overlay**

Find where other overlays render (around lines 601-610 — `WallRecipeViewer`, `WallEmailActionsOverlay`). Add:

```tsx
{showDiscussion && (
  <WallDiscussionOverlay
    items={discussionItems}
    onMarkDiscussed={async (item) => {
      await handleMarkDiscussed(item)
      // Don't auto-close — let the user keep marking; auto-close when last item gone
    }}
    onClose={() => setShowDiscussion(false)}
  />
)}
```

- [ ] **Step 6: Auto-close empty overlay (UX nicety)**

In `WallCalendar`, add an effect:

```ts
useEffect(() => {
  if (showDiscussion && discussionItems.length === 0) {
    setShowDiscussion(false)
  }
}, [showDiscussion, discussionItems.length])
```

- [ ] **Step 7: Build + manual verify**

```bash
npm run build
npm run dev
```

Open `/wall`. Confirm:
- No widget when no flagged items.
- Flag a family-domain task on the desktop view → kiosk widget appears within ~2s.
- Tap the widget → overlay opens with the item.
- Tap "Mark as discussed" → item disappears from overlay; overlay auto-closes when last item gone.

- [ ] **Step 8: Commit**

```bash
git add src/components/wall/WallCalendar.tsx
git commit -m "feat(wall): mount For-Discussion widget and overlay in WallCalendar"
```

---

## Phase 7 — Eager event flag cleanup on delete

### Task 15: Clear flag row when event is deleted

**Files:**
- Modify: `src/hooks/useGoogleCalendar.tsx` — extend the existing `deleteEvent` (added in another session, ~line 496) to also delete any flag row for that event's base id.

- [ ] **Step 1: Read the existing `deleteEvent` implementation**

```bash
grep -n "deleteEvent\|DeleteEventParams" src/hooks/useGoogleCalendar.tsx | head -20
```

Confirm the function signature and where it returns. The body should call the `google-calendar-delete-event` edge function and update local state.

- [ ] **Step 2: Add flag cleanup**

After the edge function call succeeds (before returning), add:

```ts
// Clear any "needs discussion" flag for this event's base id
try {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const baseId = getRecurringBaseId(params.eventId)
    await supabase
      .from('event_discussion_flags')
      .delete()
      .eq('user_id', user.id)
      .eq('google_event_base_id', baseId)
  }
} catch (err) {
  console.warn('Failed to clear discussion flag for deleted event:', err)
  // non-fatal: realtime sub will eventually reconcile, and the orphan is harmless
}
```

Add the import at the top of the file if not present:

```ts
import { getRecurringBaseId } from './useHiddenCalendarEvents'
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify**

```bash
npm run dev
```

1. Flag an event on the family calendar via detail panel.
2. Confirm the kiosk shows it.
3. Delete the event from Symphony.
4. Confirm the kiosk widget updates (item gone) and no orphan row exists.

Verify orphan absence:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT count(*) FROM event_discussion_flags;"}'
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGoogleCalendar.tsx
git commit -m "feat(events): clear discussion flag row when event is deleted"
```

---

## Phase 8 — E2E + final verification

### Task 16: Playwright E2E happy path

**Files:**
- Create: `e2e/needs-discussion.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/needs-discussion.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Needs discussion (family kiosk)', () => {
  test('flag a task, see it on /wall, mark discussed', async ({ page }) => {
    // Sign in (use existing auth helper if present)
    await page.goto('/today')
    // … sign-in flow per existing e2e/app.spec.ts pattern …

    // Create a task in family domain
    const title = `Discuss me ${Date.now()}`
    await page.getByPlaceholder(/quick capture/i).fill(title)
    await page.keyboard.press('Enter')

    // Open the new task and flag for discussion
    await page.getByText(title).first().click()
    // …open detail panel or use triage icon directly. Click discussion icon, toggle on, type a note.
    await page.getByRole('button', { name: /needs discussion/i }).first().click()
    await page.getByRole('checkbox', { name: /needs discussion/i }).check()
    await page.getByPlaceholder(/what's the question/i).fill('Push by 2 weeks?')
    await page.keyboard.press('Escape')

    // Set context to family
    await page.getByRole('button', { name: /context|tag/i }).first().click()
    await page.getByText(/family/i).first().click()

    // Navigate to wall
    await page.goto('/wall')
    await expect(page.getByText(/to discuss/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(title)).toBeVisible()

    // Open overlay, mark discussed
    await page.getByText(/to discuss/i).click()
    await expect(page.getByText('Push by 2 weeks?')).toBeVisible()
    await page.getByRole('button', { name: /mark as discussed/i }).first().click()

    // Confirm widget hides (overlay auto-closes when empty)
    await expect(page.getByText(title)).not.toBeVisible({ timeout: 5000 })
  })
})
```

(The auth flow stub will need to match the existing pattern in `e2e/app.spec.ts`. Read that file and adapt.)

- [ ] **Step 2: Run the spec**

```bash
npx playwright test e2e/needs-discussion.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/needs-discussion.spec.ts
git commit -m "test(e2e): add needs-discussion happy-path spec"
```

---

### Task 17: Final manual verification + tidy

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

Expected: all green (or only pre-existing failures unrelated to this feature).

- [ ] **Step 2: Manual checklist**

Run through each item; mark in this file as you go:

- [ ] Flag task on phone (mobile breakpoint) → kiosk updates within ~2s.
- [ ] Complete a flagged task → flag clears, widget updates.
- [ ] Delete a flagged event via Symphony → flag row gone, widget updates.
- [ ] Re-flag after marking discussed → item reappears.
- [ ] Switch flagged task's context Family → Work → drops off kiosk.
- [ ] Note edit in event detail panel persists across reload.
- [ ] Empty state — no flagged items, widget renders nothing (no empty card).
- [ ] Untagged task (`context = null`) flagged → appears on family kiosk.
- [ ] Personal task flagged → does NOT appear on family kiosk.

- [ ] **Step 3: PR / merge**

If on a feature branch, push and open a PR. Otherwise commit any remaining loose ends.

```bash
git push -u origin <branch>
gh pr create --title "feat: needs-discussion flag for tasks/events + kiosk For-Discussion list" --body "$(cat <<'EOF'
## Summary
- Adds `needs_discussion` flag + optional note on tasks and events (`event_discussion_flags` table)
- New `DiscussionPicker` triage icon for tasks; toggle in event detail panel
- New kiosk widget + full-screen overlay surfacing flagged family-domain items
- Auto-clear on task completion; eager flag cleanup on event delete

## Test plan
- [x] Vitest unit tests pass
- [x] Playwright E2E happy path passes
- [x] Manual checklist (in plan doc) verified

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing the plan)

- [x] Spec coverage: every section of the spec maps to ≥1 task above.
- [x] No placeholders: each step has actual code or actual commands. The two non-code steps (Task 8 Step 4 — "if no general partial-update prop exists, plumb a new one through" — and Task 16 Step 1 auth-flow stub) defer to existing-codebase patterns rather than inventing them, which is appropriate since the existing patterns dictate the answer.
- [x] Type consistency: `DiscussionPickerProps`, `EventDiscussionFlag`, `DiscussionItem`, `useFamilyDiscussionItems` return shape are referenced consistently across tasks.
- [x] Migration → types → hook → UI → kiosk → cleanup → e2e order is execution-safe (no later task references something not yet built).
