# Needed Today Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hand-curated "Needed Today" note above Today's agenda, holding the handful of things that need handling today but aren't timed commitments — something to buy, a conversation to have, anything urgent.

**Architecture:** A `needed_on date` column on `tasks` and `list_items`. A pure selector merges both sources for the viewed day, derives a display kind, sorts, and caps at 5. One component renders the note and returns `null` when empty. Three entry points write the column: the desktop `⋯` menu, the mobile card, and the `/lists` row.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4, Supabase, Vitest + React Testing Library.

## Global Constraints

- **Node 22.14.0 is required.** Run `node -v` first. If wrong: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **`npm test` is WATCH mode.** Always use `npx vitest run`.
- **`npx tsc --noEmit` at root is a NO-OP.** Use `npx tsc --noEmit -p tsconfig.app.json`.
- **Run ESLint on every changed file.** CI runs lint; the pre-push hook does not. `Date.now()` / `new Date()` in a `useRef` initializer is a `react-hooks/purity` **error** — seed in an effect instead.
- **Never call the feature a "pin" in code.** A `pinned_items` table and `usePinnedItems` hook already exist for a durable shortcuts shelf (`MAX_PINS = 7`, auto-unpin at 21 days). Use `needed_on`, `markNeededToday`, `clearNeededToday`, `useNeededToday`.
- **Never partial-`upsert` the `tasks` table.** Use `.update().eq()`.
- **Migrations are out of sync with the remote.** DDL goes through the Management API:
  ```bash
  SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
  ```
  then `POST https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query`.
- **Run the FULL suite before judging green.** A scoped `vitest run src/components/schedule` once passed while the full suite failed 38 tests.
- **No emojis in UI.** Use `lucide-react` icons.
- Work happens in the `.worktrees/needed-today` worktree on branch `feat/needed-today-note`. Never edit or commit in the main worktree.

---

### Task 1: Database columns

**Files:**
- Migration: run via Management API (no local migration file — the repo's migrations are out of sync)
- Modify: `src/types/task.ts` (add `neededOn`)
- Modify: `src/types/list.ts` (add `neededOn` to `ListItem`, `needed_on` to `DbListItem`)

**Interfaces:**
- Consumes: nothing
- Produces: `Task.neededOn?: Date`, `ListItem.neededOn?: Date`, `DbListItem.needed_on: string | null`

- [ ] **Step 1: Add the columns**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "alter table tasks add column if not exists needed_on date; alter table list_items add column if not exists needed_on date; create index if not exists tasks_needed_on_idx on tasks (user_id, needed_on) where needed_on is not null; create index if not exists list_items_needed_on_idx on list_items (needed_on) where needed_on is not null;"}'
```

Expected: `[]` (success — DDL returns no rows).

- [ ] **Step 2: Verify the columns exist**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "select table_name, column_name from information_schema.columns where column_name = '"'"'needed_on'"'"' order by table_name"}'
```

Expected: two rows — `list_items` and `tasks`.

- [ ] **Step 3: Add `neededOn` to the Task type**

In `src/types/task.ts`, beside `needsDiscussion?: boolean` (line ~98):

```typescript
  /**
   * The day this was marked "needed today". A DATE, not a flag: it expires by
   * ceasing to match the viewed day, so no job has to clear it. Never called a
   * "pin" — `pinned_items` is a different, durable system.
   */
  neededOn?: Date
```

- [ ] **Step 4: Add `neededOn` to the list types**

In `src/types/list.ts`, add to `DbListItem`:

```typescript
  needed_on: string | null
```

and to `ListItem`:

```typescript
  /** The day this was marked "needed today". See Task.neededOn. */
  neededOn?: Date
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS (nothing consumes the new fields yet).

- [ ] **Step 6: Commit**

```bash
git add src/types/task.ts src/types/list.ts
git commit -m "feat(needed-today): add needed_on to tasks and list_items"
```

---

### Task 2: Row mappers read and write `needed_on`

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts:154` (db→app mapper), `:1162` and `:1309` (app→db update)
- Modify: `src/hooks/useLists.ts` (db→app item mapper, and `updateItem`)
- Test: `src/hooks/useSupabaseTasks.neededOn.test.ts` (create)

**Interfaces:**
- Consumes: `Task.neededOn`, `ListItem.neededOn` from Task 1
- Produces: `updateTask(id, { neededOn })` and `updateItem(id, { neededOn })` persist the column; both mappers hydrate it

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useSupabaseTasks.neededOn.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dbTaskToTask } from './useSupabaseTasks'

describe('needed_on mapping', () => {
  it('hydrates needed_on into a Date', () => {
    const task = dbTaskToTask({ id: 't1', title: 'x', completed: false, needed_on: '2026-08-19' } as never)
    expect(task.neededOn?.getFullYear()).toBe(2026)
    expect(task.neededOn?.getMonth()).toBe(7)
    expect(task.neededOn?.getDate()).toBe(19)
  })

  it('leaves neededOn undefined when the column is null', () => {
    const task = dbTaskToTask({ id: 't1', title: 'x', completed: false, needed_on: null } as never)
    expect(task.neededOn).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/useSupabaseTasks.neededOn.test.ts`
Expected: FAIL — either `dbTaskToTask` is not exported, or `neededOn` is undefined.

- [ ] **Step 3: Export the mapper if needed, and map the column**

In `src/hooks/useSupabaseTasks.ts`, ensure `dbTaskToTask` is exported (`export function dbTaskToTask`). Beside `needsDiscussion: dbTask.needs_discussion ?? undefined,` (line ~154) add:

```typescript
    // Date-only column: parse as LOCAL midnight. `new Date('2026-08-19')` parses
    // as UTC and lands on the 18th in US timezones — the note would show the
    // item a day early.
    neededOn: dbTask.needed_on
      ? (() => { const [y, m, d] = dbTask.needed_on.split('-').map(Number); return new Date(y, m - 1, d) })()
      : undefined,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useSupabaseTasks.neededOn.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the write path for tasks**

In `src/hooks/useSupabaseTasks.ts`, next to each `if ('needsDiscussion' in updates)` line (~1162 and ~1309) add:

```typescript
    if ('neededOn' in updates) {
      dbUpdates.needed_on = updates.neededOn
        ? `${updates.neededOn.getFullYear()}-${String(updates.neededOn.getMonth() + 1).padStart(2, '0')}-${String(updates.neededOn.getDate()).padStart(2, '0')}`
        : null
    }
```

Also add `neededOn?: Date | null` to the update-args type so clearing typechecks.

- [ ] **Step 6: Mirror both directions for list items**

The db→app mapper is `dbListItemToListItem` in `src/hooks/useListItems.ts` (already exported). Add the same local-midnight parse:

```typescript
    neededOn: dbItem.needed_on
      ? (() => { const [y, m, d] = dbItem.needed_on!.split('-').map(Number); return new Date(y, m - 1, d) })()
      : undefined,
```

Then in `useListItems.ts`'s `updateItem`, map `neededOn` back to a `needed_on` date string or `null` using the same formatting helper as Step 5.

- [ ] **Step 7: Typecheck, lint, and run the full suite**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/hooks/useSupabaseTasks.ts src/hooks/useLists.ts src/hooks/useSupabaseTasks.neededOn.test.ts
npx vitest run
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useLists.ts src/hooks/useSupabaseTasks.neededOn.test.ts
git commit -m "feat(needed-today): map needed_on through the task and list-item layers"
```

---

### Task 3: The selector

**Files:**
- Create: `src/lib/today/neededToday.ts`
- Test: `src/lib/today/neededToday.test.ts`

**Interfaces:**
- Consumes: `Task.neededOn`, `ListItem.neededOn`, `List.category`
- Produces:
  ```typescript
  export const NEEDED_TODAY_VISIBLE = 5
  export interface NeededItem {
    id: string
    source: 'task' | 'list_item'
    kind: 'buy' | 'discuss' | 'urgent'
    title: string
  }
  export function neededToday(
    tasks: Task[],
    listItems: ListItem[],
    viewedDate: Date,
    shoppingListIds: Set<string>,
    visible?: number,   // defaults to NEEDED_TODAY_VISIBLE; pass Infinity when expanded
  ): { items: NeededItem[]; overflow: number }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/neededToday.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { neededToday, NEEDED_TODAY_VISIBLE } from './neededToday'
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'

const DAY = new Date(2026, 7, 19)

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

function item(over: Partial<ListItem>): ListItem {
  return {
    id: 'i', listId: 'shop', text: 'Item', sortOrder: 0, completed: false,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as ListItem
}

const SHOPPING = new Set(['shop'])

describe('neededToday', () => {
  it('includes only items marked for the viewed day', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY }), task({ id: 'b', neededOn: new Date(2026, 7, 18) }), task({ id: 'c' })],
      [], DAY, SHOPPING,
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  it('matches by calendar day, ignoring time of day', () => {
    const { items } = neededToday([task({ id: 'a', neededOn: new Date(2026, 7, 19, 23, 30) })], [], DAY, SHOPPING)
    expect(items).toHaveLength(1)
  })

  it('excludes completed items from both sources', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY, completed: true })],
      [item({ id: 'i1', neededOn: DAY, completed: true })],
      DAY, SHOPPING,
    )
    expect(items).toEqual([])
  })

  it('derives kind: shopping list item is buy, needsDiscussion is discuss, else urgent', () => {
    const { items } = neededToday(
      [task({ id: 'd', neededOn: DAY, needsDiscussion: true }), task({ id: 'u', neededOn: DAY })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.find(i => i.id === 'd')!.kind).toBe('discuss')
    expect(items.find(i => i.id === 'u')!.kind).toBe('urgent')
    expect(items.find(i => i.id === 'b')!.kind).toBe('buy')
  })

  it('treats a non-shopping list item as urgent, not buy', () => {
    const { items } = neededToday([], [item({ id: 'x', listId: 'other', neededOn: DAY })], DAY, SHOPPING)
    expect(items[0].kind).toBe('urgent')
  })

  it('sorts discuss, then buy, then urgent', () => {
    const { items } = neededToday(
      [task({ id: 'u', neededOn: DAY }), task({ id: 'd', neededOn: DAY, needsDiscussion: true })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.map(i => i.kind)).toEqual(['discuss', 'buy', 'urgent'])
  })

  it('uses list item text as the title', () => {
    const { items } = neededToday([], [item({ id: 'b', neededOn: DAY, text: 'Pull-ups' })], DAY, SHOPPING)
    expect(items[0].title).toBe('Pull-ups')
  })

  it('caps visible items and reports the overflow count', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING)
    expect(items).toHaveLength(NEEDED_TODAY_VISIBLE)
    expect(overflow).toBe(3)
  })

  it('reports zero overflow when under the cap', () => {
    const { overflow } = neededToday([task({ id: 'a', neededOn: DAY })], [], DAY, SHOPPING)
    expect(overflow).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/today/neededToday.test.ts`
Expected: FAIL — cannot resolve `./neededToday`.

- [ ] **Step 3: Write the selector**

Create `src/lib/today/neededToday.ts`:

```typescript
/**
 * What today actually needs — the read side of the Needed Today note.
 *
 * "Needed today" is a DATE on the row (`needed_on`), not a flag, so it expires
 * by ceasing to match the viewed day. Nothing clears it and nothing is deleted:
 * navigating back to a past day still shows that day's note.
 *
 * Never call this a "pin" — `pinned_items` is a separate, durable shortcuts
 * shelf with a 21-day auto-unpin that would contradict daily expiry.
 *
 * Never writes.
 */
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'
import { isSameDay } from '@/lib/dateUtils'

/** Rows rendered before the note folds the rest behind "+N more". */
export const NEEDED_TODAY_VISIBLE = 5

export type NeededKind = 'buy' | 'discuss' | 'urgent'

export interface NeededItem {
  id: string
  source: 'task' | 'list_item'
  kind: NeededKind
  title: string
}

/** Conversations first — they depend on catching another person. */
const KIND_ORDER: Record<NeededKind, number> = { discuss: 0, buy: 1, urgent: 2 }

export function neededToday(
  tasks: Task[],
  listItems: ListItem[],
  viewedDate: Date,
  shoppingListIds: Set<string>,
  /** Rows to return. `Infinity` when the note is expanded. */
  visible: number = NEEDED_TODAY_VISIBLE,
): { items: NeededItem[]; overflow: number } {
  const marked = (d: Date | undefined) => !!d && isSameDay(d, viewedDate)

  const fromTasks: NeededItem[] = tasks
    .filter((t) => !t.completed && marked(t.neededOn))
    .map((t) => ({
      id: t.id,
      source: 'task' as const,
      kind: t.needsDiscussion ? ('discuss' as const) : ('urgent' as const),
      title: t.title,
    }))

  const fromItems: NeededItem[] = listItems
    .filter((i) => !i.completed && marked(i.neededOn))
    .map((i) => ({
      id: i.id,
      source: 'list_item' as const,
      // Kind is DERIVED, never stored: a list item earns "buy" from its list's
      // category, so recategorising a list re-labels its items for free.
      kind: shoppingListIds.has(i.listId) ? ('buy' as const) : ('urgent' as const),
      title: i.text,
    }))

  const all = [...fromTasks, ...fromItems].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  )

  return {
    items: all.slice(0, visible),
    overflow: Math.max(0, all.length - visible),
  }
}
```

Add one more test to the file from Step 1, covering the parameter:

```typescript
  it('returns everything with no overflow when visible is Infinity', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING, Infinity)
    expect(items).toHaveLength(8)
    expect(overflow).toBe(0)
  })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/today/neededToday.test.ts`
Expected: PASS, 9 tests.

Note: `Array.prototype.sort` is stable in Node 22, which is what keeps ordering within a kind predictable.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/today/neededToday.ts src/lib/today/neededToday.test.ts
git add src/lib/today/neededToday.ts src/lib/today/neededToday.test.ts
git commit -m "feat(needed-today): selector merging marked tasks and list items"
```

---

### Task 3b: Fetching the marked list items

**Files:**
- Create: `src/hooks/useNeededListItems.ts`
- Test: `src/hooks/useNeededListItems.test.ts`

**Why this exists:** `ListsContext` exposes `listItems`, but it comes from
`useListItems(selectedListId)` and returns `[]` when no list is selected — which
is always the case on Today. So the note cannot read list items from the context.
It needs its own query, across all lists, for the marked day only. The partial
index from Task 1 (`list_items_needed_on_idx`) covers exactly this, so it stays
cheap. This mirrors how `ToBuyLine` queries Supabase directly rather than routing
items through context.

**Interfaces:**
- Consumes: the `needed_on` column from Task 1, `dbListItemToListItem` from `@/hooks/useListItems`
- Produces: `useNeededListItems(viewedDate: Date): { items: ListItem[]; refetch: () => void }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useNeededListItems.test.ts`. Mock `@/lib/supabase` the way the
other hook tests in `src/hooks/` do (read one first — do not invent a mock shape).
Assert:

```typescript
  it('queries list_items for the given day and maps them', async () => {
    // supabase mock resolves with [{ id: 'i1', list_id: 'shop', text: 'Pull-ups',
    //   needed_on: '2026-08-19', completed: false, ... }]
    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19)))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].text).toBe('Pull-ups')
    expect(result.current.items[0].listId).toBe('shop')
  })

  it('returns nothing when no items are marked', async () => {
    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19)))
    await waitFor(() => expect(result.current.items).toEqual([]))
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/useNeededListItems.test.ts`
Expected: FAIL — cannot resolve `./useNeededListItems`.

- [ ] **Step 3: Write the hook**

```typescript
/**
 * List items marked "needed today", across every list.
 *
 * ListsContext can't serve this: its `listItems` come from
 * useListItems(selectedListId) and are empty whenever no list is open, which is
 * always true on Today. This queries the marked day directly — the partial index
 * on (needed_on) makes it a cheap lookup, not a table scan.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { dbListItemToListItem } from '@/hooks/useListItems'
import { TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'
import type { ListItem } from '@/types/list'

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useNeededListItems(viewedDate: Date) {
  const [items, setItems] = useState<ListItem[]>([])
  // A Date object is a new identity every render; key the effect on the stable
  // day string so this doesn't refetch in a loop.
  const day = toDateString(viewedDate)

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await getAuthUser()
    if (!user) { setItems([]); return }

    const { data, error } = await supabase
      .from('list_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('needed_on', day)
      .eq('completed', false)

    if (!error && data) setItems(data.map(dbListItemToListItem))
  }, [day])

  useEffect(() => {
    void fetchItems()
    // Same-tab writes announce on this event; without it the note shows stale
    // state immediately after the user's own action.
    window.addEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
    return () => window.removeEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
  }, [fetchItems])

  return { items, refetch: fetchItems }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useNeededListItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/hooks/useNeededListItems.ts src/hooks/useNeededListItems.test.ts
git add src/hooks/useNeededListItems.ts src/hooks/useNeededListItems.test.ts
git commit -m "feat(needed-today): fetch marked list items across all lists"
```

---

### Task 4: The note component

**Files:**
- Create: `src/components/schedule/NeededTodayNote.tsx`
- Test: `src/components/schedule/NeededTodayNote.test.tsx`

**Interfaces:**
- Consumes: `neededToday`, `NEEDED_TODAY_VISIBLE`, `NeededItem` from Task 3; `useNeededListItems` from Task 3b
- Produces:
  ```typescript
  interface NeededTodayNoteProps {
    tasks: Task[]
    viewedDate: Date
    onToggleTask: (id: string) => void
    onToggleListItem: (id: string) => void
    onOpenTask: (id: string) => void
  }
  export function NeededTodayNote(props: NeededTodayNoteProps): JSX.Element | null
  ```
  Test id `needed-today-note`; each row `needed-today-row`.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/NeededTodayNote.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { NeededTodayNote } from './NeededTodayNote'
import type { Task } from '@/types/task'

const DAY = new Date(2026, 7, 19)

vi.mock('@/contexts/ListsContext', () => ({
  useListsContextOrNull: () => ({ lists: [] }),
}))
vi.mock('@/hooks/useNeededListItems', () => ({
  useNeededListItems: () => ({ items: [], refetch: vi.fn() }),
}))

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

const noop = { onToggleTask: vi.fn(), onToggleListItem: vi.fn(), onOpenTask: vi.fn() }

describe('NeededTodayNote', () => {
  it('renders nothing when nothing is marked', () => {
    const { container } = render(
      <NeededTodayNote tasks={[task({})]} viewedDate={DAY} {...noop} />,
    )
    expect(container.querySelector('[data-testid="needed-today-note"]')).toBeNull()
  })

  it('renders a marked task', () => {
    render(
      <NeededTodayNote tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]} viewedDate={DAY} {...noop} />,
    )
    expect(screen.getByTestId('needed-today-note')).toBeInTheDocument()
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
  })

  it('completes the underlying task from the checkbox', () => {
    const onToggleTask = vi.fn()
    render(
      <NeededTodayNote
        tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]}
        viewedDate={DAY} {...noop} onToggleTask={onToggleTask}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /call plumber/i }))
    expect(onToggleTask).toHaveBeenCalledWith('a')
  })

  it('opens the task when the title is clicked', () => {
    const onOpenTask = vi.fn()
    render(
      <NeededTodayNote
        tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]}
        viewedDate={DAY} {...noop} onOpenTask={onOpenTask}
      />,
    )
    fireEvent.click(screen.getByText('Call plumber'))
    expect(onOpenTask).toHaveBeenCalledWith('a')
  })

  it('folds past the cap behind "+N more" and expands on click', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, title: `Item ${n}`, neededOn: DAY }))
    render(<NeededTodayNote tasks={many} viewedDate={DAY} {...noop} />)

    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(5)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/schedule/NeededTodayNote.test.tsx`
Expected: FAIL — cannot resolve `./NeededTodayNote`.

- [ ] **Step 3: Write the component**

Create `src/components/schedule/NeededTodayNote.tsx`:

```tsx
// The Needed Today note: the handful of things today needs that aren't timed
// commitments. Hand-curated — nothing appears here uninvited.
//
// Renders NOTHING when empty. That is what makes top-of-card placement safe:
// on a day with nothing marked, Today looks exactly as it did before. Computed
// furniture at the top of Today has been deleted twice (UpNextHero,
// AttentionLine); this earns its place by being silent by default.
import { useState } from 'react'
import { ShoppingBag, MessageCircle, AlertCircle } from 'lucide-react'
import type { Task } from '@/types/task'
import { useListsContextOrNull } from '@/contexts/ListsContext'
import { useNeededListItems } from '@/hooks/useNeededListItems'
import { neededToday, type NeededKind } from '@/lib/today/neededToday'

interface NeededTodayNoteProps {
  tasks: Task[]
  viewedDate: Date
  onToggleTask: (id: string) => void
  onToggleListItem: (id: string) => void
  onOpenTask: (id: string) => void
}

const KIND_ICON: Record<NeededKind, typeof ShoppingBag> = {
  buy: ShoppingBag,
  discuss: MessageCircle,
  urgent: AlertCircle,
}

export function NeededTodayNote({
  tasks, viewedDate, onToggleTask, onToggleListItem, onOpenTask,
}: NeededTodayNoteProps) {
  const [expanded, setExpanded] = useState(false)

  // The SHARED context, not a private useLists(): a lazily-created list is
  // invisible to a private instance until reload. Null-tolerant so a
  // provider-less mount (tests) renders nothing instead of throwing.
  const ctx = useListsContextOrNull()
  const lists = ctx?.lists ?? []

  // NOT ctx.listItems — those are scoped to the open list and are empty on
  // Today. See useNeededListItems.
  const { items: listItems } = useNeededListItems(viewedDate)

  const shoppingListIds = new Set(
    lists.filter((l) => l.category === 'shopping').map((l) => l.id),
  )

  const { items, overflow } = neededToday(
    tasks,
    listItems,
    viewedDate,
    shoppingListIds,
    expanded ? Infinity : undefined,
  )

  // The whole reason top-of-card placement is safe.
  if (items.length === 0) return null

  return (
    <div
      data-testid="needed-today-note"
      className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2"
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">
        Needed today
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind]
          return (
            <li key={`${item.source}-${item.id}`} data-testid="needed-today-row" className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={item.title}
                className="w-3.5 h-3.5 rounded border-neutral-300"
                onChange={() =>
                  item.source === 'task' ? onToggleTask(item.id) : onToggleListItem(item.id)
                }
              />
              <Icon className="w-3.5 h-3.5 shrink-0 text-amber-600/70" aria-hidden />
              <button
                type="button"
                className="text-left text-[13px] text-neutral-700 hover:text-neutral-900"
                onClick={() => item.source === 'task' && onOpenTask(item.id)}
              >
                {item.title}
              </button>
            </li>
          )
        })}
      </ul>
      {overflow > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[12px] text-amber-700/70 hover:text-amber-800"
        >
          +{overflow} more
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/schedule/NeededTodayNote.test.tsx src/lib/today/neededToday.test.ts
```
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/components/schedule/NeededTodayNote.tsx src/components/schedule/NeededTodayNote.test.tsx src/lib/today/neededToday.ts
git add src/components/schedule/NeededTodayNote.tsx src/components/schedule/NeededTodayNote.test.tsx src/lib/today/neededToday.ts
git commit -m "feat(needed-today): the note component, silent when empty"
```

---

### Task 5: Mount the note on Today and guard the invariant

**Files:**
- Modify: `src/components/schedule/TodayView.tsx:1011` (inside the day card, above the sections)
- Modify: `src/components/schedule/TodayInvariant.test.tsx`

**Interfaces:**
- Consumes: `NeededTodayNote` from Task 4
- Produces: the note rendered on Today for the viewed day

- [ ] **Step 1: Extend the invariant test first**

In `src/components/schedule/TodayInvariant.test.tsx`, add a case asserting the note does not grow with backlog. Add to the existing page-level describe:

```tsx
  it('the Needed Today note does not grow with backlog size', () => {
    const marked = { /* two tasks with neededOn = today */ }
    const small = renderTodayWithBacklog(5, marked)
    const smallRows = small.queryAllByTestId('needed-today-row').length
    small.unmount()

    const large = renderTodayWithBacklog(500, marked)
    const largeRows = large.queryAllByTestId('needed-today-row').length

    expect(largeRows).toBe(smallRows)
  })
```

Match the file's existing helper for building fixtures — it already renders the real `TodayView` at 5 vs 500 backlog tasks. Reuse that helper rather than inventing a second one; if it isn't parameterised for extra tasks, add a parameter.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/schedule/TodayInvariant.test.tsx`
Expected: FAIL — no `needed-today-row` elements, because the note isn't mounted.

- [ ] **Step 3: Mount the note**

In `src/components/schedule/TodayView.tsx`, import it and render immediately inside the day card `<div ref={listRef} …>` (line ~1011), before the `UnpromptedLines` block:

```tsx
        <NeededTodayNote
          tasks={tasks}
          viewedDate={data.date}
          onToggleTask={onToggleTask}
          onToggleListItem={onToggleListItem}
          onOpenTask={(id) => onSelectItem?.(`task-${id}`)}
        />
```

Wire `onToggleTask` / `onToggleListItem` from the props and contexts `TodayView` already has — `ScheduleActionsContext` for the task toggle, `ListsContext`'s `updateItem` for the list item. Do not add new prop drilling if a context already carries the handler.

- [ ] **Step 4: Run the invariant test to verify it passes**

Run: `npx vitest run src/components/schedule/TodayInvariant.test.tsx`
Expected: PASS — equal row counts at 5 and 500 backlog tasks.

- [ ] **Step 5: Run the FULL suite**

Run: `npx vitest run`
Expected: all PASS. A scoped run is not sufficient — `TodayView` is imported by many schedule tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/schedule/TodayView.tsx src/components/schedule/TodayInvariant.test.tsx
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayInvariant.test.tsx
git commit -m "feat(needed-today): mount the note on Today, guarded by the invariant test"
```

---

### Task 6: Desktop entry point — `⋯` menu and title chip

**Files:**
- Modify: `src/components/schedule/ScheduleItemActionsMenu.tsx:222` (beside the discussion entry)
- Modify: `src/components/schedule/ScheduleItem.tsx:618` (title chip cluster)
- Modify: `src/contexts/ScheduleActionsContext.tsx` (add the handler)
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (implement the handler)
- Test: `src/components/schedule/ScheduleItemActionsMenu.neededToday.test.tsx` (create)

**Interfaces:**
- Consumes: `updateTask` with `neededOn` from Task 2
- Produces: `ScheduleActionsValue.onSetNeededToday?: (taskId: string, neededOn: Date | null) => void`

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/ScheduleItemActionsMenu.neededToday.test.tsx`. Model the mock stack on the existing tests in this directory. Assert:

```tsx
  it('offers "Need today" for a task and calls the handler', () => {
    const onSetNeededToday = vi.fn()
    renderMenu({ item: taskItem({ id: 'a' }), onSetNeededToday })
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Need today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', expect.any(Date))
  })

  it('offers to clear it when already marked', () => {
    const onSetNeededToday = vi.fn()
    renderMenu({ item: taskItem({ id: 'a', neededOn: new Date() }), onSetNeededToday })
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Not needed today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', null)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/schedule/ScheduleItemActionsMenu.neededToday.test.tsx`
Expected: FAIL — no "Need today" entry.

- [ ] **Step 3: Add the menu entry**

In `ScheduleItemActionsMenu.tsx`, directly after the discussion button block (~line 222-233):

```tsx
            {isTask && ctx.onSetNeededToday && (
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={run(() =>
                  ctx.onSetNeededToday!(item.originalTask!.id, item.neededOn ? null : new Date()),
                )}
              >
                <AlertCircle className={`w-4 h-4 ${item.neededOn ? 'text-amber-500' : 'text-neutral-400'}`} />
                {item.neededOn ? 'Not needed today' : 'Need today'}
              </button>
            )}
```

Use the same class constant the neighbouring buttons use — copy it from the discussion button rather than inventing one. Import `AlertCircle` from `lucide-react`.

- [ ] **Step 4: Add the chip**

In `ScheduleItem.tsx`, in the title chip cluster near the discussion flag (~line 618), following the same pattern that comment describes ("the discussion *flag* is an indicator among the title chips"):

```tsx
              {item.neededOn && !item.completed && (
                <button
                  type="button"
                  title="Needed today — click to clear"
                  onClick={(e) => { e.stopPropagation(); onSetNeededToday?.(item.originalTask!.id, null) }}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 bg-amber-100/70"
                >
                  <AlertCircle className="w-3 h-3" aria-hidden />
                  Today
                </button>
              )}
```

- [ ] **Step 5: Thread `neededOn` onto the timeline item**

`TimelineItem` is built from `Task`. Add `neededOn?: Date` to the `TimelineItem` type and populate it wherever tasks are mapped into timeline items, so the menu and chip can read it. Search for where `needsDiscussion` is copied onto the timeline item and mirror it exactly.

- [ ] **Step 6: Add the context handler**

In `src/contexts/ScheduleActionsContext.tsx` add to `ScheduleActionsValue`:

```typescript
  /** Mark or clear "needed today". Pass null to clear. */
  onSetNeededToday?: (taskId: string, neededOn: Date | null) => void
```

In `HomeViewContainer.tsx`, implement and pass it:

```tsx
  const onSetNeededToday = useCallback(
    (taskId: string, neededOn: Date | null) => {
      void updateTask(taskId, { neededOn });
    },
    [updateTask],
  );
```

Add it to the `ScheduleActionsProvider` value object and its dependency array.

- [ ] **Step 7: Run tests, typecheck, lint**

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/schedule/ScheduleItemActionsMenu.tsx src/components/schedule/ScheduleItem.tsx src/contexts/ScheduleActionsContext.tsx src/apps/tasks/HomeViewContainer.tsx src/components/schedule/ScheduleItemActionsMenu.neededToday.test.tsx
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(needed-today): desktop menu entry and title chip"
```

---

### Task 7: Mobile entry point

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx:296+` (the `if (isMobile)` card branch)
- Test: extend `src/components/schedule/ScheduleItemActionsMenu.neededToday.test.tsx` or add a mobile-specific test file

**Interfaces:**
- Consumes: `onSetNeededToday` from Task 6
- Produces: a mobile control writing the same handler

- [ ] **Step 1: Write the failing test**

Add a test that mocks `useMobile` to `true`, renders `ScheduleItem` for a task, and asserts the mobile card exposes a "Need today" control that calls `onSetNeededToday` with the task id and a Date.

```tsx
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run <the mobile test file>`
Expected: FAIL — no such control on the mobile card.

- [ ] **Step 3: Add the control**

The mobile card has its own trailing cluster and its own swipe gestures (right → complete, left → edit). **Do not add a third swipe direction** — swipe semantics are already established and a third would be undiscoverable. Add the control to the mobile card's existing trailing cluster as a small icon button, rendered only for tasks:

```tsx
              {isTask && onSetNeededToday && (
                <button
                  type="button"
                  aria-label={item.neededOn ? 'Not needed today' : 'Need today'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetNeededToday(item.originalTask!.id, item.neededOn ? null : new Date())
                  }}
                  className="p-1.5 rounded-lg"
                >
                  <AlertCircle className={`w-4 h-4 ${item.neededOn ? 'text-amber-500' : 'text-neutral-300'}`} />
                </button>
              )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/components/schedule/ScheduleItem.tsx
git add -A
git commit -m "feat(needed-today): mobile card entry point"
```

---

### Task 8: `/lists` entry point

**Files:**
- Modify: `src/components/list/ListItemRow.tsx`
- Test: `src/components/list/ListItemRow.neededToday.test.tsx` (create)

**Interfaces:**
- Consumes: `updateItem(id, { neededOn })` from Task 2
- Produces: a per-row control marking a list item needed today

- [ ] **Step 1: Write the failing test**

Create `src/components/list/ListItemRow.neededToday.test.tsx`:

```tsx
  it('marks a list item as needed today', () => {
    const onSetNeededToday = vi.fn()
    render(<ListItemRow item={listItem({ id: 'i1' })} onSetNeededToday={onSetNeededToday} /* …other required props… */ />)
    fireEvent.click(screen.getByLabelText('Need today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('i1', expect.any(Date))
  })

  it('clears it when already marked', () => {
    const onSetNeededToday = vi.fn()
    render(<ListItemRow item={listItem({ id: 'i1', neededOn: new Date() })} onSetNeededToday={onSetNeededToday} /* … */ />)
    fireEvent.click(screen.getByLabelText('Not needed today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('i1', null)
  })
```

Read `ListItemRow.tsx` first and pass whatever props it actually requires — do not guess the signature.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/list/ListItemRow.neededToday.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the control and wire it**

Add an optional `onSetNeededToday?: (id: string, neededOn: Date | null) => void` prop to `ListItemRow`, render a small `AlertCircle` toggle in the row's existing trailing controls, and have `ListView.tsx` pass a handler that calls `updateItem(id, { neededOn })` from `ListsContext`.

**The handler must also announce the change**, or the note won't refresh until reload:

```typescript
import { TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'
// …after the await completes:
window.dispatchEvent(new Event(TO_BUY_CHANGED_EVENT))
```

`useNeededListItems` (Task 3b) listens for exactly this event.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/components/list/ListItemRow.tsx src/components/list/ListView.tsx src/components/list/ListItemRow.neededToday.test.tsx
git add -A
git commit -m "feat(needed-today): mark list items from /lists"
```

---

### Task 9: Expiry review in the ReviewDrawer

**Files:**
- Modify: `src/components/schedule/ReviewDrawer.tsx`
- Test: `src/components/schedule/ReviewDrawer.test.tsx` (extend)

**Interfaces:**
- Consumes: `Task.neededOn`, `onSetNeededToday` from Task 6
- Produces: a bounded "was needed yesterday" section

- [ ] **Step 1: Write the failing test**

Extend `ReviewDrawer.test.tsx`:

```tsx
  it('offers unfinished items from previous days, capped at 5', () => {
    const stale = Array.from({ length: 8 }, (_, n) =>
      task({ id: `s${n}`, title: `Stale ${n}`, neededOn: new Date(2026, 7, 18) }),
    )
    renderDrawer({ tasks: stale, today: new Date(2026, 7, 19) })
    expect(screen.getAllByTestId('needed-expired-row')).toHaveLength(5)
  })

  it('does not offer items still marked for today', () => {
    renderDrawer({ tasks: [task({ id: 'a', neededOn: new Date(2026, 7, 19) })], today: new Date(2026, 7, 19) })
    expect(screen.queryAllByTestId('needed-expired-row')).toHaveLength(0)
  })
```

Match the existing render helper and mock stack in that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/schedule/ReviewDrawer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the section**

Add a section listing incomplete tasks whose `neededOn` is before today, capped at 5 and ordered oldest-first (matching how the drawer's other pools are bounded). Each row offers re-mark (`onSetNeededToday(id, new Date())`) and let-go (`onSetNeededToday(id, null)`).

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/components/schedule/ReviewDrawer.tsx src/components/schedule/ReviewDrawer.test.tsx
git add -A
git commit -m "feat(needed-today): offer expired items back in the review drawer"
```

---

### Task 10: Verify in the browser, then ship

**Files:** none — verification only.

- [ ] **Step 1: Full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
node -v                                    # must be v22.14.0
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
npx eslint $(git diff --name-only origin/main -- '*.ts' '*.tsx')
```
Expected: all clean.

- [ ] **Step 2: Look at it in a browser**

Start the dev server from this worktree (`npx vite --port 5173 --strictPort`; the worktree needs its own `.env` or the screen is blank) and confirm by eye:

1. Today with nothing marked → **no note at all**, layout unchanged.
2. Mark a task "Need today" from the `⋯` menu → note appears at the top of the day card, chip appears on the row.
3. Tick the note's checkbox → task completes, row leaves the note.
4. Mark a To buy item from `/lists` → appears on the note with the bag icon.
5. Mark six items → five rows plus "+1 more"; clicking expands.
6. Clear the mark from the chip → note disappears when it was the last one.

A type-check is not inspection. Open it and look.

- [ ] **Step 3: Rebase and push**

```bash
git fetch origin && git rebase origin/main
npx vitest run                              # re-run after rebase
git push origin HEAD:main
```

- [ ] **Step 4: Confirm the deploy actually fired**

```bash
gh api repos/scottring/symphonyOS/deployments --jq '.[0] | "\(.sha[0:8]) \(.created_at) \(.environment)"'
```
A push to `main` sometimes silently fails to deploy — verify the new SHA appears, then check its status reaches `success`.

- [ ] **Step 5: Remove the worktree**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/needed-today
git branch -D feat/needed-today-note
```

---

## Self-review notes

**Spec coverage:** data model → Tasks 1–2; marked-item fetch → Task 3b; selector → Task 3; component and empty-render → Task 4; placement and invariant → Task 5; three entry points → Tasks 6, 7, 8; expiry review → Task 9; testing and browser verification → Tasks 3–5, 10. The To buy line is untouched by construction — no task modifies `ToBuyLine.tsx`.

**Corrections made during review, worth knowing before you start:**
- The spec claimed the note could read list items from `ListsContext`. It can't — `useListItems(selectedListId)` returns `[]` whenever no list is open, which is always true on Today. Hence Task 3b.
- The word "pin" is banned in code here. A `pinned_items` table and `usePinnedItems` hook already exist for a durable shortcuts shelf with a 21-day auto-unpin, which would directly contradict daily expiry.

**Known soft spots, flagged rather than hidden:**
- Task 6 Step 5 (threading `neededOn` onto `TimelineItem`) says "search for where `needsDiscussion` is copied and mirror it" instead of giving an exact line. The mapping is spread across several call sites; the implementer must find them all. If any are missed, the chip silently never renders.
- Task 8's test signature depends on `ListItemRow`'s actual props, which the plan does not enumerate. Read the file first.
- Task 9 reuses the drawer's existing pool-rendering conventions, which the plan describes rather than quotes.
