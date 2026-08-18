# "To buy": purchases leave the timeline — design

**Date:** 2026-08-18 · **Approved by:** Scott (options chosen in conversation,
"what do you think?" → native-list recommendation confirmed)

## Problem

"Buy pull ups" is a task, so it renders as a timeline row and rots in
carried-over between dated commitments. A purchase isn't a 9:10 AM commitment —
it's a whenever-someone's-near-a-store item, and it needs to be visible to the
household, not buried in one person's day.

## Design

1. **One native, family-shared list — "To buy"** (`category: shopping`,
   `visibility: family`), created lazily by the first conversion. Deliberately
   NOT the Apple-bridged Groceries list: the bridge resurrects deleted rows,
   and Groceries is grocery-run-scoped in this household.
2. **Suggest-and-confirm detection** (`src/lib/lists/toBuy.ts`): a task title
   leading with buy / pick up / order / purchase ("get" excluded — too broad)
   grows a one-tap `ToBuyNudge` under its row, on Today rows AND carried-over
   rows. Nothing moves without the tap; "Not now" dismisses persistently
   (localStorage, per-device accepted for v1).
3. **Convert, don't copy** (`sendTaskToBuy` in HomeViewContainer, exposed as
   `ctx.onSendTaskToBuy`): create the list item (verb stripped: "buy pull ups"
   → "Pull ups"; task notes carried onto the item), DELETE the task, show an
   undo toast. Undo removes the item and re-inserts the task via `addTask`
   (optimistic state + local write bus stay honest). Same one-place semantics
   as inbox send-to-calendar.
4. **One fixed-budget line on Today** (`ToBuyLine`): "To buy · N" (open
   items), above the backlog footer. Tap → `/lists?list=<id>`, a new reactive
   deep-link param in `ListsContext` (one-shot, stripped after applying).
   The line reads the shared `ListsContext` — not a private `useLists()` —
   because the lazily-created list otherwise stays invisible until a reload
   (found live in the browser). Same-tab count freshness via a
   `symphony:tobuy-changed` window event.

## Also in this change

The Add-to-today input and the collapsed suggestions line moved INSIDE the
day card, at its top — floating between the masthead and the card they read
as orphaned chrome and cost a band of empty page ("hanging in mid air").

## Deliberately not in v1

Capture-time detection in the add input (the row nudge catches new tasks
seconds later), auto-classification, per-item list pickers, wall changes
(the existing list-pinning covers it), syncing "To buy" to Apple Reminders.
