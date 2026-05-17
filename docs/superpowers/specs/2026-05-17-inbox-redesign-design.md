# Inbox Redesign — Forced "When?" Triage

**Date:** 2026-05-17
**Status:** Spec — pending review
**Branch:** feat/surface-future

---

## Problem

The Inbox view is the daily triage surface, but at 30+ items it feels slow and ugly. Concretely:

- **Triage actions are hidden.** The defer, schedule, and list pickers only appear on hover; on touch they're invisible. The user can't see destinations.
- **Drop-zone buckets only appear during drag.** "Today / Week / Month / Someday" are the actual triage targets, but they aren't visible at rest — discovery requires picking up an item first.
- **Every card looks the same.** Title + project chip dominates; context (work/family/personal), age, and assignee live behind icons. Hard to scan.
- **No keyboard shortcuts** for the most common decision.
- **Vertical density is poor.** 5–7 cards fit per screen on a 13" laptop. With 34 items, triage requires constant scrolling.

The redesign keeps the underlying data model unchanged and replaces the row-interaction model.

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
├── InboxTaskCard.tsx          ← REWRITE: new dense row anatomy (one line, "when" buttons inline)
├── DenseInboxRow.tsx          ← NEW: extracted dense-mode row component
├── FocusInboxCard.tsx         ← NEW: focus-mode large card with keyboard handler
├── InboxModeToggle.tsx        ← NEW: header toggle between dense / focus
└── InboxUndoToast.tsx         ← NEW: 5-second undo notification after triage

src/components/triage/
├── DeferPicker.tsx            ← KEEP but no longer used inside InboxTaskCard
└── (other pickers unchanged)
```

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

- `DenseInboxRow.test.tsx` — renders row anatomy correctly; clicking each "when" button calls `onUpdate` with correct bucket/scheduledFor; clicking `×` calls `onDelete`; project chip absent renders "+" button.
- `FocusInboxCard.test.tsx` — keyboard shortcuts trigger the right actions; auto-advance fires `onAdvance` callback; back button decrements index.
- `InboxModeToggle.test.tsx` — toggling updates localStorage and switches the rendered mode.
- `InboxUndoToast.test.tsx` — appears for 5s, undo reverts the bucket change, toast dismissible.
- Update `InboxTaskCard.test.tsx` — adapt to the new row anatomy; remove DnD-related test cases.

**Integration tests** (Vitest):

- `InboxView` renders correct mode based on localStorage preference.
- Triaging an item in dense mode removes it from view with animation and increments the appropriate bucket section.
- The "needs details" section, assignee filter, and domain filter still function unchanged.

**E2E** (Playwright):

- Dense mode: click "Week" on a row → row disappears, "Sent to Week · Undo" toast shows, count decrements.
- Focus mode: press `1` → next card appears.
- Mode toggle persists across reload.

---

## Migration / rollout

- No data migration required. Bucket values (`'inbox' | 'timed' | 'week' | 'month' | 'quarter'`) are unchanged.
- This is a single PR. Feature-flag not necessary — the new design is strictly better and there's no user base depending on the old UX.
- Existing E2E tests that exercise drag-and-drop will be updated or replaced.

---

## Open questions

1. **"Today" button behavior when item is already today-scheduled** — visually highlight as "current"? Or hide? *Proposed: visually highlight the active bucket button if the item already lives there, so re-clicking it is a no-op.*
2. **What happens when a triaged item gets re-edited and put back in inbox bucket** — currently this is possible via detail panel. *No change needed — flows the same way through detail panel.*
3. **Should focus mode have a "go back to dense" button visible in the UI**, in addition to Esc? *Proposed: yes — small "List view" link in the header of focus mode.*

These are minor and can be resolved during implementation.
