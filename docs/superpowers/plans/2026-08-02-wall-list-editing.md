# Wall List Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone add, check off, edit and delete items on the family's lists from the kitchen kiosk, with a pinned list visible on the wall face.

**Architecture:** Presentational components take every value and callback as props; thin container components own the hooks. The data layer already exists — `useListItems` has `addItem` / `updateItem` / `deleteItem` / `clearCompleted` with optimistic rollback — so this work is a wall surface, one new localStorage store, and one hook affordance (`refetch`). Which lists appear on the wall is wall-local state in `localStorage`, mirroring `src/lib/hideRoutinesSignal.ts`.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 via the `WALL` token object, Vitest + React Testing Library, Supabase (already wired through `useListItems`).

**Spec:** `docs/superpowers/specs/2026-08-02-wall-list-editing-design.md`

## Global Constraints

- **Worktree:** all work happens in `.worktrees/wall-lists` on branch `wall-lists`. Never edit or commit in the main worktree. Copy `.env` from the main worktree before running the dev server or the wall renders blank.
- **Tests:** `npm test` is watch mode. Always run `npx vitest run <path>`.
- **Type-check with `npx tsc -p tsconfig.app.json --noEmit`.** A bare `npx tsc --noEmit`
  type-checks **zero files**: the root `tsconfig.json` is a solution file (`"files": []`,
  references only) and `tsc` ignores project references without `-b`. The `pre-push`
  hook runs that bare command, so the repo's "blocking" type gate currently checks
  nothing. Note also that every tsconfig excludes `src/**/*.test.*`, so test files are
  never type-checked at all (138 pre-existing errors sit in them on `origin/main`).
- **Node 22.14.0 is required to run the tests.** Export this before any test command:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` (confirm with `node -v`).
  The default `node` on PATH is Homebrew v26, whose inert built-in `localStorage`
  global shadows happy-dom's; under it every test in this repo that touches bare
  `localStorage` fails, including pre-existing ones unrelated to this work
  (`WeekStrip.test.tsx` fails 14/14). Those are environment failures, not code
  failures — never "fix" them with a mock or a polyfill.
- **No emojis anywhere in UI or code.** Use `lucide-react` icons.
- **Styling:** use tokens from `src/components/wall-v2/wallTheme.ts` (`WALL.card`, `WALL.cardInset`, `WALL.label`, `WALL.muted`, `WALL.ink`, `WALL.inkStrong`, `WALL.root`, `WALL.rail`). Never assemble theme hexes ad hoc — every token already carries its dark twin.
- **Touch targets:** sheet rows are 72px tall; card rows 44px; dock buttons stay ≥52px. This screen is touched at arm's length from a TV mount.
- **No browser dialogs.** No `confirm()`, `alert()`, or `prompt()` — a modal dialog blocks the wall. Destructive actions use a two-tap inline confirm.
- **Lists shown on the wall are family-visible only** (`visibility === 'family'`).
- **Commit after every task**, with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.
- **Do not push to `main`** — pushes to `main` deploy to production. Push the `wall-lists` branch only.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/wallPinnedLists.ts` *(new)* | Wall-local pin store: read/write/subscribe, cap of 2. |
| `src/lib/wallPinnedLists.test.ts` *(new)* | Tests for the store. |
| `src/hooks/useListItems.ts` *(modify)* | Expose `refetch`. No behavior change otherwise. |
| `src/hooks/useWallData.ts` *(modify)* | Export the poll interval as `WALL_POLL_INTERVAL_MS`. |
| `src/components/wall-v2/WallV2PinnedListCard.tsx` *(new)* | Presentational wall-face card. |
| `src/components/wall-v2/WallV2PinnedList.tsx` *(new)* | Container: `useListItems` + poll, renders the card. |
| `src/components/wall-v2/WallV2ListSheet.tsx` *(new)* | Presentational full-screen editor. |
| `src/components/wall-v2/WallV2ListSheetContainer.tsx` *(new)* | Container: selection state + `useListItems` + mutations. |
| `src/components/wall-v2/WallV2FamilyStrip.tsx` *(modify)* | Fifth dock action, cluster goes 3 columns × 2 rows. |
| `src/components/wall-v2/WallV2RightColumn.tsx` *(modify)* | Accepts a `pinnedLists` slot below the dinner card. |
| `src/components/wall-v2/WallV2Shell.tsx` *(modify)* | Wires pins, dock action, cards and sheet together. |

---

### Task 1: Wall-local pin store

**Files:**
- Create: `src/lib/wallPinnedLists.ts`
- Test: `src/lib/wallPinnedLists.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_WALL_PINNED_LISTS: number`, `readPinnedLists(): string[]`, `writePinnedLists(ids: string[]): string[]`, `togglePinnedList(id: string): string[]`, `onPinnedListsChange(cb: (ids: string[]) => void): () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/wallPinnedLists.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAX_WALL_PINNED_LISTS,
  readPinnedLists,
  writePinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from './wallPinnedLists'

describe('wallPinnedLists', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads an empty array when nothing is stored', () => {
    expect(readPinnedLists()).toEqual([])
  })

  it('round-trips ids through localStorage', () => {
    writePinnedLists(['a'])
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('caps at MAX_WALL_PINNED_LISTS, keeping the most recent', () => {
    expect(MAX_WALL_PINNED_LISTS).toBe(2)
    writePinnedLists(['a', 'b', 'c'])
    expect(readPinnedLists()).toEqual(['b', 'c'])
  })

  it('drops duplicates', () => {
    writePinnedLists(['a', 'a'])
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('returns an empty array for corrupt stored JSON', () => {
    localStorage.setItem('symphony-wall-pinned-lists', 'not json')
    expect(readPinnedLists()).toEqual([])
  })

  it('ignores non-string entries', () => {
    localStorage.setItem('symphony-wall-pinned-lists', JSON.stringify(['a', 7, null]))
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('toggles a list on and back off', () => {
    expect(togglePinnedList('a')).toEqual(['a'])
    expect(togglePinnedList('a')).toEqual([])
  })

  it('pinning past the cap drops the oldest pin', () => {
    togglePinnedList('a')
    togglePinnedList('b')
    expect(togglePinnedList('c')).toEqual(['b', 'c'])
  })

  it('notifies subscribers in the same tab and stops after cleanup', () => {
    const cb = vi.fn()
    const off = onPinnedListsChange(cb)
    writePinnedLists(['a'])
    expect(cb).toHaveBeenCalledWith(['a'])
    off()
    writePinnedLists(['b'])
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/wallPinnedLists.test.ts`
Expected: FAIL — cannot resolve `./wallPinnedLists`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/wallPinnedLists.ts`:

```ts
/**
 * The `symphony-wall-pinned-lists` localStorage key holds which lists this
 * wall shows on its face. Wall-local on purpose: what's on the kitchen
 * display is a decision made at the kitchen, not a personal sidebar pin, so
 * this is deliberately NOT the `pinned_items` table behind the app sidebar.
 *
 * Mirrors src/lib/hideRoutinesSignal.ts — native 'storage' events don't fire
 * in the tab that wrote the value, so we dispatch an in-tab custom event too.
 */
const KEY = 'symphony-wall-pinned-lists'
const EVENT = 'symphony-wall-pinned-lists-changed'

/** The right column already carries four cards; two pinned lists is the ceiling. */
export const MAX_WALL_PINNED_LISTS = 2

/** Dedupe, drop non-strings, and keep only the most recently pinned ids. */
function normalize(ids: unknown[]): string[] {
  const strings = ids.filter((id): id is string => typeof id === 'string')
  const deduped = strings.filter((id, i) => strings.indexOf(id) === i)
  return deduped.slice(-MAX_WALL_PINNED_LISTS)
}

export function readPinnedLists(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? normalize(parsed) : []
  } catch { return [] }
}

/** Returns the ids actually stored, after the cap is applied. */
export function writePinnedLists(ids: string[]): string[] {
  const next = normalize(ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ids: next } }))
  } catch { /* localStorage unavailable — silent fail */ }
  return next
}

/** Pin if absent, unpin if present. Pinning past the cap drops the oldest pin. */
export function togglePinnedList(id: string): string[] {
  const current = readPinnedLists()
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id]
  return writePinnedLists(next)
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onPinnedListsChange(cb: (ids: string[]) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ ids: string[] }>).detail
    cb(detail?.ids ?? readPinnedLists())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readPinnedLists())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/wallPinnedLists.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallPinnedLists.ts src/lib/wallPinnedLists.test.ts
git commit -m "feat(wall): wall-local store for pinned lists"
```

---

### Task 2: Expose `refetch` on `useListItems` and export the wall poll interval

**Files:**
- Modify: `src/hooks/useListItems.ts:28-62` (the fetch effect) and the returned object at the end of the hook
- Modify: `src/hooks/useWallData.ts:21` (the `POLL_INTERVAL_MS` constant) and its use in the polling effect
- Test: `src/hooks/useListItems.test.ts` (add one test)

**Interfaces:**
- Consumes: nothing.
- Produces: `useListItems(listId).refetch: () => Promise<void>`; `WALL_POLL_INTERVAL_MS: number` exported from `src/hooks/useWallData.ts`.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing top-level `describe` in `src/hooks/useListItems.test.ts`. It follows the mocking already set up at the top of that file — `mockOrder` is the fetch call:

```ts
  it('refetch re-runs the fetch query', async () => {
    mockOrder.mockResolvedValue({ data: [createMockDbListItem()], error: null })
    const { result } = renderHook(() => useListItems('list-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterMount = mockOrder.mock.calls.length

    await act(async () => {
      await result.current.refetch()
    })

    expect(mockOrder.mock.calls.length).toBe(callsAfterMount + 1)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useListItems.test.ts -t 'refetch re-runs'`
Expected: FAIL — `result.current.refetch is not a function`.

- [ ] **Step 3: Implement `refetch`**

In `src/hooks/useListItems.ts`, replace the whole fetch `useEffect` block (currently lines 28–62, starting `// Fetch items when listId changes` and ending with the closing `}, [user, listId])`) with a `useCallback` plus a thin effect. Note the `eslint-disable` comment is no longer needed because the state writes move out of the effect body:

```ts
  const fetchItems = useCallback(async () => {
    if (!user || !listId) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setItems((data as DbListItem[]).map(dbListItemToListItem))
    setLoading(false)
  }, [user, listId])

  // Fetch on mount and whenever the user or list changes.
  useEffect(() => {
    void fetchItems()
  }, [fetchItems])
```

Then add `refetch` to the hook's returned object (the `return { items, itemsMap, ... }` block at the end):

```ts
    refetch: fetchItems,
```

- [ ] **Step 4: Export the poll interval**

In `src/hooks/useWallData.ts`, rename the constant on line 21 and export it, keeping the value and comment:

```ts
export const WALL_POLL_INTERVAL_MS = 12 * 60 * 1000 // 12 minutes — wall is glanceable, not live
```

Update its single use inside the polling effect (`}, POLL_INTERVAL_MS)`) to `}, WALL_POLL_INTERVAL_MS)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useListItems.test.ts`
Expected: PASS, including the new refetch test. (`useWallData` has no test file; the constant rename is covered by the type-check in the next step.)

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc -p tsconfig.app.json --noEmit
git add src/hooks/useListItems.ts src/hooks/useListItems.test.ts src/hooks/useWallData.ts
git commit -m "feat(lists): expose refetch on useListItems; export wall poll interval"
```

---

### Task 3: Pinned list card (presentational)

**Files:**
- Create: `src/components/wall-v2/WallV2PinnedListCard.tsx`
- Test: `src/components/wall-v2/WallV2PinnedListCard.test.tsx`

**Interfaces:**
- Consumes: `ListItem` from `@/types/list`, `WALL` from `./wallTheme`.
- Produces: `WallV2PinnedListCard({ title, openItems, onToggle, onOpen })` where `openItems: ListItem[]`, `onToggle: (id: string) => void`, `onOpen: () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/components/wall-v2/WallV2PinnedListCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2PinnedListCard } from './WallV2PinnedListCard';
import type { ListItem } from '@/types/list';

function item(id: string, text: string): ListItem {
  return {
    id,
    listId: 'list-1',
    text,
    sortOrder: 0,
    completed: false,
    createdAt: new Date('2026-08-02T12:00:00Z'),
    updatedAt: new Date('2026-08-02T12:00:00Z'),
  };
}

const props = (openItems: ListItem[]) => ({
  title: 'Groceries',
  openItems,
  onToggle: vi.fn(),
  onOpen: vi.fn(),
});

describe('WallV2PinnedListCard', () => {
  it('renders the title and the open count', () => {
    render(<WallV2PinnedListCard {...props([item('1', 'Milk')])} />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('caps at five rows and shows the overflow count', () => {
    const seven = Array.from({ length: 7 }, (_, i) => item(String(i), `Item ${i}`));
    render(<WallV2PinnedListCard {...props(seven)} />);
    expect(screen.getByText('Item 4')).toBeInTheDocument();
    expect(screen.queryByText('Item 5')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('tapping a row checks that item off', () => {
    const p = props([item('abc', 'Milk')]);
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /check off milk/i }));
    expect(p.onToggle).toHaveBeenCalledWith('abc');
  });

  it('tapping the header opens the sheet', () => {
    const p = props([item('1', 'Milk')]);
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /open groceries/i }));
    expect(p.onOpen).toHaveBeenCalled();
  });

  it('tapping the overflow line opens the sheet', () => {
    const p = props(Array.from({ length: 7 }, (_, i) => item(String(i), `Item ${i}`)));
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByText('+2 more'));
    expect(p.onOpen).toHaveBeenCalled();
  });

  it('shows an empty state when nothing is open', () => {
    render(<WallV2PinnedListCard {...props([])} />);
    expect(screen.getByText(/nothing on this list/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2PinnedListCard.test.tsx`
Expected: FAIL — cannot resolve `./WallV2PinnedListCard`.

- [ ] **Step 3: Write the implementation**

Create `src/components/wall-v2/WallV2PinnedListCard.tsx`:

```tsx
// src/components/wall-v2/WallV2PinnedListCard.tsx
//
// One pinned list on the wall face: title, open count, up to five open items
// you can check off in place, and an overflow line into the full sheet.
// Purely presentational — WallV2PinnedList owns the data and mutations.

import { ClipboardList } from 'lucide-react';
import { WALL } from './wallTheme';
import type { ListItem } from '@/types/list';

/** Five rows is what the right column can spare next to the other cards. */
const MAX_ROWS = 5;

interface Props {
  title: string;
  openItems: ListItem[];
  onToggle: (id: string) => void;
  onOpen: () => void;
}

export function WallV2PinnedListCard({ title, openItems, onToggle, onOpen }: Props) {
  const rows = openItems.slice(0, MAX_ROWS);
  const overflow = openItems.length - rows.length;

  return (
    <div className={`${WALL.card} p-3`}>
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="w-full flex items-center gap-2 mb-2 text-left"
      >
        <ClipboardList className={`w-4 h-4 shrink-0 ${WALL.muted}`} />
        <span className={`font-display text-[1.05rem] truncate ${WALL.inkStrong}`}>{title}</span>
        <span className={`ml-auto ${WALL.label}`}>{openItems.length}</span>
      </button>

      {rows.length === 0 ? (
        <div className={`text-[0.85rem] ${WALL.muted}`}>Nothing on this list</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Check off ${item.text}`}
                onClick={() => onToggle(item.id)}
                className={`${WALL.cardInset} w-full flex items-center gap-2.5 px-2.5 h-11 text-left active:scale-[0.99] transition-transform`}
              >
                <span
                  aria-hidden
                  className="w-5 h-5 shrink-0 rounded-md border-2 border-[#C9BDA3] dark:border-[#5A4E3B]"
                />
                <span className={`text-[0.9rem] truncate ${WALL.ink}`}>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 && (
        <button type="button" onClick={onOpen} className={`mt-1.5 text-[0.8rem] ${WALL.muted}`}>
          +{overflow} more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2PinnedListCard.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2PinnedListCard.tsx src/components/wall-v2/WallV2PinnedListCard.test.tsx
git commit -m "feat(wall): pinned list card"
```

---

### Task 4: Pinned list container with guarded polling

**Files:**
- Create: `src/components/wall-v2/WallV2PinnedList.tsx`
- Test: `src/components/wall-v2/WallV2PinnedList.test.ts`

**Interfaces:**
- Consumes: `useListItems(listId).items / updateItem / refetch` (Task 2), `WALL_POLL_INTERVAL_MS` (Task 2), `WallV2PinnedListCard` (Task 3), `isQuietHours` from `@/lib/quietHours`.
- Produces: `WallV2PinnedList({ listId, title, onOpen })`; `shouldPollLists(hidden: boolean, quiet: boolean): boolean`.

The pure `shouldPollLists` helper is what gets tested — the component itself is a four-line wiring of already-tested parts, and testing it would mean re-mocking Supabase for no new coverage.

- [ ] **Step 1: Write the failing test**

Create `src/components/wall-v2/WallV2PinnedList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldPollLists } from './WallV2PinnedList';

describe('shouldPollLists', () => {
  it('polls when the tab is visible and it is not quiet hours', () => {
    expect(shouldPollLists(false, false)).toBe(true);
  });

  it('skips when the tab is hidden — a backgrounded tab costs egress for nothing', () => {
    expect(shouldPollLists(true, false)).toBe(false);
  });

  it('skips during quiet hours — nobody is reading the wall at 3am', () => {
    expect(shouldPollLists(false, true)).toBe(false);
  });

  it('skips when both are true', () => {
    expect(shouldPollLists(true, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2PinnedList.test.ts`
Expected: FAIL — cannot resolve `./WallV2PinnedList`.

- [ ] **Step 3: Write the implementation**

Create `src/components/wall-v2/WallV2PinnedList.tsx`:

```tsx
// src/components/wall-v2/WallV2PinnedList.tsx
//
// Container for one pinned list: owns the items and the poll, renders the
// card. `list_items` has no realtime subscription, so the wall re-pulls on
// the same 12-minute cadence and under the same guards as useWallData —
// wall polling is the known driver of the Supabase egress bill, so this
// deliberately does not poll faster.

import { useEffect, useMemo } from 'react';
import { useListItems } from '@/hooks/useListItems';
import { WALL_POLL_INTERVAL_MS } from '@/hooks/useWallData';
import { isQuietHours } from '@/lib/quietHours';
import { WallV2PinnedListCard } from './WallV2PinnedListCard';

/** Poll only when someone could be looking and it isn't the middle of the night. */
export function shouldPollLists(hidden: boolean, quiet: boolean): boolean {
  return !hidden && !quiet;
}

interface Props {
  listId: string;
  title: string;
  onOpen: () => void;
}

export function WallV2PinnedList({ listId, title, onOpen }: Props) {
  const { items, updateItem, refetch } = useListItems(listId);
  const openItems = useMemo(() => items.filter((i) => !i.completed), [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!shouldPollLists(hidden, isQuietHours())) return;
      void refetch();
    }, WALL_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <WallV2PinnedListCard
      title={title}
      openItems={openItems}
      onToggle={(id) => void updateItem(id, { completed: true })}
      onOpen={onOpen}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2PinnedList.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2PinnedList.tsx src/components/wall-v2/WallV2PinnedList.test.ts
git commit -m "feat(wall): pinned list container with guarded polling"
```

---

### Task 5: The full-screen list sheet (presentational)

**Files:**
- Create: `src/components/wall-v2/WallV2ListSheet.tsx`
- Test: `src/components/wall-v2/WallV2ListSheet.test.tsx`

**Interfaces:**
- Consumes: `ListItem` from `@/types/list`, `WALL` from `./wallTheme`.
- Produces: `WallListSummary { id: string; title: string; openCount: number }` and `WallV2ListSheet(props)` with props exactly: `lists: WallListSummary[]`, `selectedListId: string | null`, `onSelectList: (id: string) => void`, `items: ListItem[]`, `pinnedIds: string[]`, `onTogglePin: (id: string) => void`, `onAdd: (text: string) => void`, `onToggle: (id: string, completed: boolean) => void`, `onEditText: (id: string, text: string) => void`, `onDelete: (id: string) => void`, `onClearDone: () => void`, `onClose: () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/components/wall-v2/WallV2ListSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2ListSheet } from './WallV2ListSheet';
import type { ListItem } from '@/types/list';

function item(id: string, text: string, completed = false): ListItem {
  return {
    id,
    listId: 'list-1',
    text,
    sortOrder: 0,
    completed,
    createdAt: new Date('2026-08-02T12:00:00Z'),
    updatedAt: new Date('2026-08-02T12:00:00Z'),
  };
}

const props = (items: ListItem[] = [item('1', 'Milk')]) => ({
  lists: [
    { id: 'list-1', title: 'Groceries', openCount: 1 },
    { id: 'list-2', title: 'Need now', openCount: 0 },
  ],
  selectedListId: 'list-1',
  onSelectList: vi.fn(),
  items,
  pinnedIds: ['list-1'],
  onTogglePin: vi.fn(),
  onAdd: vi.fn(),
  onToggle: vi.fn(),
  onEditText: vi.fn(),
  onDelete: vi.fn(),
  onClearDone: vi.fn(),
  onClose: vi.fn(),
});

describe('WallV2ListSheet', () => {
  it('adds an item and clears the field', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onAdd).toHaveBeenCalledWith('Eggs');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('submits on Enter', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: 'Eggs' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onAdd).toHaveBeenCalledWith('Eggs');
  });

  it('ignores an empty or whitespace-only add', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onAdd).not.toHaveBeenCalled();
  });

  it('tapping a row checks it off', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /check off milk/i }));
    expect(p.onToggle).toHaveBeenCalledWith('1', true);
  });

  it('edits item text through the row menu', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions for milk/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const editInput = screen.getByDisplayValue('Milk');
    fireEvent.change(editInput, { target: { value: 'Whole milk' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(p.onEditText).toHaveBeenCalledWith('1', 'Whole milk');
  });

  it('deletes an item through the row menu', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions for milk/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(p.onDelete).toHaveBeenCalledWith('1');
  });

  it('hides completed items until Done is expanded', () => {
    const p = props([item('1', 'Milk'), item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    expect(screen.getByText('Bread')).toBeInTheDocument();
  });

  it('unchecks a completed item', () => {
    const p = props([item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /uncheck bread/i }));
    expect(p.onToggle).toHaveBeenCalledWith('2', false);
  });

  it('requires two taps to clear done items', () => {
    const p = props([item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    const clear = screen.getByRole('button', { name: /clear done/i });
    fireEvent.click(clear);
    expect(p.onClearDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /tap again to confirm/i }));
    expect(p.onClearDone).toHaveBeenCalled();
  });

  it('switches lists and toggles pins from the rail', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /show need now/i }));
    expect(p.onSelectList).toHaveBeenCalledWith('list-2');
    fireEvent.click(screen.getByRole('button', { name: /unpin groceries/i }));
    expect(p.onTogglePin).toHaveBeenCalledWith('list-1');
  });

  it('closes on the close button', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(p.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2ListSheet.test.tsx`
Expected: FAIL — cannot resolve `./WallV2ListSheet`.

- [ ] **Step 3: Write the implementation**

Create `src/components/wall-v2/WallV2ListSheet.tsx`:

```tsx
// src/components/wall-v2/WallV2ListSheet.tsx
//
// Full-screen list editor for the kiosk. Presentational: the container owns
// the data and every mutation. Touch-first — 72px rows, no fine targets, and
// destructive actions are a two-tap inline confirm rather than a browser
// dialog (a modal dialog blocks the wall until someone dismisses it).

import { useEffect, useRef, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, MoreHorizontal, Pin, PinOff, Plus, X,
} from 'lucide-react';
import { WALL } from './wallTheme';
import type { ListItem } from '@/types/list';

export interface WallListSummary {
  id: string;
  title: string;
  openCount: number;
}

interface Props {
  lists: WallListSummary[];
  selectedListId: string | null;
  onSelectList: (id: string) => void;
  items: ListItem[];
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  onAdd: (text: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onEditText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onClearDone: () => void;
  onClose: () => void;
}

export function WallV2ListSheet({
  lists, selectedListId, onSelectList, items, pinnedIds, onTogglePin,
  onAdd, onToggle, onEditText, onDelete, onClearDone, onClose,
}: Props) {
  const [draft, setDraft] = useState('');
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  // Disarm the clear confirm after a few seconds so a stray tap can't leave
  // a destructive button primed for the next person who walks up.
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const selected = lists.find((l) => l.id === selectedListId) ?? null;
  const open = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);

  const submitAdd = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
    addRef.current?.focus();
  };

  const startEdit = (item: ListItem) => {
    setMenuItemId(null);
    setEditingId(item.id);
    setEditDraft(item.text);
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (editingId && text) onEditText(editingId, text);
    setEditingId(null);
  };

  return (
    <div className={`fixed inset-0 z-50 ${WALL.root} flex flex-col p-5 gap-4`}>
      <div className="flex items-center justify-between">
        <div className={WALL.label}>Lists</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`${WALL.card} grid place-items-center w-14 h-14`}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left rail — which list, and whether it lives on the wall face */}
        <div className={`${WALL.rail} rounded-2xl w-[280px] shrink-0 p-2 flex flex-col gap-2 overflow-y-auto`}>
          {lists.map((list) => {
            const isPinned = pinnedIds.includes(list.id);
            return (
              <div key={list.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Show ${list.title}`}
                  onClick={() => onSelectList(list.id)}
                  className={`${WALL.card} flex-1 min-w-0 flex items-center gap-2 px-3 h-16 text-left ${
                    list.id === selectedListId ? WALL.nowAccent : ''
                  }`}
                >
                  <span className={`flex-1 truncate text-[1.05rem] font-semibold ${WALL.inkStrong}`}>
                    {list.title}
                  </span>
                  <span className={WALL.label}>{list.openCount}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${list.title}`}
                  onClick={() => onTogglePin(list.id)}
                  className={`${WALL.card} grid place-items-center w-16 h-16 shrink-0`}
                >
                  {isPinned
                    ? <Pin className="w-5 h-5 text-[#2E4638] dark:text-[#4E7261]" />
                    : <PinOff className={`w-5 h-5 ${WALL.muted}`} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Right pane — add field, open items, done drawer */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              ref={addRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              placeholder={selected ? `Add to ${selected.title}` : 'Add an item'}
              className={`${WALL.cardInset} flex-1 min-w-0 px-4 h-16 text-[1.15rem] ${WALL.ink} outline-none`}
            />
            <button
              type="button"
              onClick={submitAdd}
              className={`${WALL.card} flex items-center gap-2 px-6 h-16 text-[1.05rem] font-semibold ${WALL.inkStrong}`}
            >
              <Plus className="w-5 h-5" />
              Add
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            {open.length === 0 && (
              <div className={`px-1 py-3 text-[1rem] ${WALL.muted}`}>Nothing open on this list</div>
            )}

            {open.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                {editingId === item.id ? (
                  <>
                    <input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                      className={`${WALL.cardInset} flex-1 min-w-0 px-4 h-[72px] text-[1.1rem] ${WALL.ink} outline-none`}
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold ${WALL.inkStrong}`}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Check off ${item.text}`}
                      onClick={() => onToggle(item.id, true)}
                      className={`${WALL.card} flex-1 min-w-0 flex items-center gap-3 px-4 h-[72px] text-left active:scale-[0.995] transition-transform`}
                    >
                      <span
                        aria-hidden
                        className="w-7 h-7 shrink-0 rounded-lg border-2 border-[#C9BDA3] dark:border-[#5A4E3B]"
                      />
                      <span className={`truncate text-[1.1rem] ${WALL.ink}`}>{item.text}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`More actions for ${item.text}`}
                      onClick={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
                      className={`${WALL.card} grid place-items-center w-[72px] h-[72px] shrink-0`}
                    >
                      <MoreHorizontal className={`w-6 h-6 ${WALL.muted}`} />
                    </button>
                  </>
                )}

                {menuItemId === item.id && editingId !== item.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold ${WALL.inkStrong}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuItemId(null); onDelete(item.id); }}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold text-[#A8600F] dark:text-[#E0A959]`}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}

            {done.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDone(!showDone)}
                    className={`${WALL.cardInset} flex items-center gap-2 px-4 h-14 ${WALL.muted}`}
                  >
                    {showDone ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    <span className="text-[1rem] font-semibold">Done ({done.length})</span>
                  </button>
                  {showDone && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmClear) { setConfirmClear(false); onClearDone(); }
                        else setConfirmClear(true);
                      }}
                      className={`${WALL.card} px-5 h-14 text-[1rem] font-semibold text-[#A8600F] dark:text-[#E0A959]`}
                    >
                      {confirmClear ? 'Tap again to confirm' : 'Clear done'}
                    </button>
                  )}
                </div>

                {showDone && (
                  <div className="flex flex-col gap-2 mt-2">
                    {done.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Uncheck ${item.text}`}
                        onClick={() => onToggle(item.id, false)}
                        className={`${WALL.cardInset} flex items-center gap-3 px-4 h-[72px] text-left`}
                      >
                        <Check className={`w-6 h-6 shrink-0 ${WALL.muted}`} />
                        <span className={`truncate text-[1.05rem] line-through ${WALL.muted}`}>{item.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2ListSheet.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2ListSheet.tsx src/components/wall-v2/WallV2ListSheet.test.tsx
git commit -m "feat(wall): full-screen list editor sheet"
```

---

### Task 6: Sheet container

**Files:**
- Create: `src/components/wall-v2/WallV2ListSheetContainer.tsx`

**Interfaces:**
- Consumes: `useListItems` (Task 2), `WallV2ListSheet` + `WallListSummary` (Task 5), `List` from `@/types/list`.
- Produces: `WallV2ListSheetContainer({ lists, initialListId, pinnedIds, onTogglePin, onError, onClose })` where `lists: List[]` (already filtered to family-visible by the shell), `initialListId: string | null`, and `onError: (message: string) => void` (the shell passes its `showFlash`).

No test: this file is pure wiring between two units that are each already tested, and testing it would mean re-mocking Supabase and `useAuth` to assert that a callback reaches a hook. Task 8's manual verification covers it.

- [ ] **Step 1: Write the implementation**

Create `src/components/wall-v2/WallV2ListSheetContainer.tsx`:

```tsx
// src/components/wall-v2/WallV2ListSheetContainer.tsx
//
// Data wiring for the wall's list editor: owns which list is selected, pulls
// that list's items, and maps the sheet's callbacks onto useListItems. Kept
// out of WallV2Shell so the shell doesn't grow another hook's worth of state.

import { useEffect, useMemo, useState } from 'react';
import { useListItems } from '@/hooks/useListItems';
import { WallV2ListSheet, type WallListSummary } from './WallV2ListSheet';
import type { List } from '@/types/list';

interface Props {
  lists: List[];
  initialListId: string | null;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  /** Surface a failed mutation — the shell passes its flash-toast helper. */
  onError: (message: string) => void;
  onClose: () => void;
}

export function WallV2ListSheetContainer({
  lists, initialListId, pinnedIds, onTogglePin, onError, onClose,
}: Props) {
  const [selectedListId, setSelectedListId] = useState<string | null>(
    initialListId ?? lists[0]?.id ?? null,
  );
  const { items, addItem, updateItem, deleteItem, clearCompleted, refetch, error } =
    useListItems(selectedListId);

  // The card that opened the sheet may hold items up to a poll interval old.
  useEffect(() => { void refetch(); }, [refetch]);

  // useListItems rolls its optimistic update back on failure; without this the
  // row would just silently reappear and nobody would know why.
  useEffect(() => {
    if (error) onError(`Couldn't save — ${error}`);
  }, [error, onError]);

  const summaries = useMemo<WallListSummary[]>(
    () => lists.map((list) => ({
      id: list.id,
      title: list.title,
      // Only the selected list's items are loaded, so other rows show no
      // count rather than a stale one.
      openCount: list.id === selectedListId ? items.filter((i) => !i.completed).length : 0,
    })),
    [lists, selectedListId, items],
  );

  return (
    <WallV2ListSheet
      lists={summaries}
      selectedListId={selectedListId}
      onSelectList={setSelectedListId}
      items={items}
      pinnedIds={pinnedIds}
      onTogglePin={onTogglePin}
      onAdd={(text) => void addItem({ text })}
      onToggle={(id, completed) => void updateItem(id, { completed })}
      onEditText={(id, text) => void updateItem(id, { text })}
      onDelete={(id) => void deleteItem(id)}
      onClearDone={() => void clearCompleted()}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall-v2/WallV2ListSheetContainer.tsx
git commit -m "feat(wall): wire the list sheet to useListItems"
```

---

### Task 7: Fifth dock action

**Files:**
- Modify: `src/components/wall-v2/WallV2FamilyStrip.tsx:14-21` (the `WallDockActionId` type and `DOCK` array) and the dock cluster's wrapper `div` near the end of the file
- Test: `src/components/wall-v2/WallV2FamilyStrip.test.tsx` (add one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `WallDockActionId` gains `'list'`.

The cluster grows **wider** (3 columns × 2 rows, `w-[182px]`), not taller. A third row inside the 116px strip would leave ~36px buttons, too small to hit reliably on a wall-mounted screen at arm's length.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe` in `src/components/wall-v2/WallV2FamilyStrip.test.tsx`:

```tsx
  it('fires the list dock action', () => {
    const onDockAction = vi.fn();
    render(
      <WallV2FamilyStrip
        familyMembers={[]}
        today={undefined}
        now={new Date('2026-08-02T12:00:00')}
        onDockAction={onDockAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /lists/i }));
    expect(onDockAction).toHaveBeenCalledWith('list');
  });
```

The file already imports `vi`, `fireEvent`, `render` and `screen`, so no import changes are needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2FamilyStrip.test.tsx -t 'list dock action'`
Expected: FAIL — no button named "Lists".

- [ ] **Step 3: Add the action**

In `src/components/wall-v2/WallV2FamilyStrip.tsx`, extend the icon import to include `ClipboardList`:

```tsx
import { ClipboardList, MessagesSquare, Phone, Plus, Settings } from 'lucide-react';
```

Extend the type and the `DOCK` array:

```tsx
export type WallDockActionId = 'task' | 'discuss' | 'phone' | 'utilities' | 'list';

const DOCK: { id: WallDockActionId; label: string; icon: LucideIcon }[] = [
  { id: 'task', label: 'Add a task', icon: Plus },
  { id: 'discuss', label: 'Discuss', icon: MessagesSquare },
  { id: 'list', label: 'Lists', icon: ClipboardList },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'utilities', label: 'Utilities', icon: Settings },
];
```

Widen the cluster so the buttons keep their size — replace the wrapper `div`'s className:

```tsx
      <div className={`${WALL.rail} rounded-2xl shrink-0 w-[182px] grid grid-cols-3 grid-rows-2 gap-1.5 p-1.5`}>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/wall-v2/WallV2FamilyStrip.test.tsx`
Expected: PASS, including the pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2FamilyStrip.tsx src/components/wall-v2/WallV2FamilyStrip.test.tsx
git commit -m "feat(wall): add Lists to the dock cluster"
```

---

### Task 8: Wire it into the wall

**Files:**
- Modify: `src/components/wall-v2/WallV2RightColumn.tsx` (add a `pinnedLists` slot)
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (imports, pin state, dock case, right-column slot, sheet overlay)

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: the finished feature. No new exports.

- [ ] **Step 1: Add the slot to the right column**

In `src/components/wall-v2/WallV2RightColumn.tsx`, add to `Props`:

```tsx
  /** Pinned list cards, rendered below the dinner card. Empty when nothing is pinned. */
  pinnedLists?: React.ReactNode;
```

Add `pinnedLists` to the destructured parameters, and render it immediately after `<WallV2DinnerCard ... />`:

```tsx
      {pinnedLists}
```

Add the React type import at the top of the file:

```tsx
import type { ReactNode } from 'react';
```

and use `ReactNode` rather than `React.ReactNode` in the prop type, matching the codebase's import style.

- [ ] **Step 2: Wire the shell**

In `src/components/wall-v2/WallV2Shell.tsx`, add imports alongside the existing wall-v2 imports:

```tsx
import { WallV2PinnedList } from './WallV2PinnedList';
import { WallV2ListSheetContainer } from './WallV2ListSheetContainer';
import { useLists } from '@/hooks/useLists';
import {
  readPinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from '@/lib/wallPinnedLists';
```

Add state near the other `useState` declarations (the `showQuickCapture` line is a good anchor):

```tsx
  const [showListSheet, setShowListSheet] = useState(false);
  const [sheetListId, setSheetListId] = useState<string | null>(null);
  const [pinnedListIds, setPinnedListIds] = useState<string[]>(() => readPinnedLists());

  // Pins are wall-local; subscribe so a pin made in the sheet updates the face.
  useEffect(() => onPinnedListsChange(setPinnedListIds), []);

  const { lists } = useLists();
  // The wall is a shared kitchen display — personal lists never appear on it.
  const familyLists = useMemo(
    () => lists.filter((l) => l.visibility === 'family'),
    [lists],
  );
```

Add the dock case beside the existing ones in `handleDockAction`:

```tsx
      case 'list': setSheetListId(null); setShowListSheet(true); break;
```

Pass the cards into the right column — replace the existing `<WallV2RightColumn ... />` props by adding:

```tsx
            pinnedLists={pinnedListIds.map((id) => {
              const list = familyLists.find((l) => l.id === id);
              if (!list) return null;
              return (
                <WallV2PinnedList
                  key={id}
                  listId={id}
                  title={list.title}
                  onOpen={() => { setSheetListId(id); setShowListSheet(true); }}
                />
              );
            })}
```

Render the sheet with the other overlays, next to `{showPhone && ...}`:

```tsx
      {showListSheet && (
        <WallV2ListSheetContainer
          lists={familyLists}
          initialListId={sheetListId}
          pinnedIds={pinnedListIds}
          onTogglePin={(id) => setPinnedListIds(togglePinnedList(id))}
          onError={showFlash}
          onClose={() => setShowListSheet(false)}
        />
      )}
```

- [ ] **Step 3: Type-check and run the full unit suite**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx vitest run src/components/wall-v2 src/lib/wallPinnedLists.test.ts src/hooks/useListItems.test.ts
```

Expected: no type errors; all tests pass.

- [ ] **Step 4: Verify in the browser — required, not optional**

```bash
cp ../../.env .            # a worktree without .env renders a blank screen
npm run dev                # port 5173
```

Open `http://localhost:5173/wall-v2` and confirm, by looking:

1. The dock shows five buttons and they are still comfortably tappable.
2. Tapping **Lists** opens the sheet with Groceries, Need now and Mom's Super Market in the rail, and the add field already focused (type immediately, no tap needed).
3. Typing an item and pressing Enter adds it, clears the field, and leaves focus in the field so a second item can follow.
4. Tapping a row checks it off and it leaves the open list.
5. `⋯` → Edit changes the text; `⋯` → Delete removes the row.
6. `Done (N)` is collapsed on arrival; expanding shows completed items; `Clear done` needs two taps.
7. Pinning Groceries puts a card in the right column; unpinning removes it.
8. **Pin a second list and look at the right column.** The 2-pin cap is a guess about vertical space — if Dinner / Tomorrow / At-a-glance / Question get squeezed, change `MAX_WALL_PINNED_LISTS` to 1 and say so in the commit.
9. Reload the page: pins survive.

- [ ] **Step 5: Build and commit**

```bash
npm run build              # pre-push tsc is not the same as a Vercel build
git add -u
git commit -m "feat(wall): pin lists to the wall face and edit them from the kiosk"
git push -u origin wall-lists
```

Do **not** push to `main` — that deploys to production. Scott merges when he's seen it on the Pi.

---

## Verification on the Pi (after merge, not part of a task)

The wall runs Chromium on a Raspberry Pi at `app.symphony-os.com`. After this reaches production, confirm on the actual device: pinned card renders at the right size from ~8ft, the hardware keyboard types into the add field, and an item added on the wall appears in Apple Reminders within ~60s (the bridge tick).
