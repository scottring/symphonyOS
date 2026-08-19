# Needed Today — a sticky note on Today

**Date:** 2026-08-19
**Status:** Approved, ready for planning

## The problem

Today spends one muted line on `To buy · N`, a bare link you must leave the page
to act on. It tells you a count and nothing else.

What's missing is a place for the handful of things that need handling *today*
but aren't commitments with a time: something to pick up, a conversation to have,
anything else urgent. Those currently either get forced into a timed task (wrong
shape) or disappear behind the To buy link.

## The shape

One hand-curated note pinned above the agenda. Every row is there because the
user put it there. It renders nothing at all when nothing is pinned.

```
August 19, 2026

┌─ NEEDED TODAY ───────────┐
│ 🛍 Pull-ups              │
│ 💬 Iris — camp form      │
└──────────────────────────┘

All day  Make walnut pesto
  › Camp Mornings  0/5
12:00 PM Appointment with AiM
 1:00 PM Caitlin Masters
 6:30 PM Ladies Track Night

+ Add to today
5 carried over · 24 need attention
```

### Decisions and why

| Decision | Choice | Reasoning |
|---|---|---|
| Note shape | One note, mixed rows, typed by icon | Today was flattened to one agenda on 2026-08-18; three boxes rebuilds the layout that was called a mess |
| What populates it | Explicit pin only | 40 things on the To buy list, 3 needed today — only the user knows which. Bounded by construction |
| Pin lifetime | A date, expires with the day | "Needed today" is inherently dated; a persistent pin becomes a second backlog |
| Placement | Top of the day card | It's hand-curated, so it isn't the computed furniture that was deleted — and it's invisible when empty |
| Pin control | `⋯` menu entry, state as a title chip | Exactly how the discussion flag already works; respects the fixed four-slot rail |
| Row action | Checkbox completes, tap opens | One mental model across row types; ticking a shopping item should mean bought |
| To buy line | Unchanged | The note only shows pinned items, so the full list still needs its own way in |

## Architecture

### Data model

A pin is a **date**, not a boolean:

- `tasks.needed_on date null` — urgent items and conversations
- `list_items.needed_on date null` — To buy lines

Partial index on each (`where needed_on is not null`); the pinned set is tiny.

A date rather than a boolean because it expires without a job — the date simply
stops matching the viewed day — and because it leaves room to pin ahead later
without a migration.

The pin lives on the row rather than in a `pinned_items` join table: it is one
column, it belongs to the thing, and it dies with the row. A join table would
need polymorphic foreign keys and orphan cleanup for no gain.

A "conversation" is not a new entity. Tasks already carry `needsDiscussion` and
`discussionNote` (see `src/lib/discussionItems.ts`), already capped at 5 and
already surfaced on the wall. Pinning such a task is what puts it on the note.

**Migration:** this repo's migrations are out of sync with the remote, so DDL
goes through the Management API (`POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`).

### Selector — `src/lib/today/neededToday.ts`

Pure, mirroring how `attention.ts` is structured.

```ts
neededToday(tasks, listItems, viewedDate, shoppingListIds)
  → { items: NeededItem[]; overflow: number }

interface NeededItem {
  id: string
  source: 'task' | 'list_item'
  kind: 'buy' | 'discuss' | 'urgent'
  title: string
}
```

- Filters to `needed_on` matching `viewedDate`, dropping completed rows
- `kind` is **derived, never stored**: a list item on a `shopping`-category list
  is `buy`; a task with `needsDiscussion` is `discuss`; everything else is
  `urgent`
- Sort: `discuss`, then `buy`, then `urgent`; stable within each group
- Returns the first 5 plus a count of the remainder

Expiry needs no scheduled job. Completion drops a row because completed items are
filtered out.

**"Expires" means the pin stops matching the viewed day, not that it is erased.**
The column keeps its value, so navigating back to a past day shows the note as it
stood on that day. Only the *current* day's note goes quiet. Nothing is deleted;
the underlying task or list item is untouched either way.

Domain filtering follows the rest of Today: pinned tasks respect the current
domain. Lists carry `category` and `visibility` but no domain (see
`src/types/list.ts`), so pinned list items show regardless of the domain switch.

### Component — `src/components/schedule/NeededTodayNote.tsx`

Rendered inside the day card, above the agenda.

- **Returns `null` when there are no items.** This is the property that makes top
  placement safe and it gets its own test.
- Row: checkbox → completes the underlying task or list item; typed icon; title →
  opens the item's existing detail panel.
- Past 5 items, a `+N more` line expands the rest inline.
- Reads list items via the shared `ListsContext`, **not** a private `useLists()`.
  A lazily-created list stays invisible to a private instance until reload — the
  trap that made `ToBuyLine` render nothing during the To buy work. Use
  `useListsContextOrNull` so a provider-less mount (tests) renders nothing rather
  than throwing.
- Same-tab freshness rides the existing local write bus; new mutations must
  announce, or the note shows stale state right after the user's own action.

### Pinning

Three entry points, all writing the same column:

1. **Desktop Today row** — `Need today` in the `⋯` overflow menu. Once pinned, a
   chip joins the title cluster and unpins on click. This follows the rail rule —
   *the title cluster carries state, the right rail carries actions* — and mirrors
   the discussion flag exactly. The four-slot rail is not touched.
2. **Mobile Today card** — the mobile branch has its own trailing cluster and was
   deliberately untouched by the rail work, so it needs its own entry point.
3. **`/lists` item row** — so To buy lines can reach the note at all.

### Expiry review

Unfinished pins from previous days surface in the evening `ReviewDrawer` as a
bounded section: re-pin, or let go. Reuses the existing drawer rather than adding
a surface. Bounded like the other pools there.

## Testing

- **Selector unit tests** — expiry boundary, kind derivation from each source,
  sort order, the cap and overflow count, mixed sources, completed-item exclusion.
- **`renders nothing when empty`** as an explicit component test.
- **Extend `TodayInvariant.test.tsx`.** It renders the real `TodayView` at 5 vs
  500 backlog tasks and compares element counts; it was proven to catch a
  regression (538 vs 43) that all three data-layer tests missed. Add pinned items
  to both fixtures and assert the note's rendered count is identical between
  them, so the note can never become backlog-driven.
- **Pin/unpin action tests** across all three entry points.
- Run the **full** suite before judging green. During the To buy work a scoped
  `vitest run src/components/schedule` passed while the full suite failed 38.

## Explicitly not doing

- No new "conversation" entity — `needsDiscussion` already exists.
- No pinning ahead to future days in v1, though the date column allows it later.
- No auto-population from any signal. Nothing appears uninvited.
- No change to the `To buy · N` line, the four-slot rail, or the flat agenda.

## Risks

- **Top placement is the reversible bet.** Computed furniture at the top of Today
  has been deleted twice (`UpNextHero`, `AttentionLine`). This differs in being
  hand-curated and invisible when empty, but if it grates, moving it below the
  agenda is a one-line change of render position.
- **Three pin entry points is the bulk of the work**, not the note itself. If the
  build runs long, the mobile and `/lists` paths are the natural things to stage,
  at the cost of the note launching unable to hold shopping items.
