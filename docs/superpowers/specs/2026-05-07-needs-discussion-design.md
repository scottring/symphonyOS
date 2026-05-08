# Needs-Discussion Designation — Design

**Date:** 2026-05-07
**Status:** Draft (awaiting Scott's review)
**Author:** Claude (with Scott)

---

## Problem

Family life produces a steady drip of items that need a conversation before they can move forward — "Should we push the kitchen delivery?", "Does Mia stay in swim this term?", "Are we going to Iris's parents in July?". These currently sit silently in the inbox or calendar, and conversations either get forgotten or happen in disorganized bursts.

The kitchen kiosk is the natural place for these discussions to surface, because that's where Scott and Iris stand together with attention to spare. Symphony needs a lightweight way to flag tasks and events as "needs discussion," then optionally surface them on the kiosk's For Discussion list.

## Solution overview

Add a "needs discussion" flag to **tasks** (column on `tasks` table) and **events** (parallel `event_discussion_flags` table keyed by `google_event_base_id`, mirroring `hidden_calendar_events`). Each flag carries an optional free-text note for the question/context.

Flagging happens in two places:
1. **Tasks:** a 4th triage icon (`MessageCircle`, Lucide) joining 📅 🏷️ 👤 in the existing row, opening a popover with note + flag toggle.
2. **Events:** a toggle in `DetailPanelRedesign.tsx` event view, with an inline note field.

The kiosk surfaces flagged items via a new `WallDiscussionWidget` mounted in `WallSwimlane` (alongside `WallDinnerPromptWidget`, `WallEmailActions`, `WallAgentCards`). The widget is hidden when empty, shows a count + first items when populated, and expands to a full overlay (`WallDiscussionOverlay`) where each item has a "Mark as discussed" button.

The kiosk only shows family-domain items (`context = 'family' OR context IS NULL` for tasks; `calendar_domain_mappings.domain = 'family'` joined for events).

Items leave the list when:
- The user marks them discussed on the kiosk (clears the flag).
- The underlying task is completed (auto-clear in the existing completion path).
- The user manually unflags from triage icon / detail panel.
- The underlying event is deleted (eager cleanup in the `deleteEvent` flow).

## Data model

### Tasks — new columns

Migration: `supabase/migrations/091_tasks_needs_discussion.sql`

```sql
ALTER TABLE tasks
  ADD COLUMN needs_discussion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN discussion_note TEXT;

-- Optional partial index for the kiosk query
CREATE INDEX idx_tasks_needs_discussion
  ON tasks (user_id, context)
  WHERE needs_discussion = TRUE;
```

Existing tasks RLS continues to apply — no policy changes.

### Events — new table

Migration: `supabase/migrations/092_event_discussion_flags.sql`

```sql
CREATE TABLE event_discussion_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_base_id TEXT NOT NULL,
  event_title TEXT,
  calendar_id TEXT,
  discussion_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, google_event_base_id)
);

CREATE INDEX idx_event_discussion_flags_user_calendar
  ON event_discussion_flags (user_id, calendar_id);

ALTER TABLE event_discussion_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own discussion flags"
  ON event_discussion_flags
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Keying by `google_event_base_id` (using the existing `getRecurringBaseId` helper from `useHiddenCalendarEvents.ts`) means flagging once flags the whole recurring series.

### TypeScript types

`src/types/task.ts` — extend `Task`:

```ts
export interface Task {
  // ... existing fields
  needsDiscussion?: boolean
  discussionNote?: string
}
```

New type: `src/types/eventDiscussion.ts` (or fold into an existing types file):

```ts
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

## Component design

### Triage icon — `src/components/triage/DiscussionPicker.tsx`

New picker matching the shape of `WhenPicker` / `ContextPicker` / `AssignPicker`. Renders the `MessageCircle` Lucide icon (filled when `needsDiscussion === true`). Opens a popover with:

- Textarea: placeholder "What's the question?" — bound to `discussionNote`. Empty allowed.
- Checkbox / toggle: "Needs discussion" — bound to `needsDiscussion`.
- Save on close (or debounced); follow whatever the existing pickers do.

Wired into the icon row inside `ScheduleItem.tsx` and `InboxTaskCard.tsx`. Maintain consistent ordering: `📅 🏷️ 👤 💬`.

### Task card display

When a task has `needsDiscussion === true`:
- Add a small `MessageCircle` indicator badge near the title (style consistent with how `isWaiting` is indicated, if it has a visual marker).
- If `discussionNote` is set, show the note as a chip beneath the title alongside `#Project` and `@Person` chips, truncated to ~40 chars with full text in `title` attribute.

### Event detail panel toggle

In `DetailPanelRedesign.tsx`'s event view section, add a row beside the existing event-side toggles (`onHideEvent`, calendar reassignment):

- Toggle: "Needs discussion" — wired to `useEventDiscussionFlags()`.
- When toggled on, reveal an inline textarea below for the optional note.
- Toggle off → delete the flag row entirely (any note is lost; that's expected — the user is unflagging).

### Hooks

**`useSupabaseTasks` (extend existing):**
- Read `needs_discussion`, `discussion_note` columns into the `Task` shape (snake_case → camelCase).
- New mutator: `setTaskDiscussion(taskId, { needsDiscussion, discussionNote })`.
- In `toggleTaskComplete` / equivalent, when `completed` flips false→true, also set `needs_discussion = false` and `discussion_note = null`.

**`useEventDiscussionFlags` (new):** mirrors `useHiddenCalendarEvents.ts`.

```ts
export function useEventDiscussionFlags() {
  // fetch on mount, subscribe to realtime changes
  return {
    flags: EventDiscussionFlag[],
    flagsByBaseId: Map<string, EventDiscussionFlag>,
    loading: boolean,
    isFlagged: (googleEventId: string) => boolean,
    flagEvent: (googleEventId: string, opts: { title?: string, calendarId?: string, note?: string }) => Promise<void>,
    unflagEvent: (googleEventId: string) => Promise<void>,
    updateNote: (googleEventId: string, note: string) => Promise<void>,
  }
}
```

Use `getRecurringBaseId` (already exported from `useHiddenCalendarEvents.ts`) for ID normalization.

### Kiosk widget — `src/components/wall/WallDiscussionWidget.tsx`

Mounted in `WallCalendar.tsx` inside the existing swimlane area (around `WallSwimlane` at line 435), alongside `WallDinnerPromptWidget`, `WallEmailActions`, `WallAgentCards`.

```
[ MessageCircle  3 to discuss ]
  Kitchen delivery timing
  Mia's swim — drop this term?
  +1 more
```

- **Hidden state:** when no flagged items match the family-domain filter, return `null`.
- **Card body:** count + first 2 item titles (truncated). "+N more" if > 2.
- **Tap:** opens `WallDiscussionOverlay`.
- **Styling:** existing kiosk-design conventions — cream card, warm shadow, ≥48px tap target on the whole card.

### Kiosk overlay — `src/components/wall/WallDiscussionOverlay.tsx`

Mirrors `WallEmailActionsOverlay` pattern. Full-screen-ish modal with:

- Title: "For Discussion"
- List of items, each row:
  - Source icon (✓ for task, calendar icon for event)
  - Item title (large, serif — Nordic Journal style)
  - Discussion note in italic body type beneath, if set
  - Right side: "Mark as discussed" button (≥48px tall)
  - Tapping the row body (not the button) opens `WallItemDetail` for context
- Close button (top-right or swipe-down)

### Kiosk queries

Combined into a single hook `useFamilyDiscussionItems()` (or fold into `useWallData`):

```ts
// Tasks
SELECT id, title, context, project_id, /* ... */, discussion_note
FROM tasks
WHERE user_id = $1
  AND needs_discussion = TRUE
  AND (context = 'family' OR context IS NULL)
  AND completed = FALSE;

// Events
SELECT edf.*
FROM event_discussion_flags edf
JOIN calendar_domain_mappings cdm
  ON cdm.user_id = edf.user_id
  AND cdm.calendar_id = edf.calendar_id
WHERE edf.user_id = $1
  AND cdm.domain = 'family';
```

Realtime subscriptions on both tables (filtered to `user_id`) keep the widget live.

## Lifecycle

| Trigger                                  | Effect on flag                                       |
| ---------------------------------------- | ---------------------------------------------------- |
| User taps triage icon (task)             | Toggle `needs_discussion`, persist note              |
| User toggles event detail panel switch   | Insert/delete `event_discussion_flags` row           |
| User taps "Mark as discussed" on kiosk   | Clear flag (task UPDATE / event row DELETE)          |
| Task is completed                        | Auto-clear `needs_discussion` and `discussion_note`  |
| Task is uncompleted                      | No re-flag (rare, intentional no-op)                 |
| Task is deleted                          | Flag goes with the row (no extra work)               |
| Event is deleted (via `deleteEvent`)     | Eager delete of flag row by `google_event_base_id`   |
| Domain change on a flagged task          | Widget reflects new domain on next realtime update   |
| Calendar disconnects                     | Flagged events silently disappear (rejoin on reconnect)|

## Known limitations (v1)

1. **Recurring events flag the whole series only.** No per-instance flagging. Users can qualify in the note ("Tuesday only..."). Acceptable.
2. **No "discussion history."** Once marked discussed, the flag is gone — no log of what was decided. Out of scope.
3. **No assignment to a specific person.** "Discuss with X" not modeled. The note can carry that. Out of scope.
4. **No work-domain kiosk.** Discussion items in the work or personal domain don't surface anywhere visual yet — they're only visible in the source list (e.g., the task with the badge). Future work could add a Today-view discussion section.
5. **Wall card sort order** is "newest flagged first" by default — no manual reordering.

## Surface area summary

**New files:**
- `supabase/migrations/091_tasks_needs_discussion.sql`
- `supabase/migrations/092_event_discussion_flags.sql`
- `src/components/triage/DiscussionPicker.tsx`
- `src/hooks/useEventDiscussionFlags.ts`
- `src/components/wall/WallDiscussionWidget.tsx`
- `src/components/wall/WallDiscussionOverlay.tsx`
- `src/components/triage/DiscussionPicker.test.tsx`
- `src/hooks/useEventDiscussionFlags.test.ts`
- `src/components/wall/WallDiscussionWidget.test.tsx`
- `src/components/wall/WallDiscussionOverlay.test.tsx`
- `e2e/needs-discussion.spec.ts`
- (Optional) `src/types/eventDiscussion.ts`

**Modified files:**
- `src/types/task.ts` — add `needsDiscussion`, `discussionNote`
- `src/hooks/useSupabaseTasks.ts` — read/write new columns; auto-clear on completion
- `src/components/schedule/ScheduleItem.tsx` — add `DiscussionPicker` to triage row
- `src/components/schedule/InboxTaskCard.tsx` — add `DiscussionPicker` to triage row
- `src/components/detail/DetailPanelRedesign.tsx` — event-side toggle + inline note
- `src/components/wall/WallCalendar.tsx` — mount `WallDiscussionWidget` in swimlane
- `src/hooks/useGoogleCalendar.tsx` — extend `deleteEvent` to clear `event_discussion_flags` row
- (Possibly) `src/hooks/useWallData.ts` — fold discussion-items query in, or add a sibling hook

## Testing

**Unit (Vitest):**
- `DiscussionPicker.test.tsx` — toggle on/off, note edit, close behavior.
- `useSupabaseTasks` test extension — `needs_discussion` round-trip, auto-clear on completion.
- `useEventDiscussionFlags.test.ts` — CRUD + base-id keying, realtime sub.
- `WallDiscussionWidget.test.tsx` — empty hides, populated shows, count math, family-domain filter.
- `WallDiscussionOverlay.test.tsx` — list renders, mark-as-discussed optimistic + rollback on error.

**E2E (Playwright):** `e2e/needs-discussion.spec.ts`
1. Create a task, flag it via triage icon with a note.
2. Navigate to `/wall`.
3. Confirm widget shows the flagged item.
4. Tap "Mark as discussed."
5. Confirm widget hides.

(No event E2E in v1 — Google Calendar mocking not established.)

**Manual checklist (in the implementation plan, before merge):**
- [ ] Flag task on phone → kiosk updates within ~2s.
- [ ] Complete a flagged task → flag clears, widget updates.
- [ ] Delete a flagged event via Symphony → flag row gone, widget updates.
- [ ] Re-flag after marking discussed → item reappears.
- [ ] Switch flagged task's context Family → Work → drops off kiosk.
- [ ] Note edit in detail panel persists across reload.
- [ ] Empty state — no flagged items, widget renders nothing (no empty card).

## Open questions

None outstanding for v1. Brainstorming session resolved:
- Scope = tasks + events.
- Note = optional free-text.
- Lifecycle = mark-as-discussed on kiosk + auto-clear on task completion + manual unflag.
- Flagging UI = 4th triage icon for tasks, detail-panel toggle for events.
- Kiosk = `WallSwimlane` widget card → overlay.
- Kiosk domain filter = family + untagged.
- Recurring = series-level only (note carries instance qualifiers).
- Event orphan cleanup = eager (in `deleteEvent` flow).

## Out of scope / future work

- Per-instance recurring flag.
- Discussion history / log of resolutions.
- Assignment of discussion items to a specific household member.
- Work-domain discussion surface (desktop Today view section, work kiosk, etc.).
- Manual reordering on the kiosk overlay.
- Notification push when a new item is flagged (e.g., "Iris flagged 'Kitchen delivery'").
