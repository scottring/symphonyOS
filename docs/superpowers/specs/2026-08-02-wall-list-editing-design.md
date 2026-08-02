# Editing lists on the kitchen wall

**Date:** 2026-08-02
**Status:** Approved design, ready for planning
**Surface:** WallV2 kiosk (`/wall-v2`, Raspberry Pi touchscreen, TV-mounted at ~8ft)

## Problem

Lists live in Symphony (`lists` / `list_items`) and sync bidirectionally with Apple
Reminders, but the kiosk cannot touch them. Standing in the kitchen realizing
you're out of milk means picking up a phone. The wall is the right place to
capture that, and it already has a hardware keyboard attached.

## Scope

**In:** add, check off, edit the text of, and delete *items* on family-visible
lists from the wall; choose which lists the wall shows by pinning them.

**Out:** creating, renaming, or deleting whole lists (rare, deliberate work —
do it on desktop or phone); personal (`visibility: 'self'`) lists; sub-items;
reordering; notes on items.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Which lists | Family-visible only (`visibility === 'family'`) — Groceries, Need now, Mom's Super Market | The wall is an always-on shared display a guest can read. Personal lists don't belong on it. These are also the Apple-synced ones. |
| Text entry | Plain text input, hardware keyboard | A USB keyboard lives at the wall. No on-screen keyboard to build. The wall mic was deliberately disabled 2026-05-25 (kids), so voice is not an input path. |
| Placement | Dock button → full-screen sheet, plus a card per pinned list | Matches the existing `WallV2PhoneScreen` / `WallDiscussionOverlay` overlay pattern. |
| Visibility | Nothing shows until a list is pinned | The wall face is scarce; the family opts a list onto it. |
| Pin storage | Wall-local (`localStorage`), separate from `pinned_items` | What's on the kitchen display is a wall decision, not a personal-sidebar one. |
| Tap on item | Toggles complete | Mirrors Apple Reminders; syncs back as checked. |
| Completed items | Collapsed `Done (N)` section + explicit `Clear done` | Groceries carries ~150 completed items never cleared. This finally flushes them. |
| List CRUD | Not on the wall | Keeps a destructive whole-list delete off a screen the kids use. |

## Architecture

### What already exists (do not rebuild)

`src/hooks/useListItems.ts` already provides `addItem`, `updateItem`,
`deleteItem`, `clearCompleted`, and `reorderItems`, all with optimistic updates
and rollback on error. `clearCompleted` already carries the comment that deletes
propagate to Apple Reminders via the bridge. **This feature adds no data-layer
behavior** beyond one missing affordance (see below).

`apple/reminders-bridge` reconciles both directions every 60s via launchd, so a
wall edit reaches everyone's Reminders app within ~a minute, and vice versa.

### New units

**`src/lib/wallPinnedLists.ts`** — a direct structural mirror of
`src/lib/hideRoutinesSignal.ts`. Owns the localStorage key
`symphony-wall-pinned-lists` (a JSON array of list ids) and exports
`readPinnedLists()`, `writePinnedLists(ids)`, `onPinnedListsChange(cb)`.
The cap of **2 pinned lists** is enforced inside `writePinnedLists` so no caller
can exceed it. All reads/writes are wrapped in try/catch and fail silent, as the
hide-routines signal does.

**`src/components/wall-v2/WallV2PinnedListCard.tsx`** — one card per pinned list,
rendered in the right column. Presentational: `title`, `openItems`, `onToggle`,
`onOpen`. Renders up to 5 open items as tap-to-toggle rows with large
checkboxes, then a `+N more` line when there are more. Completed items never
appear here. **`WallV2PinnedList.tsx`** is its container — it calls
`useListItems(listId)` and owns the poll.

**`src/components/wall-v2/WallV2ListSheet.tsx`** — full-screen overlay,
presentational. **`WallV2ListSheetContainer.tsx`** owns which list is selected,
calls `useListItems(selectedId)`, and maps the sheet's callbacks onto the hook's
mutations.

Layout:
- Left rail: family lists, each row showing title, open-item count, and a pin
  toggle.
- Top of right pane: text input (autofocused) + Add. Enter submits, clears, and
  refocuses so several items can be entered in a row.
- Right pane body: open items as ~72px rows. Tapping a row toggles complete. A
  `⋯` button on each row opens a small per-item menu with Edit text and Delete.
  Edit swaps the row for an input seeded with the current text.
- Bottom: collapsed `Done (N)` expander, and `Clear done` when N > 0.

**`WallV2FamilyStrip`** — the dock cluster grows from four actions to five
(`task`, `discuss`, `list`, `phone`, `utilities`), so its grid goes 2×2 → 3
columns × 2 rows and the cluster widens from 124px to 182px. It grows sideways,
not taller: a third row inside the 116px strip would leave ~36px buttons, too
small to hit on a wall-mounted screen at arm's length. `WallDockActionId` gains
`'list'`; the new action uses the `ClipboardList` icon.

**`WallV2Shell`** — holds `showListSheet` / `sheetListId` state, reads pinned ids
via `wallPinnedLists`, filters `useLists()` to `visibility === 'family'`
(excluding lists whose `hidden_from` contains the user), renders a
`WallV2PinnedListCard` per pinned id in the right column, and renders
`WallV2ListSheet` alongside the other overlays.

**`src/hooks/useListItems.ts`** — add `refetch` to the returned object (extract
the existing `fetchItems` effect body into a `useCallback` and expose it). This
is the one data-layer change. Nothing else in the hook changes, so existing
consumers are unaffected.

### Data flow

```
wallPinnedLists (localStorage)  ──▶ WallV2Shell ──▶ WallV2PinnedListCard(listId)
                                          │                    └─▶ useListItems(listId)
                                          └─▶ WallV2ListSheet ──▶ useListItems(selectedId)
                                                                        │
                                                                  Supabase list_items
                                                                        │
                                                            reminders-bridge (60s, both ways)
                                                                        │
                                                                 Apple Reminders
```

### Freshness

`list_items` has no realtime subscription and this design does not add one.
Instead:

- The sheet calls `refetch` when it opens, so anything you act on is current.
- Each `WallV2PinnedListCard` owns a poll effect calling its own `refetch` under
  the same guards `useWallData` uses: skip when `document.hidden`, skip when
  `isQuietHours()`. Wall polling is the known root cause of the Supabase egress
  bill, so the list poll reuses the wall's existing 12-minute cadence rather than
  introducing a faster one. `POLL_INTERVAL_MS` in `useWallData.ts` is currently
  module-private; export it as `WALL_POLL_INTERVAL_MS` and import it, so the two
  cadences cannot drift apart.

Worst case, a phone-side change takes up to 12 minutes plus ~60s of bridge lag to
show on the pinned card. That is acceptable for a grocery list, and opening the
sheet always shows current state.

## Error handling

- Every mutation in `useListItems` is already optimistic with rollback and sets
  `error`. The wall surfaces that message through the shell's existing
  `showFlash` toast rather than inventing a new error surface.
- `Clear done` is a two-tap inline confirm: the button relabels to "Tap again to
  confirm" for ~4 seconds, then reverts. No browser dialog — a modal dialog on
  the Pi blocks the automation/extension channel and can white-screen the wall.
- Deleting a single item is only reachable through the per-row `⋯` menu, never a
  bare tap, so a lean on the touchscreen cannot destroy a row.
- Presentational components take every value and callback as props; the hooks
  live in thin containers (`WallV2PinnedList`, `WallV2ListSheetContainer`). That
  keeps the component tests free of Supabase and auth mocking.

## Testing

Unit tests (Vitest + RTL), colocated with the existing wall-v2 suite:

- `wallPinnedLists.test.ts` — read/write round-trip, subscribe fires on change,
  cap of 2 enforced in the setter, corrupt/absent localStorage value yields `[]`.
- `WallV2PinnedListCard.test.tsx` — renders only open items, caps at 5 with
  `+N more`, tapping a row calls the toggle, header tap calls `onOpen`.
- `WallV2ListSheet.test.tsx` — add submits and clears the input, `⋯` exposes edit
  and delete, edit saves new text, Done section is collapsed by default,
  `Clear done` requires two taps.
- `WallV2FamilyStrip.test.tsx` (extend) — the five dock actions render and the
  list action fires `onDockAction('list')`.

Manual verification before this reaches the Pi: `npm run dev` in the worktree
(copy `.env` first — a worktree without it renders a blank screen), open
`/wall-v2` at 5173, and look at the right column with one and with two lists
pinned. The 2-pin cap is a guess about vertical space; confirm it visually and
drop to 1 if the column is crowded.

## Follow-ups, explicitly not in this work

- Template lists (packing lists reusable per trip) — tracked in the vault as
  `ideas/symphony-template-lists.md`.
- Sub-items, notes, and reordering on the wall.
- Realtime on `list_items`.
