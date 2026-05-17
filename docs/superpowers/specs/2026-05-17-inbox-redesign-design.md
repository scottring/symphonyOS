# Inbox + This-Week Popover Redesign — Forced "When?" Triage

**Date:** 2026-05-17
**Status:** Spec — pending review
**Branch:** feat/surface-future

**Scope:** Two related surfaces that share a row component:
1. **Inbox view** (`InboxView.tsx`) — forced "when?" triage with dense rows + focus mode.
2. **"This Week" popover** (`StagingFloat.tsx` on the Today page) — same dense row, different quick-action set, scoped to week-bucket items only.

---

## Problem

### Inbox view

The Inbox view is the daily triage surface, but at 30+ items it feels slow and ugly. Concretely:

- **Triage actions are hidden.** The defer, schedule, and list pickers only appear on hover; on touch they're invisible. The user can't see destinations.
- **Drop-zone buckets only appear during drag.** "Today / Week / Month / Someday" are the actual triage targets, but they aren't visible at rest — discovery requires picking up an item first.
- **Every card looks the same.** Title + project chip dominates; context (work/family/personal), age, and assignee live behind icons. Hard to scan.
- **No keyboard shortcuts** for the most common decision.
- **Vertical density is poor.** 5–7 cards fit per screen on a 13" laptop. With 34 items, triage requires constant scrolling.

The redesign keeps the underlying data model unchanged and replaces the row-interaction model.

### "This Week" popover (on Today page)

The "This week 27" pill at the top of the Today page opens a popover (`StagingFloat`) that conflates two distinct things into one list:

- 23 items with `bucket: 'inbox'` (unprocessed)
- 4 items with `bucket: 'week'` (already triaged to this week)

This makes the popover misleading — it claims to be "This Week" but is mostly an inbox spillover. The popover also has limited per-row actions (just pull-to-today and an overflow menu); you can't push to next week, demote to someday, or change context from here. Visually it uses a simpler row anatomy than the Inbox cards, creating inconsistency between surfaces.

---

## Design Philosophy

**One forced question: When?**

Triage = answer "when does this happen?" Period. Everything else (context, assignee, project, notes) becomes optional and can be set inline, but is never required to clear an item from inbox. This is the single behavioral change that makes triage fast: the user doesn't decide *what kind* of triage to do per item — they always answer the same question.

Secondary actions stay available but visually subordinate. The user can tap a small dot to set context, or open the detail panel for everything else.

---

## Modes: Dense list (default) + Focus mode (toggle)

The header has a mode toggle. Default is dense list; the user can switch to focus mode for high-volume sessions.

### Dense list (default)

A vertical list of single-row cards. Each row shows everything at a glance and exposes the four "when" buttons inline.

**Row anatomy (left → right):**

```
[ ○ ] [●] Figure out bike storage    [📁 Backyard upgrade ×]   [👤 SK]   [Today] [Week] [Month] [Someday]   [×]   [⋯]
```

| Element | Purpose | Interaction |
|---|---|---|
| Checkbox (`○`) | Mark complete | Click — strikes through + removes from inbox |
| Context dot (`●`) | Domain at-a-glance (color) | Click — popover: Work / Family / Personal / Clear |
| Title | Task title | Click — opens detail panel for full editing |
| Project chip | Project assignment (if any) | Click chip body — open project; click × — clear assignment; absent → "+" button opens project picker |
| Assignee avatar | Who handles it (if any) | Click — popover: family member picker |
| "When" buttons | The forced triage decision | Click — sets bucket and removes row from inbox view |
| `×` button | Delete | Click — soft delete (recoverable from undo toast) |
| `⋯` overflow | Less-common actions | Popover: needs-discussion, send to list, schedule specific date, add note |

**The four "when" buttons map to existing buckets:**

- **Today** → `bucket: 'timed'`, `scheduledFor: today`, `isAllDay: true`
- **Week** → `bucket: 'week'`
- **Month** → `bucket: 'month'`
- **Someday** → `bucket: 'quarter'`

*Note: the layout mockup shown during brainstorming displayed three buttons (Today/Week/Someday); this spec uses four to match the existing data model and the focus-mode `1`/`2`/`3`/`4` keyboard mapping. If during implementation the four-button row feels cramped at the laptop breakpoint, fallback is to collapse Month into Someday in the dense row only — focus mode keeps all four.*

**Visual hierarchy:**

- "When" buttons are the visually dominant action group. Slight color emphasis on Today (warm green background) — it's the "do something" choice.
- Other actions (context dot, assignee, project chip, `×`, `⋯`) are smaller and neutral-toned.
- Hover on the row brightens the "when" buttons; no other reveal-on-hover (everything important is always visible).

**Row layout responsive behavior:**

- ≥ 768px: one-line row exactly as above.
- < 768px: title wraps to a second line if needed; project/assignee chips drop to row 2; the four "when" buttons compress to two rows of two if necessary. Touch targets remain ≥ 36px.

**On triage (row removed from inbox view):**

- 200ms fade + 50ms collapse-height animation.
- Inbox count decrements immediately.
- A toast appears bottom-left: *"Sent to Week · Undo"* — visible for 5 seconds, dismissible.
- Undo reverts the bucket change.

**Empty state ("inbox zero"):**

Unchanged from current — keep the checkmark hero and "Press Cmd+K to capture something" hint.

---

### Focus mode (toggle)

One large card at a time, deck-style. Optimized for keyboard-only crushing.

**Layout:**

```
┌──────────────────────────────────────────────────┐
│ CARD 3 OF 34                                     │
│                                                  │
│ Figure out bike storage                          │
│                                                  │
│ [Family] [📁 Backyard upgrade] [👤 Scott] [+note]│
│                                                  │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │  1   │ │  2   │ │  3   │ │  4   │              │
│ │Today │ │ Week │ │Month │ │Someday│              │
│ │Do it │ │ Soon │ │ Eventually │ │No rush│        │
│ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                  │
│ ← back · → skip                  delete · D      │
└──────────────────────────────────────────────────┘
```

**Keyboard shortcuts (focus mode only):**

| Key | Action |
|---|---|
| `1` | Send to Today |
| `2` | Send to Week |
| `3` | Send to Month |
| `4` | Send to Someday |
| `D` or `Backspace` | Delete |
| `→` or `Space` | Skip (advance without triaging) |
| `←` | Back to previous card |
| `Enter` | Open detail panel for this item |
| `Esc` | Exit focus mode → return to dense list |

After any triage action (`1`–`4`, `D`), auto-advance with a 150ms slide-out animation. When the last card is processed, show "Inbox zero" celebration.

**Optional chips above the buttons** (Family / Project / Assignee / + note) are clickable but never required.

---

---

## "This Week" popover redesign (Today page)

The popover stays as the right surface for a quick peek from inside the Today page (the full Week tab in the upper-right covers deep-dive needs). It gets rescoped, restyled, and gets the same dense row anatomy as Inbox — with a different quick-action set since these items are already in the Week bucket.

### Surface changes on the Today page

The current single "This week 27" pill becomes **two pills**:

```
[ 📥 Inbox 23 ]   [ 📅 This week 4 ]
```

- **Inbox pill** — clicking navigates to the Inbox view. Replaces the "go to inbox" link buried in the current StagingFloat menu. Hidden when count is 0.
- **This week pill** — opens the popover described below. Hidden when count is 0.

Both pills live in the same place where the current combined pill sits (mobile: compact header; desktop: stats row).

### Popover content

The popover (`StagingFloat`) is rescoped to **only show items with `bucket: 'week'`** — no inbox items, no mixing.

**Header:** "This Week · 4 items"

**Body:** vertical list of `DenseInboxRow` components (same component as Inbox view, different `quickActions` prop).

**Quick-action set for this surface** (replaces the inbox set):

| Button | Action |
|---|---|
| **Today** | Promote to today — `bucket: 'timed'`, `scheduledFor: today`, `isAllDay: true` |
| **Next Week** | Bump out one week — keep `bucket: 'week'`, update sort order so the item appears at the bottom (so we can distinguish "deferred again" from "fresh this week"). Implementation: set `weekDeferredAt: new Date()` field on task (new metadata field). |
| **Someday** | Demote — `bucket: 'quarter'` |
| **×** | Delete (soft, with undo toast) |

**Same animation + undo behavior as inbox:** 200ms fade-out, count decrements, undo toast bottom-left for 5s.

**Empty state:** "Nothing scheduled this week."

The popover keeps its current dismiss behavior (click outside, Esc).

### Out of scope for the popover

- Focus-mode for the popover. Focus mode is Inbox-only — week items are typically few and don't need batch processing.
- Drag-and-drop within the popover.
- A new `weekDeferredAt` field beyond the simple Date type — sorting logic is plain "rows without `weekDeferredAt` first, then by `weekDeferredAt` ascending."

---

## Preserved features

These current Inbox capabilities remain unchanged:

- **`HomeNeedsDetailsSection`** at the top of the view (items flagged as needing more details before triage)
- **`AssigneeFilter`** in the header (filter by who)
- **Domain filter** from the sidebar (universal / work / family / personal)
- **Privacy filtering** (work/personal items only visible to assignee)
- **Bucket sections below "New"** — items already deferred to Week / Month / Someday remain visible in collapsed sections below the New list. Click a section header to expand. This preserves user visibility into what they've deferred without making bucket items the focus.

## Removed features

- **Drag-and-drop to bucket zones** — replaced by the four "when" buttons. The DnD code (`@dnd-kit/core` usage in `InboxView.tsx`) is removed.
- **Hover-only triage icons** on `InboxTaskCard` (DeferPicker, SchedulePopover, ListPicker hover row) — replaced by always-visible "when" buttons + overflow menu.
- **The 2×2 drop-zone grid** that appears during drag — no longer needed.

## Out of scope

- Mobile-specific reflow beyond the responsive rules above (touch target sizing, two-row layout) — full mobile redesign is future work.
- Multi-select / bulk triage — possible future enhancement; not in this redesign.
- Changes to the bucket data model or new buckets.
- Changes to `HomeNeedsDetailsSection` or the "needs details" flow.
- A dedicated "This Week" or "Someday" view.

---

## Component changes

```
src/components/schedule/
├── InboxView.tsx              ← MAJOR REWRITE: remove DnD, add mode toggle, render dense or focus
├── InboxTaskCard.tsx          ← UNCHANGED: still used by TodaySchedule + InboxSection
├── DenseInboxRow.tsx          ← NEW: shared single-row component (used by InboxView AND StagingFloat)
├── FocusInboxCard.tsx         ← NEW: focus-mode large card with keyboard handler
├── InboxModeToggle.tsx        ← NEW: header toggle between dense / focus (Inbox only)
├── InboxUndoToast.tsx         ← NEW: 5-second undo notification (used by both surfaces)
├── StagingFloat.tsx           ← REWRITE: scope to weekTasks only, render DenseInboxRow with week quick-actions
└── TodaySchedule.tsx          ← MINOR: split combined pill into two (Inbox + This Week), wire navigation

src/components/triage/
├── DeferPicker.tsx            ← UNCHANGED (still used elsewhere)
└── (other pickers unchanged)
```

**`InboxTaskCard.tsx` is NOT modified.** It is still used by `TodaySchedule.tsx` and `InboxSection.tsx`. Modifying it would break those views — out of scope for this redesign.

### `DenseInboxRow` — the shared row component

Used by both Inbox view and "This Week" popover. The component's props expose the row data + a configurable quick-action set:

```tsx
type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }   // bumps an item already in week-bucket out by 1 week
  | { kind: 'delete' }

interface DenseInboxRowProps {
  task: Task
  project?: Project
  familyMembers: FamilyMember[]
  quickActions: QuickAction[]              // surface-specific button set
  onQuickAction: (action: QuickAction) => void
  onToggleComplete: () => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void                     // open detail panel
  onOpenProject?: (projectId: string) => void
  onAssign?: (memberIds: string[]) => void
  isLeaving?: boolean                      // triggers 200ms fade-out CSS transition
}
```

- **Inbox surface** passes `quickActions: [{kind:'today'}, {kind:'week'}, {kind:'month'}, {kind:'someday'}, {kind:'delete'}]`
- **This Week popover** passes `quickActions: [{kind:'today'}, {kind:'next-week'}, {kind:'someday'}, {kind:'delete'}]`

The component maps each action to a labeled button with consistent styling. The owning view handles the data update + animation + undo toast.

**Animation primitives:** use `framer-motion`'s `AnimatePresence` + `motion.div` for the fade-out-and-collapse on triage. Already a dependency.

**Keyboard handling:** focus mode mounts a `useEffect` that adds a `keydown` listener; cleaned up on unmount. Dense mode has no global keyboard shortcuts (rows are not "selected" in dense mode; future enhancement could add J/K navigation).

**Mode toggle persistence:** save preference to `localStorage` (`symphony.inbox.mode` = `"dense" | "focus"`).

---

## Visual style

The redesign is a layout + interaction change, not a re-skin. The existing **Nordic Journal** design system is preserved — same colors, same Fraunces/DM Sans pairing, same `.card` shadow language. Specifically:

- "Today" button uses `bg-primary-50` (warm green tint) for active emphasis.
- "Week / Month / Someday" buttons use `bg-neutral-50` neutral.
- Context dots reuse existing `DOMAIN_COLORS` palette.
- Rows use `bg-white` with `border-neutral-100`, same as current cards.
- Focus mode card uses the existing `.card` class with extra padding.

---

## Testing strategy

**Unit tests** (Vitest):

- `DenseInboxRow.test.tsx` — renders row anatomy; renders the supplied `quickActions` button set (inbox set vs. week set); clicking each button calls `onQuickAction` with the right kind; project chip absent renders "+" button; `isLeaving` applies the fade-out class.
- `FocusInboxCard.test.tsx` — keyboard shortcuts trigger the right actions; auto-advance fires `onAdvance` callback; back button decrements index; Esc fires `onExit`.
- `InboxModeToggle.test.tsx` — toggling updates localStorage and switches mode.
- `InboxUndoToast.test.tsx` — appears for 5s, undo callback fires, toast dismissible by ×.
- `StagingFloat.test.tsx` — popover renders only week-bucket tasks; clicking "Today" calls `onPullToToday`; clicking "Next Week" calls update with `weekDeferredAt`; clicking "Someday" sets `bucket: 'quarter'`; empty state renders.
- `InboxTaskCard.test.tsx` — UNCHANGED (component is unchanged).

**Integration tests** (Vitest):

- `InboxView` renders correct mode based on localStorage preference.
- Triaging an item in dense mode removes it from view with animation and shows undo toast.
- Undoing reverts the bucket and re-inserts the row.
- The "needs details" section, assignee filter, and domain filter still function.
- `TodaySchedule` renders two separate pills (Inbox + This Week) with correct counts.
- Clicking the Inbox pill navigates to inbox view (route change or `onSelectItem` analog).

**E2E** (Playwright):

- Dense mode: click "Week" on a row → row disappears, "Sent to Week · Undo" toast shows, count decrements.
- Focus mode: press `1` → next card appears.
- Mode toggle persists across reload.
- This Week popover: open from Today page, click "Today" on an item → item disappears from popover and appears in today's schedule.
- Inbox pill: click → routes to Inbox view.

---

## Migration / rollout

- Bucket values (`'inbox' | 'timed' | 'week' | 'month' | 'quarter'`) are unchanged.
- **New optional field on Task:** `weekDeferredAt?: Date` — only set when the user clicks "Next Week" in the This Week popover on an item already in the week bucket. Used for sort order (deferred items sink to the bottom of the popover). Nullable, no migration needed for existing tasks.
- This is a single PR. Feature-flag not necessary — the new design is strictly better and there's no user base depending on the old UX.
- Existing E2E tests that exercise drag-and-drop or the combined StagingFloat will be updated or replaced.

---

## Open questions

1. **"Today" button behavior when item is already today-scheduled** — visually highlight as "current"? Or hide? *Proposed: visually highlight the active bucket button if the item already lives there, so re-clicking it is a no-op.*
2. **What happens when a triaged item gets re-edited and put back in inbox bucket** — currently this is possible via detail panel. *No change needed — flows the same way through detail panel.*
3. **Should focus mode have a "go back to dense" button visible in the UI**, in addition to Esc? *Proposed: yes — small "List view" link in the header of focus mode.*

These are minor and can be resolved during implementation.
