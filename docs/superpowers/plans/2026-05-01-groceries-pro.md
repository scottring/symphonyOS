# Groceries Pro: multi-store routing + pantry inventory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two follow-ups to the Send-to-Groceries modal: (1) per-ingredient overrides routing items to different store lists ("coffee → Mom's Super Market"), and (2) inline pantry inventory check (H/M/L) that auto-removes items marked "High" and surfaces usage-since-last-check as soft context.

**Architecture:** Two new household-RLS tables (`grocery_store_overrides`, `pantry_inventory`). Two new hooks. The existing `SendToGroceriesModal` (V1, in `groceries/`) gains: store-routing chip per item, level picker for pantry items, and a "marked sufficient" footer with restore. Send mutates multiple lists (one per destination). The Apple Reminders bridge already supports multiple list mappings — adding a new store is a manual step (Apple list + `lists` row + bridge config) but the modal makes any existing destination available.

**Tech Stack:** React 19 + TS strict, Supabase (Postgres + RLS), Tailwind v4. No edge function changes.

---

## File Structure

**Created**
- `supabase/migrations/086_grocery_store_overrides.sql`
- `supabase/migrations/087_pantry_inventory.sql`
- `src/hooks/useStoreOverrides.ts`
- `src/hooks/usePantryInventory.ts`

**Modified**
- `src/types/meal-planner.ts` — Db / domain types + mappers for both new tables
- `src/components/meals/groceries/SendToGroceriesModal.tsx` — store chips per item + level picker on pantry items + sufficient-items footer + multi-list send
- `src/components/meals/groceries/IngredientLineRow.tsx` — render store chip + level picker as new optional props
- `src/components/meals/plan/PlannerPage.tsx` — pass available stores list to the modal

---

## Task 1: Migration 086 — `grocery_store_overrides`

**Files:** Create `supabase/migrations/086_grocery_store_overrides.sql`

- [ ] Write migration:

```sql
-- 086_grocery_store_overrides.sql
-- Persistent per-ingredient routing rules. When a user marks a coffee ingredient
-- as "destination = Mom's", future plans automatically route coffee items to that
-- list. Pattern is matched against the ConsolidatedIngredient.text via the
-- existing ingredientKey normalizer (case-insensitive, prep-stripped).

create table grocery_store_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null check (length(trim(pattern)) > 0),
  target_list_id uuid not null references lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

create index grocery_store_overrides_user_idx on grocery_store_overrides(user_id);
create index grocery_store_overrides_target_idx on grocery_store_overrides(target_list_id);

alter table grocery_store_overrides enable row level security;

create policy "store overrides household select"
  on grocery_store_overrides for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household insert"
  on grocery_store_overrides for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household update"
  on grocery_store_overrides for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household delete"
  on grocery_store_overrides for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
```

- [ ] Apply via `mcp__supabase__apply_migration` with name `086_grocery_store_overrides`.
- [ ] Commit: `git add supabase/migrations/086_grocery_store_overrides.sql && git commit -m "feat(meals): grocery_store_overrides table with household RLS"`

---

## Task 2: Migration 087 — `pantry_inventory`

**Files:** Create `supabase/migrations/087_pantry_inventory.sql`

- [ ] Write migration:

```sql
-- 087_pantry_inventory.sql
-- Per-ingredient inventory level. Lets the Send-to-Groceries modal auto-remove
-- items the user has plenty of, and surface "marked high N days ago, used in M
-- recipes since" as soft context. Pattern is the same normalized form as
-- grocery_store_overrides.pattern.

create table pantry_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null check (length(trim(pattern)) > 0),
  level text not null check (level in ('high','medium','low','out')),
  last_checked_at timestamptz not null default now(),
  unique (user_id, pattern)
);

create index pantry_inventory_user_idx on pantry_inventory(user_id);

alter table pantry_inventory enable row level security;

create policy "pantry inventory household select"
  on pantry_inventory for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household insert"
  on pantry_inventory for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household update"
  on pantry_inventory for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household delete"
  on pantry_inventory for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
```

- [ ] Apply via MCP.
- [ ] Commit: `git add supabase/migrations/087_pantry_inventory.sql && git commit -m "feat(meals): pantry_inventory table with household RLS"`

---

## Task 3: Types — store overrides + pantry inventory

**Files:** Modify `src/types/meal-planner.ts`

- [ ] Append at the end of the file:

```ts
// ─────────────────────────────────────────────────────────────────
// grocery_store_overrides · routing rules per ingredient pattern
// ─────────────────────────────────────────────────────────────────

export interface DbStoreOverride {
  id: string
  user_id: string
  pattern: string
  target_list_id: string
  created_at: string
}

export interface StoreOverride {
  id: string
  pattern: string
  targetListId: string
}

export function dbStoreOverrideToOverride(row: DbStoreOverride): StoreOverride {
  return { id: row.id, pattern: row.pattern, targetListId: row.target_list_id }
}

// ─────────────────────────────────────────────────────────────────
// pantry_inventory · per-ingredient stock level
// ─────────────────────────────────────────────────────────────────

export type PantryLevel = 'high' | 'medium' | 'low' | 'out'

export interface DbPantryInventory {
  id: string
  user_id: string
  pattern: string
  level: PantryLevel
  last_checked_at: string
}

export interface PantryInventory {
  id: string
  pattern: string
  level: PantryLevel
  lastCheckedAt: Date
}

export function dbPantryToPantry(row: DbPantryInventory): PantryInventory {
  return {
    id: row.id,
    pattern: row.pattern,
    level: row.level,
    lastCheckedAt: new Date(row.last_checked_at),
  }
}
```

- [ ] `npx tsc --noEmit` clean.
- [ ] Commit: `git add src/types/meal-planner.ts && git commit -m "feat(meals): types for grocery_store_overrides + pantry_inventory"`

---

## Task 4: Hooks — `useStoreOverrides` + `usePantryInventory`

**Files:**
- Create: `src/hooks/useStoreOverrides.ts`
- Create: `src/hooks/usePantryInventory.ts`

- [ ] **useStoreOverrides.ts:**

```ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbStoreOverrideToOverride, type DbStoreOverride, type StoreOverride } from '@/types/meal-planner'

export function useStoreOverrides() {
  const [items, setItems] = useState<StoreOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('grocery_store_overrides').select('*').order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbStoreOverride[]).map(dbStoreOverrideToOverride))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (pattern: string, targetListId: string) => {
    const trimmed = pattern.trim().toLowerCase()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Upsert via insert+onConflict (unique on user_id + pattern)
    const { error: err } = await supabase
      .from('grocery_store_overrides')
      .upsert({ user_id: user.id, pattern: trimmed, target_list_id: targetListId }, { onConflict: 'user_id,pattern' })
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  const remove = useCallback(async (pattern: string) => {
    const trimmed = pattern.trim().toLowerCase()
    const { error: err } = await supabase.from('grocery_store_overrides').delete().eq('pattern', trimmed)
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  return { items, loading, error, upsert, remove, refresh }
}
```

- [ ] **usePantryInventory.ts:**

```ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbPantryToPantry, type DbPantryInventory, type PantryInventory, type PantryLevel } from '@/types/meal-planner'

export function usePantryInventory() {
  const [items, setItems] = useState<PantryInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('pantry_inventory').select('*')
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbPantryInventory[]).map(dbPantryToPantry))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setLevel = useCallback(async (pattern: string, level: PantryLevel) => {
    const trimmed = pattern.trim().toLowerCase()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase
      .from('pantry_inventory')
      .upsert(
        { user_id: user.id, pattern: trimmed, level, last_checked_at: new Date().toISOString() },
        { onConflict: 'user_id,pattern' },
      )
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  const clear = useCallback(async (pattern: string) => {
    const trimmed = pattern.trim().toLowerCase()
    const { error: err } = await supabase.from('pantry_inventory').delete().eq('pattern', trimmed)
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  return { items, loading, error, setLevel, clear, refresh }
}
```

- [ ] `npx tsc --noEmit` clean.
- [ ] Commit: `git add src/hooks/useStoreOverrides.ts src/hooks/usePantryInventory.ts && git commit -m "feat(meals): useStoreOverrides + usePantryInventory hooks"`

---

## Task 5: Modal — store routing chips + multi-list send

**Files:**
- Modify: `src/components/meals/groceries/SendToGroceriesModal.tsx`
- Modify: `src/components/meals/groceries/IngredientLineRow.tsx`
- Modify: `src/components/meals/plan/PlannerPage.tsx`
- Create: `src/components/meals/groceries/StoreChip.tsx`

### Step 1: New `StoreChip.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'

interface Store {
  id: string
  title: string
}

interface Props {
  selectedListId: string
  stores: Store[]
  onSelect: (listId: string) => void
}

/** Compact chip showing the destination store. Tap to choose another. */
export function StoreChip({ selectedListId, stores, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = stores.find(s => s.id === selectedListId)
  const label = current?.title ?? '?'

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="text-[11px] uppercase tracking-wider text-neutral-500 hover:text-primary-500 px-2 py-0.5 rounded-full border border-neutral-200 hover:border-primary-200 transition-colors"
        title={`Destination: ${label}`}
      >
        → {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-neutral-200 bg-bg-elevated shadow-card overflow-hidden">
          {stores.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary-50 ${s.id === selectedListId ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Step 2: Update `IngredientLineRow.tsx`

Add new optional props:

```tsx
interface Props {
  item: ConsolidatedIngredient
  fromRecipeTitles?: string[]
  /** Right-edge slot for status chips (store, pantry level). */
  rightAccessory?: React.ReactNode
  onChange: (newText: string) => void
  onRemove: () => void
}
```

In the JSX, render `rightAccessory` between the `Nx` badge and the `×` button:

```tsx
{rightAccessory && (
  <div className="mt-1 shrink-0">{rightAccessory}</div>
)}
```

### Step 3: Update `SendToGroceriesModal.tsx`

Add new props:

```tsx
interface Props {
  isOpen: boolean
  onClose: () => void
  consolidated: ConsolidatedIngredient[]
  groceriesListId: string | null
  /** All available household lists tagged external_source='apple_reminders'. */
  stores: { id: string; title: string }[]
  currentItemTexts: string[]
  recipesById?: Map<string, Recipe>
  onSent: () => void
}
```

Inside the component:

1. `const { items: storeOverrides, upsert: upsertStoreOverride } = useStoreOverrides()`
2. Build `patternToListId` from `storeOverrides` (`Map<pattern, list_id>`).
3. Compute, per item, its destination list id: `storeOverrides.find(o => o.pattern === keyOf(item.text))?.targetListId ?? groceriesListId`.
4. Define a `keyOf(text: string): string` that mirrors `ingredientKey` from `consolidateIngredients.ts` — for v1 use `text.toLowerCase().trim()` (sufficient since the modal text is already the consolidated form).
5. Pass each item's destination + onSelect handler to a `<StoreChip>` rendered as `rightAccessory` on the line row. `onSelect` calls `upsertStoreOverride(keyOf(item.text), listId)`, then optimistically updates a local `localDestinationByItem: Map<itemId, listId>`.
6. In `handleSend`, group items by destination listId and run one insert per list.

Rough send flow:

```ts
const handleSend = async () => {
  if (items.length === 0) return
  setSending(true); setError(null)
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) { setError('not authenticated'); setSending(false); return }

  const groups = new Map<string, ConsolidatedIngredient[]>()
  for (const it of items) {
    const dest = localDestinationByItem.get(itemKey(it)) ??
      storeOverrides.find(o => o.pattern === keyOf(it.text))?.targetListId ??
      groceriesListId
    if (!dest) continue
    const arr = groups.get(dest) ?? []
    arr.push(it)
    groups.set(dest, arr)
  }

  for (const [listId, list] of groups) {
    const inserts = list.map((it, idx) => ({
      list_id: listId,
      user_id: userId,
      text: it.text,
      sort_order: idx,
      completed: false,
    }))
    const { error: err } = await supabase.from('list_items').insert(inserts)
    if (err) { setError(err.message); setSending(false); return }
  }

  setSending(false)
  onSent()
  onClose()
}
```

The `Send N to Groceries` label text gets a small subtitle if multiple destinations: `Send 56 — 50 to Groceries · 6 to Mom's Super Market`. Implementation: count groups; if >1, render a multi-line button label.

### Step 4: Update `PlannerPage.tsx`

Where the modal is mounted, fetch the available stores list. Add a small util in PlannerPage:

```ts
const { data: storesRows } = useSWR... // or a useEffect+useState
// Fetch household lists with external_source='apple_reminders' on mount.
```

Or simpler, since `useGroceryStatus` only fetches the Groceries list right now: extend it (or add a new tiny hook `useGroceryStores`) that fetches all `external_source='apple_reminders'` rows visible to the household. Pass them as `stores` prop:

```tsx
<SendToGroceriesModal
  isOpen={sendOpen}
  onClose={() => setSendOpen(false)}
  consolidated={status.consolidated}
  groceriesListId={status.groceriesListId}
  stores={status.stores}  // NEW
  currentItemTexts={[]}
  recipesById={recipesById}
  onSent={() => status.refresh()}
/>
```

Update `useGroceryStatus` to also return `stores: { id: string; title: string }[]`. Fetch in the existing `refresh()`:

```ts
const { data: storeRows } = await supabase
  .from('lists').select('id,title')
  .eq('external_source', 'apple_reminders')
  .order('title', { ascending: true })
setStores((storeRows ?? []) as { id: string; title: string }[])
```

(Keep the existing `groceriesListId` lookup as the default.)

### Step 5: Verify

```bash
npx tsc --noEmit
npm run build
```

Both must pass.

### Step 6: Commit

```bash
git add src/components/meals/groceries/StoreChip.tsx src/components/meals/groceries/SendToGroceriesModal.tsx src/components/meals/groceries/IngredientLineRow.tsx src/components/meals/plan/PlannerPage.tsx src/hooks/useGroceryStatus.ts
git commit -m "feat(meals): per-ingredient store routing — multi-list send"
```

---

## Task 6: Modal — pantry level picker + sufficient footer

**Files:**
- Modify: `src/components/meals/groceries/SendToGroceriesModal.tsx`
- Create: `src/components/meals/groceries/PantryLevelPicker.tsx`

### Step 1: Create `PantryLevelPicker.tsx`

```tsx
import type { PantryLevel } from '@/types/meal-planner'

interface Props {
  level: PantryLevel | null
  onSelect: (level: PantryLevel) => void
  context?: string  // e.g. "marked high 8 days ago — used in 4 recipes since"
}

const LEVELS: Array<{ key: PantryLevel; label: string; tone: string }> = [
  { key: 'high',   label: 'H', tone: 'bg-sage-100 text-sage-700' },
  { key: 'medium', label: 'M', tone: 'bg-neutral-100 text-neutral-600' },
  { key: 'low',    label: 'L', tone: 'bg-amber-100 text-amber-700' },
]

/** Three-state inline level picker. Tone reflects "have plenty" → "buy now". */
export function PantryLevelPicker({ level, onSelect, context }: Props) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex gap-1">
        {LEVELS.map(({ key, label, tone }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(key) }}
            title={`Mark ${key}`}
            className={`h-5 w-5 rounded text-[10px] font-bold transition-opacity ${level === key ? tone : 'bg-neutral-50 text-neutral-300 hover:opacity-70'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {context && (
        <div className="text-[10px] italic text-neutral-400 max-w-[180px] text-right truncate" title={context}>
          {context}
        </div>
      )}
    </div>
  )
}
```

### Step 2: Wire into `SendToGroceriesModal.tsx`

1. `const { items: pantryItems, setLevel: setPantryLevel } = usePantryInventory()`.
2. Compute `pantryByPattern: Map<pattern, PantryInventory>` from `pantryItems`.
3. For each item where `item.category` is in `['Pantry','Other','Spices']`:
   - Look up `pantry = pantryByPattern.get(keyOf(item.text))`
   - Render `<PantryLevelPicker>` as `rightAccessory` (combined with the StoreChip — see compose note below)
   - On level select: `setPantryLevel(keyOf(item.text), level)`. If `level === 'high'`, **remove the item from `items`** (auto-drop). Track removed items in `suppressedHighItems: ConsolidatedIngredient[]` for the footer.
4. **Compose right-accessory**: Pantry-categorized items render BOTH the StoreChip AND the level picker stacked vertically:

   ```tsx
   rightAccessory={
     <div className="flex flex-col items-end gap-1">
       <StoreChip ... />
       {isPantryCategory && <PantryLevelPicker ... />}
     </div>
   }
   ```

5. **Sufficient footer** — render between the items list and the action buttons:

   ```tsx
   {suppressedHighItems.length > 0 && (
     <div className="mt-4 text-[12px] italic text-neutral-500 px-6 pb-2">
       {suppressedHighItems.length} item{suppressedHighItems.length === 1 ? '' : 's'} marked sufficient: {suppressedHighItems.map(i => i.text).join(', ')}.
       <button onClick={() => setSuppressedHighItems([])} className="ml-2 text-primary-500 not-italic hover:text-primary-600 underline">
         Show / Restore
       </button>
     </div>
   )}
   ```

   Restore puts the items back into `items` AND clears their `pantry_inventory` row (call `clear(pattern)`).

6. **Build the `context` string** for the level picker: read `pantry.lastCheckedAt` and count usage in current plan. The plan is in scope as a derived value (passed via `consolidated.fromRecipeIds` per item — that's the count of recipes using this ingredient THIS WEEK):

   ```ts
   function pantryContext(pantry: PantryInventory | undefined, item: ConsolidatedIngredient): string | undefined {
     if (!pantry) return undefined
     const days = Math.max(1, Math.round((Date.now() - pantry.lastCheckedAt.getTime()) / 86400000))
     const useCount = item.fromRecipeIds.length
     return `marked ${pantry.level} ${days}d ago — used in ${useCount} recipe${useCount === 1 ? '' : 's'}`
   }
   ```

### Step 3: Verify

```bash
npx tsc --noEmit
npm run build
```

### Step 4: Commit

```bash
git add src/components/meals/groceries/PantryLevelPicker.tsx src/components/meals/groceries/SendToGroceriesModal.tsx
git commit -m "feat(meals): pantry inventory H/M/L picker + sufficient-items footer"
```

---

## Task 7: End-to-end manual verification

- [ ] Run automated checks:

```bash
npx tsc --noEmit
npm run build
npx vitest run src/lib/consolidateIngredients.test.ts src/lib/mealPlanValidation.test.ts src/hooks/useMealPlan.test.ts
```

All exit 0. All tests pass (no new tests required — the new hooks are thin wrappers and the modal is visual-only).

- [ ] Manual: open `/meals/plan`, click *Send to Groceries*. Verify:
  - Each item has a `→ Groceries` chip on the right
  - Pantry / Other / Spices items have an H / M / L picker
  - Tapping a chip on (e.g.) "coffee" and selecting another store changes destination + persists across reopen
  - Tapping `H` on (e.g.) "salt" removes it from the list, footer shows "1 item marked sufficient: salt." Restore button works.
  - Click *Send* → in Supabase, confirm `list_items` rows landed in the correct lists. Bridge picks up within 60s.

- [ ] Marker commit: `git commit --allow-empty -m "test(meals): end-to-end verification of multi-store + pantry inventory"`

---

## Verification

- `npx tsc --noEmit` exits 0
- `npm run build` succeeds
- All vitest suites pass
- Multi-store routing: at least one ingredient routed to a non-default destination, items land in two `lists` rows
- Pantry inventory: at least one "high" item auto-removed, restore works
