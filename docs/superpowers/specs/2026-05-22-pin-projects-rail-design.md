# Pin Projects + Due-Date Sort on the Today Rail — Design

**Date:** 2026-05-22
**Status:** Approved (pending spec review)

## Problem

The Today right-rail "Active projects" panel (`ActiveProjects.tsx`) lists active
projects sorted by most-recently-updated. There's no way to (a) pin a project so
it stays at the top, or (b) order projects by how soon their work is due. This
adds both, on that one rail surface.

## Behavior

**Sort order (within the rail's active projects):**
1. **Pinned projects first**, in pin order (`pinned_items.display_order` ascending).
2. **Then unpinned projects by earliest incomplete task date:** a project's
   soonest `scheduledFor` across its *incomplete, timed* tasks.
3. **Projects with no dated tasks sink to the bottom**, ordered by bucket urgency
   (`week` < `month` < `quarter` < `inbox` < none) then most-recently-updated.
4. The existing 5-item cap still applies. Pinned projects take the top slots, so
   they're never starved by unpinned ones. (Edge case: pinning 6+ projects on a
   5-cap rail still shows only 5 — rare, given the global 7-pin cap.)

**Pinning:** reuses the existing `pinned_items` system with
`entityType === 'project'`. No new table or column.
- Each rail row gets a small pin icon (lucide `Pin`), revealed on hover, shown
  filled when the project is pinned (visible without hover so pinned items are
  identifiable). Clicking toggles the pin and does **not** open the project
  (`stopPropagation`).

### Accepted caveats of reusing `pinned_items`

- **7-pin global cap** shared across all entity types (tasks, contacts,
  projects, routines, lists). If `pin()` returns `false` (cap reached), the
  toggle is a no-op — no error UI in v1.
- **Auto-expiry:** a pin auto-unpins after 21 days without access (existing
  `usePinnedItems` behavior). Acceptable for now; revisit with a dedicated
  durable flag if it becomes annoying.

## Architecture

The sort is a pure function; the pin state and toggle live in the rail container;
the panel stays presentational.

### `src/lib/projectProgress.ts`
- `RankedProject` gains `pinned: boolean`.
- `rankActiveProjects(projects, tasks, limit = 5, pinnedIds: string[] = [])`:
  - `pinnedIds` is the ordered list of pinned project ids.
  - Pre-buckets tasks by project (as today, for progress) and additionally tracks
    per project: the earliest `scheduledFor` among incomplete timed tasks
    (`dueMs`, `Infinity` if none) and the minimum bucket rank among incomplete
    tasks (`week=0, month=1, quarter=2, inbox=3, none=4`).
  - Sort comparator: pinned-before-unpinned (pinned ordered by their index in
    `pinnedIds`); within unpinned, `dueMs` ascending (Infinity last), then bucket
    rank ascending, then `updatedAt` descending.
  - Applies `.slice(0, limit)` after sorting; sets `pinned` on each result.
  - Keeping `limit` as the third positional arg preserves the existing call
    `rankActiveProjects(projects, tasks, 5)` and the existing cap test.

### `src/components/today/TodayRail.tsx`
- Calls `usePinnedItems()`.
- Derives `pinnedProjectIds` = `pins.filter(p => p.entityType === 'project').sort(by displayOrder).map(p => p.entityId)` (memoized).
- Passes `pinnedProjectIds` into `rankActiveProjects(projects, tasks, 5, pinnedProjectIds)`.
- Defines `onTogglePin(projectId)` = `isPinned('project', id) ? unpin('project', id) : pin('project', id)` and passes it to `ActiveProjects`.

### `src/components/today/ActiveProjects.tsx`
- New prop `onTogglePin: (projectId: string) => void`.
- Each row renders the existing name/progress plus a pin icon button:
  - `Pin` icon, `fill-current` when `p.pinned`, otherwise outline.
  - Hover-revealed when unpinned (`opacity-0 group-hover:opacity-100`), always
    visible when pinned.
  - `onClick` calls `e.stopPropagation()` then `onTogglePin(p.id)`.
  - `aria-label` = `Pin <name>` / `Unpin <name>`; `aria-pressed={p.pinned}`.

## Out of scope (YAGNI)

- Pinning on the main Projects page or any other surface.
- Drag-to-reorder pins (the `reorder` API exists but isn't wired here).
- A "pin limit reached" toast / dedicated durable pin flag.
- Changing `Project` type, `useProjects`, or the DB schema.

## Testing

- **Unit (`src/lib/projectProgress.test.ts`):** pinned projects come first in
  pin order; unpinned sorted by earliest incomplete timed `scheduledFor`;
  undated projects sink to the bottom (bucket-rank then recency tiebreak);
  `pinned` flag set correctly; cap still honored with pins present. Update the
  existing recency test to reflect that recency is now only a tiebreak.
- **Component (`src/components/today/ActiveProjects.test.tsx`):** renders a pin
  button per row; clicking it calls `onTogglePin` and not `onSelectProject`;
  pinned rows show the filled state. Add the new required `onTogglePin` prop to
  existing render calls.
- **Build + manual smoke:** pin a project on the rail → it jumps to the top and
  shows filled; unpin → it drops back into due-date order.
