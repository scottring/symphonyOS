# Symphony Home App — Phase 1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md`](../specs/2026-05-06-home-app-phase-1a-design.md)

**Goal:** Land the Home registry foundation — a new top-level Symphony app for organizing the house and life across desktop, mobile, and the kitchen kiosk.

**Architecture:** Three new Postgres tables (`homes`, `spaces`, `assets`) shared by household via the existing `users_share_household` RLS helper. Reuse Symphony's existing infrastructure aggressively: notes, attachments, household sharing, kiosk_cards stream, kiosk-agent edge function, inbox triage primitive. New code is the thin app-specific layer on top.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (Nordic Journal), Supabase (Postgres + Storage + Realtime + RLS), Vitest + React Testing Library, Playwright (Desktop + Mobile Chrome).

**Naming convention chosen:** Match existing pattern (`useContacts`, `pantry_inventory`, etc.):
- DB ownership = `user_id` column + `users_share_household(auth.uid(), user_id)` for household-shared reads/writes.
- The spec described `household_id` on homes; implementation uses `user_id` + sharing helper to match conventions. Behavior is identical for the user.

---

## Task overview (21 tasks, sequenced)

| # | Task | Files |
|---|------|-------|
| 1 | DB migration + RLS test | `supabase/migrations/091_home_registry.sql`, `supabase/tests/091_home_registry.test.sql` |
| 2 | Types | `src/types/home.ts` |
| 3 | `useHomes` hook (TDD) | `src/hooks/useHomes.ts`, test |
| 4 | `useSpaces` hook (TDD) | `src/hooks/useSpaces.ts`, test |
| 5 | `useAssets` hook (TDD) | `src/hooks/useAssets.ts`, test |
| 6 | `useReferenceFacts` hook (TDD) | `src/hooks/useReferenceFacts.ts`, test |
| 7 | App scaffold + sidebar wiring + routes | `src/apps/home/HomeApp.tsx`, `src/apps/home/index.ts`, `src/components/layout/Sidebar.tsx`, App.tsx |
| 8 | Asset type config | `src/apps/home/assetTypes.ts` |
| 9 | `HomeOverview` component | `src/apps/home/HomeOverview.tsx`, test |
| 10 | `ReferenceFactsCard` + `FactRow` | `src/apps/home/facts/*.tsx`, tests |
| 11 | `SpaceView` component | `src/apps/home/SpaceView.tsx`, test |
| 12 | `AssetDetailPanel` | `src/apps/home/AssetDetailPanel.tsx`, test |
| 13 | `AssetView` (full-page) | `src/apps/home/AssetView.tsx`, test |
| 14 | `AssetCapture` (photo-first) | `src/apps/home/capture/AssetCapture.tsx`, test |
| 15 | `RoomSessionMode` | `src/apps/home/capture/RoomSessionMode.tsx`, test |
| 16 | Inbox "Home items needing details" section | inbox component(s) |
| 17 | WallCalendar tab toggle (Calendar/Rooms) | `src/components/wall/WallCalendar.tsx` (refactor) |
| 18 | Kiosk views (Rooms grid, Space, Asset modal) | `src/apps/home/kiosk/*.tsx`, tests |
| 19 | Kiosk card types + kiosk-agent rules + `source_asset_id` column | migration `092`, `supabase/functions/kiosk-agent/index.ts` |
| 20 | E2E happy paths (desktop, mobile, kiosk) | `e2e/home-*.spec.ts` |
| 21 | Self-review + final verification | — |

---

## Task 1: DB migration + RLS test

**Files:**
- Create: `supabase/migrations/091_home_registry.sql`
- Create: `supabase/tests/091_home_registry.test.sql`

- [ ] **Step 1: Investigate existing household sharing pattern**

Read these for reference (do not modify):
- `supabase/migrations/087_pantry_inventory.sql` — RLS template using `users_share_household`
- `supabase/migrations/079_meal_household_and_for_who.sql` — meal-planner sharing pattern
- `supabase/migrations/090_onboarding_v2_meal_rhythms.sql` — most recent migration (style)

Confirm: `users_share_household(auth.uid(), user_id)` returns boolean; tables use `user_id` column for ownership.

- [ ] **Step 2: Write migration `091_home_registry.sql`**

Create `supabase/migrations/091_home_registry.sql`:

```sql
-- 091_home_registry.sql
-- Home app Phase 1A: registry foundation.
-- See docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md
--
-- Three new tables:
--   homes   — top-level home entity (one row per household by default)
--   spaces  — rooms AND zones in one table; self-ref for room→zone
--   assets  — every asset is item OR collection (asset_kind flag)
--
-- Sharing model: user_id ownership + users_share_household() helper
-- (matches existing meal_planner / pantry_inventory pattern).

-- ─────────────────────────────────────────────────────────────────
-- homes
-- ─────────────────────────────────────────────────────────────────
create table homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index homes_user_idx on homes(user_id);

alter table homes enable row level security;

create policy "homes household select" on homes for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "homes household insert" on homes for insert
  with check (auth.uid() = user_id);
create policy "homes household update" on homes for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "homes household delete" on homes for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- spaces (rooms + zones in one table)
-- ─────────────────────────────────────────────────────────────────
create table spaces (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  parent_space_id uuid references spaces(id) on delete cascade,
  space_type text not null check (space_type in ('room','zone')),
  name text not null check (length(trim(name)) > 0),
  photo_url text,
  sort_order int not null default 0,
  facts jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rooms have no parent; zones must have a parent.
  -- Application enforces parent must be a room (no nested zones).
  constraint zone_parent_consistency check (
    (space_type = 'room' and parent_space_id is null) or
    (space_type = 'zone' and parent_space_id is not null)
  )
);

create index spaces_home_idx on spaces(home_id, space_type);
create index spaces_parent_idx on spaces(parent_space_id) where parent_space_id is not null;

alter table spaces enable row level security;

create policy "spaces household select" on spaces for select
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household insert" on spaces for insert
  with check (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household update" on spaces for update
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "spaces household delete" on spaces for delete
  using (
    exists (
      select 1 from homes h
      where h.id = spaces.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- assets
-- ─────────────────────────────────────────────────────────────────
create table assets (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  space_id uuid references spaces(id) on delete set null,
  asset_kind text not null default 'item' check (asset_kind in ('item','collection')),
  asset_type text not null default 'other' check (asset_type in
    ('appliance','vehicle','electronics','furniture','fixture','tool','collection','other')),
  name text not null check (length(trim(name)) > 0),
  photo_url text,
  purchase_date date,
  purchase_price numeric,
  warranty_expires_at date,
  serial_number text,
  manual_url text,
  tags text[] not null default '{}'::text[],
  details jsonb not null default '{}'::jsonb,
  notes_id uuid references notes(id) on delete set null,
  domain text not null default 'family' check (domain in ('work','family','personal')),
  needs_details bool not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_home_idx on assets(home_id);
create index assets_space_idx on assets(space_id) where space_id is not null;
create index assets_needs_details_idx on assets(home_id) where needs_details = true;
create index assets_warranty_idx on assets(home_id, warranty_expires_at)
  where warranty_expires_at is not null;

alter table assets enable row level security;

create policy "assets household select" on assets for select
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household insert" on assets for insert
  with check (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household update" on assets for update
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );
create policy "assets household delete" on assets for delete
  using (
    exists (
      select 1 from homes h
      where h.id = assets.home_id
        and (h.user_id = auth.uid() or users_share_household(auth.uid(), h.user_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- updated_at triggers (mirror existing pattern in earlier migrations)
-- ─────────────────────────────────────────────────────────────────
create trigger homes_updated_at before update on homes
  for each row execute function set_updated_at();
create trigger spaces_updated_at before update on spaces
  for each row execute function set_updated_at();
create trigger assets_updated_at before update on assets
  for each row execute function set_updated_at();

comment on table homes is 'Home app: top-level home entity. One per household by default.';
comment on table spaces is 'Home app: rooms (parent_space_id NULL) and zones (parent → room). No nested zones.';
comment on table assets is 'Home app: physical items or collections, located in a space.';
comment on column assets.needs_details is 'True after photo-first capture; surfaces in inbox triage until filled.';
comment on column spaces.facts is 'Typed list of reference facts: [{type,label,value}]. Types: wifi|paint|code|supply|measurement|freetext.';
```

If `set_updated_at()` does not exist in the project (check earlier migrations), include this at the top of the migration:

```sql
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
```

- [ ] **Step 3: Apply migration via Management API**

Per project memory: migration history is out of sync, use Management API for SQL.

```bash
SQL=$(cat supabase/migrations/091_home_registry.sql | jq -Rs .)
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
```

Expected: HTTP 200 with empty result.

If error: read response carefully — the most likely failure is `set_updated_at()` not existing (add it) or `notes` table not existing (the FK to notes won't match — adapt the FK or remove and add later).

- [ ] **Step 4: Write RLS test `supabase/tests/091_home_registry.test.sql`**

Create `supabase/tests/091_home_registry.test.sql`:

```sql
-- 091_home_registry.test.sql
-- Verify household isolation: a user in household A cannot see household B's homes.
-- Run after applying migration 091.

begin;

-- Two users in different households (assumes existing test seed in this project).
-- Replace UUIDs below if test seed uses different fixtures.
insert into homes (id, user_id, name) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'House A'),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'House B');

-- Simulate auth as user 1
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- User 1 should see exactly 1 home
select count(*) = 1 as user1_sees_one
  from homes;

-- Switch to user 2
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

select count(*) = 1 as user2_sees_one
  from homes;

rollback;
```

Run via Management API (same pattern as Step 3) and verify the two `select` statements return `t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/091_home_registry.sql supabase/tests/091_home_registry.test.sql
git commit -m "feat(home-app): add homes/spaces/assets schema with RLS

Migration 091 introduces the Home app Phase 1A registry foundation.
RLS uses the existing users_share_household helper. See spec at
docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md."
```

---

## Task 2: Types

**Files:**
- Create: `src/types/home.ts`

- [ ] **Step 1: Create the types file**

Create `src/types/home.ts`:

```typescript
// src/types/home.ts
// Types for the Home app (Phase 1A).
// See docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md

export type SpaceType = 'room' | 'zone'

export type AssetKind = 'item' | 'collection'

export type AssetType =
  | 'appliance'
  | 'vehicle'
  | 'electronics'
  | 'furniture'
  | 'fixture'
  | 'tool'
  | 'collection'
  | 'other'

export type FactType = 'wifi' | 'paint' | 'code' | 'supply' | 'measurement' | 'freetext'

export type Domain = 'work' | 'family' | 'personal'

export interface Home {
  id: string
  userId: string
  name: string
  address?: string
  createdAt: Date
  updatedAt: Date
}

export interface Fact {
  type: FactType
  label: string
  value: string
}

export interface Space {
  id: string
  homeId: string
  parentSpaceId: string | null
  spaceType: SpaceType
  name: string
  photoUrl?: string
  sortOrder: number
  facts: Fact[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface Asset {
  id: string
  homeId: string
  spaceId: string | null
  assetKind: AssetKind
  assetType: AssetType
  name: string
  photoUrl?: string
  purchaseDate?: string  // YYYY-MM-DD
  purchasePrice?: number
  warrantyExpiresAt?: string  // YYYY-MM-DD
  serialNumber?: string
  manualUrl?: string
  tags: string[]
  details: Record<string, unknown>
  notesId: string | null
  domain: Domain
  needsDetails: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// Display helpers
export function assetTypeLabel(t: AssetType): string {
  switch (t) {
    case 'appliance': return 'Appliance'
    case 'vehicle': return 'Vehicle'
    case 'electronics': return 'Electronics'
    case 'furniture': return 'Furniture'
    case 'fixture': return 'Fixture'
    case 'tool': return 'Tool'
    case 'collection': return 'Collection'
    case 'other': return 'Other'
  }
}

export function factTypeLabel(t: FactType): string {
  switch (t) {
    case 'wifi': return 'WiFi'
    case 'paint': return 'Paint'
    case 'code': return 'Code / Combo'
    case 'supply': return 'Supply / Spec'
    case 'measurement': return 'Measurement'
    case 'freetext': return 'Note'
  }
}
```

- [ ] **Step 2: Verify type compilation**

```bash
npm run build
```

Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/home.ts
git commit -m "feat(home-app): add Home/Space/Asset/Fact types"
```

---

## Task 3: `useHomes` hook (TDD)

**Files:**
- Create: `src/hooks/useHomes.ts`
- Create: `src/hooks/useHomes.test.ts`

Pattern: matches `src/hooks/useContacts.ts` (read it first as reference).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useHomes.test.ts`:

```typescript
// src/hooks/useHomes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useHomes } from './useHomes'

vi.mock('@/lib/supabase', () => {
  const builders = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    order: vi.fn(),
  }
  return {
    supabase: {
      from: vi.fn(() => builders),
      __builders: builders,
    },
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const FIXTURE = {
  id: 'home-1',
  user_id: 'user-1',
  name: 'Main House',
  address: null,
  created_at: '2026-05-06T00:00:00Z',
  updated_at: '2026-05-06T00:00:00Z',
}

describe('useHomes', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b)
    b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [FIXTURE], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: FIXTURE, error: null })
  })

  it('loads homes on mount and maps DB shape', async () => {
    const { result } = renderHook(() => useHomes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.homes).toHaveLength(1)
    expect(result.current.homes[0].id).toBe('home-1')
    expect(result.current.homes[0].name).toBe('Main House')
    expect(result.current.homes[0].createdAt).toBeInstanceOf(Date)
  })

  it('addHome inserts and returns the new home', async () => {
    const { result } = renderHook(() => useHomes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const created = await act(async () => result.current.addHome({ name: 'New' }))
    expect(created?.name).toBe('Main House') // mocked single() returns fixture
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/hooks/useHomes.test.ts
```

Expected: FAIL with "Cannot find module './useHomes'".

- [ ] **Step 3: Implement `useHomes`**

Create `src/hooks/useHomes.ts`:

```typescript
// src/hooks/useHomes.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Home } from '@/types/home'

interface DbHome {
  id: string
  user_id: string
  name: string
  address: string | null
  created_at: string
  updated_at: string
}

function dbHomeToHome(db: DbHome): Home {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    address: db.address ?? undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useHomes() {
  const { user } = useAuth()
  const [homes, setHomes] = useState<Home[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setHomes([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      if (!user) return
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('homes')
        .select('*')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (e) {
        setError(e.message)
        setLoading(false)
        return
      }
      setHomes((data as DbHome[]).map(dbHomeToHome))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const addHome = useCallback(async (input: { name: string; address?: string }): Promise<Home | null> => {
    if (!user) return null
    const { data, error: e } = await supabase
      .from('homes')
      .insert({ user_id: user.id, name: input.name, address: input.address ?? null })
      .select('*')
      .single()
    if (e || !data) {
      setError(e?.message ?? 'insert failed')
      return null
    }
    const home = dbHomeToHome(data as DbHome)
    setHomes((prev) => [...prev, home])
    return home
  }, [user])

  const updateHome = useCallback(async (id: string, patch: Partial<{ name: string; address: string }>): Promise<void> => {
    const { error: e } = await supabase
      .from('homes')
      .update(patch)
      .eq('id', id)
    if (e) { setError(e.message); return }
    setHomes((prev) => prev.map((h) => h.id === id ? { ...h, ...patch, updatedAt: new Date() } : h))
  }, [])

  return { homes, loading, error, addHome, updateHome }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest src/hooks/useHomes.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHomes.ts src/hooks/useHomes.test.ts
git commit -m "feat(home-app): add useHomes hook"
```

---

## Task 4: `useSpaces` hook (TDD)

**Files:**
- Create: `src/hooks/useSpaces.ts`
- Create: `src/hooks/useSpaces.test.ts`

Application enforces zones cannot have zones as parents.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useSpaces.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSpaces } from './useSpaces'

vi.mock('@/lib/supabase', () => {
  const b = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    eq: vi.fn(), single: vi.fn(), order: vi.fn(),
  }
  return { supabase: { from: vi.fn(() => b), __builders: b } }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ROOM = { id: 'room-1', home_id: 'h1', parent_space_id: null, space_type: 'room',
  name: 'Kitchen', photo_url: null, sort_order: 0, facts: [], created_by: 'u1',
  created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z' }

describe('useSpaces', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b); b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [ROOM], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: ROOM, error: null })
  })

  it('loads spaces filtered by homeId', async () => {
    const { result } = renderHook(() => useSpaces('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.spaces).toHaveLength(1)
    expect(result.current.rooms).toHaveLength(1)
    expect(result.current.zones).toHaveLength(0)
  })

  it('addZone refuses to nest under another zone', async () => {
    const { result } = renderHook(() => useSpaces('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(
      act(async () => result.current.addZone({ parentSpaceId: 'zone-x', name: 'sub' }))
    ).rejects.toThrow(/zones cannot be nested/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/hooks/useSpaces.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `useSpaces`**

Create `src/hooks/useSpaces.ts`:

```typescript
// src/hooks/useSpaces.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Space, Fact } from '@/types/home'

interface DbSpace {
  id: string
  home_id: string
  parent_space_id: string | null
  space_type: 'room' | 'zone'
  name: string
  photo_url: string | null
  sort_order: number
  facts: Fact[]
  created_by: string
  created_at: string
  updated_at: string
}

function dbSpaceToSpace(db: DbSpace): Space {
  return {
    id: db.id,
    homeId: db.home_id,
    parentSpaceId: db.parent_space_id,
    spaceType: db.space_type,
    name: db.name,
    photoUrl: db.photo_url ?? undefined,
    sortOrder: db.sort_order,
    facts: db.facts ?? [],
    createdBy: db.created_by,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useSpaces(homeId: string | undefined) {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !homeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpaces([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('spaces')
        .select('*')
        .eq('home_id', homeId)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (e) { setError(e.message); setLoading(false); return }
      setSpaces((data as DbSpace[]).map(dbSpaceToSpace))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user, homeId])

  const rooms = useMemo(() => spaces.filter((s) => s.spaceType === 'room'), [spaces])
  const zones = useMemo(() => spaces.filter((s) => s.spaceType === 'zone'), [spaces])

  const addRoom = useCallback(async (input: { name: string; photoUrl?: string }): Promise<Space | null> => {
    if (!user || !homeId) return null
    const { data, error: e } = await supabase
      .from('spaces')
      .insert({
        home_id: homeId, parent_space_id: null, space_type: 'room',
        name: input.name, photo_url: input.photoUrl ?? null,
        created_by: user.id, facts: [],
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const sp = dbSpaceToSpace(data as DbSpace)
    setSpaces((prev) => [...prev, sp])
    return sp
  }, [user, homeId])

  const addZone = useCallback(async (input: { parentSpaceId: string; name: string; photoUrl?: string }): Promise<Space | null> => {
    if (!user || !homeId) return null
    const parent = spaces.find((s) => s.id === input.parentSpaceId)
    if (parent && parent.spaceType !== 'room') {
      throw new Error('zones cannot be nested inside other zones')
    }
    const { data, error: e } = await supabase
      .from('spaces')
      .insert({
        home_id: homeId, parent_space_id: input.parentSpaceId, space_type: 'zone',
        name: input.name, photo_url: input.photoUrl ?? null,
        created_by: user.id, facts: [],
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const sp = dbSpaceToSpace(data as DbSpace)
    setSpaces((prev) => [...prev, sp])
    return sp
  }, [user, homeId, spaces])

  const updateSpace = useCallback(async (id: string, patch: Partial<{ name: string; photoUrl: string; sortOrder: number; facts: Fact[] }>): Promise<void> => {
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl
    if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder
    if (patch.facts !== undefined) dbPatch.facts = patch.facts
    const { error: e } = await supabase.from('spaces').update(dbPatch).eq('id', id)
    if (e) { setError(e.message); return }
    setSpaces((prev) => prev.map((s) => s.id === id ? { ...s, ...patch, updatedAt: new Date() } as Space : s))
  }, [])

  const deleteSpace = useCallback(async (id: string): Promise<void> => {
    const { error: e } = await supabase.from('spaces').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setSpaces((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { spaces, rooms, zones, loading, error, addRoom, addZone, updateSpace, deleteSpace }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest src/hooks/useSpaces.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSpaces.ts src/hooks/useSpaces.test.ts
git commit -m "feat(home-app): add useSpaces hook with zone-nesting guard"
```

---

## Task 5: `useAssets` hook (TDD)

**Files:**
- Create: `src/hooks/useAssets.ts`
- Create: `src/hooks/useAssets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAssets.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAssets } from './useAssets'

vi.mock('@/lib/supabase', () => {
  const b = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    eq: vi.fn(), single: vi.fn(), order: vi.fn(),
  }
  return { supabase: { from: vi.fn(() => b), __builders: b } }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ASSET = {
  id: 'a1', home_id: 'h1', space_id: 'room-1', asset_kind: 'item',
  asset_type: 'appliance', name: 'Dishwasher', photo_url: null,
  purchase_date: null, purchase_price: null, warranty_expires_at: null,
  serial_number: null, manual_url: null, tags: [], details: {},
  notes_id: null, domain: 'family', needs_details: false,
  created_by: 'u1', created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z',
}

describe('useAssets', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b); b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [ASSET], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: ASSET, error: null })
  })

  it('loads assets for a home', async () => {
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assets).toHaveLength(1)
    expect(result.current.assets[0].name).toBe('Dishwasher')
  })

  it('captureAsset sets needs_details=true', async () => {
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let createdInsert: any
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.insert.mockImplementation((row: any) => { createdInsert = row; return b })
    await act(async () => result.current.captureAsset({ name: 'Bike', spaceId: 'room-1' }))
    expect(createdInsert.needs_details).toBe(true)
  })

  it('needsDetailsAssets filters correctly', async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.order.mockResolvedValueOnce({ data: [{ ...ASSET, needs_details: true }, ASSET], error: null })
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.needsDetailsAssets).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/hooks/useAssets.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `useAssets`**

Create `src/hooks/useAssets.ts`:

```typescript
// src/hooks/useAssets.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Asset, AssetKind, AssetType, Domain } from '@/types/home'

interface DbAsset {
  id: string
  home_id: string
  space_id: string | null
  asset_kind: AssetKind
  asset_type: AssetType
  name: string
  photo_url: string | null
  purchase_date: string | null
  purchase_price: number | null
  warranty_expires_at: string | null
  serial_number: string | null
  manual_url: string | null
  tags: string[]
  details: Record<string, unknown>
  notes_id: string | null
  domain: Domain
  needs_details: boolean
  created_by: string
  created_at: string
  updated_at: string
}

function dbToAsset(db: DbAsset): Asset {
  return {
    id: db.id,
    homeId: db.home_id,
    spaceId: db.space_id,
    assetKind: db.asset_kind,
    assetType: db.asset_type,
    name: db.name,
    photoUrl: db.photo_url ?? undefined,
    purchaseDate: db.purchase_date ?? undefined,
    purchasePrice: db.purchase_price ?? undefined,
    warrantyExpiresAt: db.warranty_expires_at ?? undefined,
    serialNumber: db.serial_number ?? undefined,
    manualUrl: db.manual_url ?? undefined,
    tags: db.tags ?? [],
    details: db.details ?? {},
    notesId: db.notes_id,
    domain: db.domain,
    needsDetails: db.needs_details,
    createdBy: db.created_by,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useAssets(homeId: string | undefined) {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !homeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssets([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('assets')
        .select('*')
        .eq('home_id', homeId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (e) { setError(e.message); setLoading(false); return }
      setAssets((data as DbAsset[]).map(dbToAsset))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user, homeId])

  const needsDetailsAssets = useMemo(
    () => assets.filter((a) => a.needsDetails),
    [assets],
  )

  const captureAsset = useCallback(async (input: {
    name: string
    spaceId: string | null
    photoUrl?: string
    assetKind?: AssetKind
  }): Promise<Asset | null> => {
    if (!user || !homeId) return null
    const { data, error: e } = await supabase
      .from('assets')
      .insert({
        home_id: homeId,
        space_id: input.spaceId,
        asset_kind: input.assetKind ?? 'item',
        asset_type: 'other',
        name: input.name,
        photo_url: input.photoUrl ?? null,
        needs_details: true,
        created_by: user.id,
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const a = dbToAsset(data as DbAsset)
    setAssets((prev) => [a, ...prev])
    return a
  }, [user, homeId])

  const updateAsset = useCallback(async (id: string, patch: Partial<Asset>): Promise<void> => {
    // Map camelCase patch keys to snake_case for the DB
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.spaceId !== undefined) dbPatch.space_id = patch.spaceId
    if (patch.assetKind !== undefined) dbPatch.asset_kind = patch.assetKind
    if (patch.assetType !== undefined) dbPatch.asset_type = patch.assetType
    if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl
    if (patch.purchaseDate !== undefined) dbPatch.purchase_date = patch.purchaseDate
    if (patch.purchasePrice !== undefined) dbPatch.purchase_price = patch.purchasePrice
    if (patch.warrantyExpiresAt !== undefined) dbPatch.warranty_expires_at = patch.warrantyExpiresAt
    if (patch.serialNumber !== undefined) dbPatch.serial_number = patch.serialNumber
    if (patch.manualUrl !== undefined) dbPatch.manual_url = patch.manualUrl
    if (patch.tags !== undefined) dbPatch.tags = patch.tags
    if (patch.details !== undefined) dbPatch.details = patch.details
    if (patch.notesId !== undefined) dbPatch.notes_id = patch.notesId
    if (patch.domain !== undefined) dbPatch.domain = patch.domain
    if (patch.needsDetails !== undefined) dbPatch.needs_details = patch.needsDetails

    const { error: e } = await supabase.from('assets').update(dbPatch).eq('id', id)
    if (e) { setError(e.message); return }
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, ...patch, updatedAt: new Date() } as Asset : a))
  }, [])

  const deleteAsset = useCallback(async (id: string): Promise<void> => {
    const { error: e } = await supabase.from('assets').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { assets, needsDetailsAssets, loading, error, captureAsset, updateAsset, deleteAsset }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest src/hooks/useAssets.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAssets.ts src/hooks/useAssets.test.ts
git commit -m "feat(home-app): add useAssets hook with photo-first capture"
```

---

## Task 6: `useReferenceFacts` hook (TDD)

**Files:**
- Create: `src/hooks/useReferenceFacts.ts`
- Create: `src/hooks/useReferenceFacts.test.ts`

This is a thin wrapper around `useSpaces.updateSpace({facts: ...})` that validates fact shape and provides an ergonomic add/edit/remove API.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useReferenceFacts.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReferenceFacts } from './useReferenceFacts'
import type { Fact } from '@/types/home'

const initial: Fact[] = [
  { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
]

describe('useReferenceFacts', () => {
  it('addFact appends a valid fact', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => {
      result.current.addFact({ type: 'paint', label: 'Wall', value: 'BM Cloud White' })
    })
    expect(updateSpace).toHaveBeenCalledWith('s1', {
      facts: [
        { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
        { type: 'paint', label: 'Wall', value: 'BM Cloud White' },
      ],
    })
  })

  it('addFact rejects empty label or value', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    expect(() => act(() => {
      result.current.addFact({ type: 'paint', label: '', value: 'x' })
    })).toThrow(/label/i)
    expect(updateSpace).not.toHaveBeenCalled()
  })

  it('removeFact removes by index', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => result.current.removeFact(0))
    expect(updateSpace).toHaveBeenCalledWith('s1', { facts: [] })
  })

  it('updateFact replaces by index', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => result.current.updateFact(0, { value: 'new value' }))
    expect(updateSpace).toHaveBeenCalledWith('s1', {
      facts: [{ type: 'wifi', label: 'Guest WiFi', value: 'new value' }],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/hooks/useReferenceFacts.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `useReferenceFacts`**

Create `src/hooks/useReferenceFacts.ts`:

```typescript
// src/hooks/useReferenceFacts.ts
import { useCallback } from 'react'
import type { Fact } from '@/types/home'

type UpdateSpace = (id: string, patch: { facts: Fact[] }) => Promise<void> | void

function validateFact(f: Fact): void {
  if (!f.label || f.label.trim().length === 0) throw new Error('Fact label is required')
  if (!f.value || f.value.trim().length === 0) throw new Error('Fact value is required')
  const valid: Fact['type'][] = ['wifi','paint','code','supply','measurement','freetext']
  if (!valid.includes(f.type)) throw new Error(`Unknown fact type: ${f.type}`)
}

export function useReferenceFacts(
  spaceId: string,
  facts: Fact[],
  updateSpace: UpdateSpace,
) {
  const addFact = useCallback((f: Fact) => {
    validateFact(f)
    void updateSpace(spaceId, { facts: [...facts, f] })
  }, [spaceId, facts, updateSpace])

  const updateFact = useCallback((idx: number, patch: Partial<Fact>) => {
    if (idx < 0 || idx >= facts.length) throw new Error('Index out of range')
    const next = facts.map((f, i) => i === idx ? { ...f, ...patch } : f)
    validateFact(next[idx])
    void updateSpace(spaceId, { facts: next })
  }, [spaceId, facts, updateSpace])

  const removeFact = useCallback((idx: number) => {
    if (idx < 0 || idx >= facts.length) return
    void updateSpace(spaceId, { facts: facts.filter((_, i) => i !== idx) })
  }, [spaceId, facts, updateSpace])

  return { addFact, updateFact, removeFact }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest src/hooks/useReferenceFacts.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useReferenceFacts.ts src/hooks/useReferenceFacts.test.ts
git commit -m "feat(home-app): add useReferenceFacts hook with shape validation"
```

---

## Task 7: App scaffold + sidebar wiring + routes

**Files:**
- Create: `src/apps/home/HomeApp.tsx`
- Create: `src/apps/home/index.ts`
- Modify: `src/components/layout/Sidebar.tsx` (add `home-app` view)
- Modify: `src/App.tsx` (route the new view; verify pattern from existing apps)

The existing sidebar uses `ViewType` for primary nav buttons (today, inbox, projects, etc.) and `appRegistry` for secondary route-based apps (wall). We add a new primary nav entry and a new route. **Important:** the existing `ViewType` includes `'home'` already (from the Today/Week/Month homeView component). To avoid collision, use `'home-app'` as the ViewType key for the new app while route is `/home`.

- [ ] **Step 1: Create the Home app entry**

Create `src/apps/home/HomeApp.tsx`:

```typescript
// src/apps/home/HomeApp.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { HomeOverview } from './HomeOverview'
import { SpaceView } from './SpaceView'
import { AssetView } from './AssetView'

export function HomeApp() {
  return (
    <Routes>
      <Route index element={<HomeOverview />} />
      <Route path="space/:id" element={<SpaceView />} />
      <Route path="asset/:id" element={<AssetView />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
```

Note: Tasks 9, 11, and 13 implement the three child components. For now, create lightweight placeholders so Task 7 builds.

- [ ] **Step 2: Create placeholder child components**

These are scaffolding only — Tasks 9/11/13 replace them.

Create `src/apps/home/HomeOverview.tsx` (placeholder):

```typescript
export function HomeOverview() { return <div>Home overview (placeholder)</div> }
```

Create `src/apps/home/SpaceView.tsx` (placeholder):

```typescript
export function SpaceView() { return <div>Space view (placeholder)</div> }
```

Create `src/apps/home/AssetView.tsx` (placeholder):

```typescript
export function AssetView() { return <div>Asset view (placeholder)</div> }
```

- [ ] **Step 3: Create the app index**

Create `src/apps/home/index.ts`:

```typescript
// src/apps/home/index.ts
export { HomeApp } from './HomeApp'
```

- [ ] **Step 4: Add `'home-app'` to the `ViewType` union and add the sidebar button**

Open `src/components/layout/Sidebar.tsx`. Find the `export type ViewType = ...` line and add `'home-app'`:

```typescript
export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | ...
```

Find the existing `Lists` button (around line 327, `onViewChange('lists')`) and add a Home button immediately *after* it (between Lists and Notes per the spec):

```tsx
{/* Home (Phase 1A — physical home registry) */}
<button
  onClick={() => onViewChange('home-app')}
  className={`
    w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
    ${activeView === 'home-app'
      ? 'text-primary-700 bg-primary-50/80 font-medium'
      : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
    }
    ${collapsed ? 'justify-center' : ''}
  `}
  aria-label="Home"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
  {!collapsed && <span className="text-[15px]">Home</span>}
</button>
```

- [ ] **Step 5: Wire the route in App.tsx**

Open `src/App.tsx`. Find the conditional rendering tree that uses `activeView` (or `stateView`) — search for the existing handling of `'lists'` or `'notes'` and add a parallel branch for `'home-app'` that renders `<HomeApp />`. Import it:

```typescript
import { HomeApp } from '@/apps/home'
```

Also ensure the route `/home/*` is mounted. If `App.tsx` uses React Router's `<Routes>`, add:

```tsx
<Route path="/home/*" element={<HomeApp />} />
```

If `App.tsx` uses a switch on `stateView` (likely, given `state-based + URL-based`), add:

```tsx
{activeView === 'home-app' && <HomeApp />}
```

The exact pattern depends on existing `App.tsx` structure. If unclear, follow how `meals` is wired (it has both ViewType + nested routes via `MealsTabs.tsx`).

- [ ] **Step 6: Smoke-check**

```bash
npm run dev
```

Open `http://localhost:5173/home`. Expected: sidebar shows "Home" button between Lists and Notes; `/home` shows "Home overview (placeholder)".

```bash
npm run build
```

Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/apps/home/ src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat(home-app): scaffold Home app with sidebar entry and routes"
```

---

## Task 8: Asset type config

**Files:**
- Create: `src/apps/home/assetTypes.ts`

- [ ] **Step 1: Create the config**

Create `src/apps/home/assetTypes.ts`:

```typescript
// src/apps/home/assetTypes.ts
// Per-type extra fields rendered in the asset detail view.
// Adding a new type later = one file change here.
import type { AssetType } from '@/types/home'

export type FieldType = 'text' | 'number' | 'date'

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  placeholder?: string
}

export const ASSET_TYPE_FIELDS: Record<AssetType, FieldConfig[]> = {
  appliance: [
    { key: 'energy_rating', label: 'Energy rating', type: 'text', placeholder: 'A++' },
    { key: 'last_filter_change', label: 'Last filter change', type: 'date' },
  ],
  vehicle: [
    { key: 'vin', label: 'VIN', type: 'text' },
    { key: 'license_plate', label: 'License plate', type: 'text' },
    { key: 'mileage', label: 'Mileage', type: 'number' },
  ],
  electronics: [
    { key: 'model_number', label: 'Model number', type: 'text' },
  ],
  furniture: [],
  fixture: [],
  tool: [],
  collection: [],
  other: [],
}
```

- [ ] **Step 2: Verify**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/apps/home/assetTypes.ts
git commit -m "feat(home-app): add per-asset-type field config"
```

---

## Task 9: `HomeOverview` component

**Files:**
- Modify: `src/apps/home/HomeOverview.tsx` (replace placeholder)
- Create: `src/apps/home/HomeOverview.test.tsx`

Renders the room grid + recent assets + needs-details banner. Expects exactly one home for the user (Phase 1A simplification).

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/HomeOverview.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomeOverview } from './HomeOverview'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', userId: 'u1', name: 'Main', createdAt: new Date(), updatedAt: new Date() }],
    loading: false, addHome: vi.fn(),
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false, addRoom: vi.fn(),
  }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', name: 'Dishwasher', assetKind: 'item',
        assetType: 'appliance', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    needsDetailsAssets: [
      { id: 'a2', homeId: 'h1', spaceId: 'r1', name: 'Bike', assetKind: 'item',
        assetType: 'other', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: true, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, captureAsset: vi.fn(),
  }),
}))

describe('HomeOverview', () => {
  it('shows the room grid', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText(/1 item/)).toBeInTheDocument()
  })

  it('shows the needs-details banner when count > 0', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText(/1 asset(s)? need details/i)).toBeInTheDocument()
  })

  it('lists recent assets', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/HomeOverview.test.tsx
```

Expected: FAIL (placeholder doesn't render the expected content).

- [ ] **Step 3: Implement `HomeOverview`**

Replace `src/apps/home/HomeOverview.tsx` with:

```typescript
// src/apps/home/HomeOverview.tsx
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import type { Asset, Space } from '@/types/home'

export function HomeOverview() {
  const navigate = useNavigate()
  const { homes, loading: homesLoading } = useHomes()
  const home = homes[0]  // Phase 1A: one home

  const { rooms, loading: spacesLoading, addRoom } = useSpaces(home?.id)
  const { assets, needsDetailsAssets, loading: assetsLoading } = useAssets(home?.id)
  const [search, setSearch] = useState('')

  const assetsByRoom = useMemo(() => {
    const map = new Map<string, Asset[]>()
    for (const a of assets) {
      if (!a.spaceId) continue
      const list = map.get(a.spaceId) ?? []
      list.push(a)
      map.set(a.spaceId, list)
    }
    return map
  }, [assets])

  const filteredAssets = useMemo(() => {
    if (!search.trim()) return assets.slice(0, 10)
    const q = search.toLowerCase()
    return assets.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [assets, search])

  if (homesLoading || spacesLoading || assetsLoading) {
    return <div className="p-6 text-neutral-500">Loading…</div>
  }

  if (!home) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl mb-4">Home</h1>
        <div className="card p-6">
          <p className="mb-4">You don't have a home set up yet.</p>
          <button
            className="btn-primary"
            onClick={async () => {
              const name = prompt('What should we call your home?', 'Main House')
              if (name) {
                // Note: useHomes.addHome is implemented; calling here.
                // (intentionally minimal Phase 1A onboarding)
                const { addHome } = (await import('@/hooks/useHomes')).useHomes() as any
                await addHome({ name })
              }
            }}
          >
            Create my home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl">Home</h1>
        <div className="flex gap-2">
          <button
            className="btn-primary"
            onClick={() => navigate('/home/asset/new')}
          >+ Asset</button>
          <button
            className="px-4 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50"
            onClick={async () => {
              const name = prompt('Room name')
              if (name) await addRoom({ name })
            }}
          >+ Room</button>
        </div>
      </header>

      {needsDetailsAssets.length > 0 && (
        <div className="card p-4 mb-6 flex items-center justify-between bg-amber-50 border-amber-200">
          <span>⚠ {needsDetailsAssets.length} asset{needsDetailsAssets.length === 1 ? '' : 's'} need details</span>
          <Link to="/inbox?section=home" className="text-primary-700 underline">Triage now →</Link>
        </div>
      )}

      <input
        className="input-base w-full mb-6"
        placeholder="Search assets…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <h2 className="font-display text-xl mb-3">Rooms</h2>
      {rooms.length === 0 ? (
        <p className="text-neutral-500 mb-6">No rooms yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          {rooms.map((r) => (
            <RoomTile key={r.id} room={r} count={(assetsByRoom.get(r.id) ?? []).length} />
          ))}
        </div>
      )}

      <h2 className="font-display text-xl mb-3">Recent</h2>
      <ul className="space-y-2">
        {filteredAssets.map((a) => (
          <li key={a.id}>
            <Link
              to={`/home/asset/${a.id}`}
              className="block card p-3 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className="text-sm text-neutral-500">
                  {rooms.find((r) => r.id === a.spaceId)?.name ?? '—'}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RoomTile({ room, count }: { room: Space; count: number }) {
  return (
    <Link to={`/home/space/${room.id}`} className="block card p-0 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-[4/3] bg-neutral-200 flex items-center justify-center">
        {room.photoUrl ? (
          <img src={room.photoUrl} alt={room.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🏠</span>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium">{room.name}</div>
        <div className="text-sm text-neutral-500">{count} item{count === 1 ? '' : 's'}</div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest src/apps/home/HomeOverview.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/apps/home/HomeOverview.tsx src/apps/home/HomeOverview.test.tsx
git commit -m "feat(home-app): build HomeOverview room grid with triage banner"
```

---

## Task 10: `ReferenceFactsCard` + `FactRow`

**Files:**
- Create: `src/apps/home/facts/ReferenceFactsCard.tsx`
- Create: `src/apps/home/facts/FactRow.tsx`
- Create: `src/apps/home/facts/ReferenceFactsCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/facts/ReferenceFactsCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReferenceFactsCard } from './ReferenceFactsCard'
import type { Fact } from '@/types/home'

const facts: Fact[] = [
  { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
  { type: 'paint', label: 'Wall', value: 'BM Cloud White' },
]

describe('ReferenceFactsCard', () => {
  it('renders all facts', () => {
    render(<ReferenceFactsCard spaceId="s1" facts={facts} updateSpace={vi.fn()} />)
    expect(screen.getByText('Guest WiFi')).toBeInTheDocument()
    expect(screen.getByText('BM Cloud White')).toBeInTheDocument()
  })

  it('add button opens the new-fact form', () => {
    render(<ReferenceFactsCard spaceId="s1" facts={[]} updateSpace={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add fact/i }))
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('saving a new fact calls updateSpace', () => {
    const updateSpace = vi.fn().mockResolvedValue(undefined)
    render(<ReferenceFactsCard spaceId="s1" facts={[]} updateSpace={updateSpace} />)
    fireEvent.click(screen.getByRole('button', { name: /add fact/i }))
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'WiFi' } })
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updateSpace).toHaveBeenCalledWith('s1', expect.objectContaining({
      facts: [{ type: 'wifi', label: 'WiFi', value: 'pw' }],
    }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/facts/ReferenceFactsCard.test.tsx
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `FactRow`**

Create `src/apps/home/facts/FactRow.tsx`:

```typescript
import { useState } from 'react'
import type { Fact } from '@/types/home'
import { factTypeLabel } from '@/types/home'

const ICON: Record<Fact['type'], string> = {
  wifi: '📶', paint: '🎨', code: '🔢', supply: '📦', measurement: '📏', freetext: '📝',
}

interface Props {
  fact: Fact
  onChange: (patch: Partial<Fact>) => void
  onRemove: () => void
}

export function FactRow({ fact, onChange, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact)

  if (!editing) {
    return (
      <div className="flex items-center gap-2 py-2 group">
        <span aria-hidden>{ICON[fact.type]}</span>
        <div className="flex-1">
          <div className="text-sm text-neutral-500">{fact.label}</div>
          <div className="text-base">{fact.value}</div>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${fact.label}`}
        >✎</button>
        <button
          className="opacity-0 group-hover:opacity-100 text-sm text-neutral-400 hover:text-red-600"
          onClick={onRemove}
          aria-label={`Remove ${fact.label}`}
        >✕</button>
      </div>
    )
  }

  return (
    <div className="py-2 space-y-2">
      <select
        className="input-base"
        value={draft.type}
        onChange={(e) => setDraft({ ...draft, type: e.target.value as Fact['type'] })}
        aria-label="Type"
      >
        {(['wifi','paint','code','supply','measurement','freetext'] as const).map((t) => (
          <option key={t} value={t}>{factTypeLabel(t)}</option>
        ))}
      </select>
      <input
        className="input-base"
        placeholder="Label"
        aria-label="Label"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />
      <input
        className="input-base"
        placeholder="Value"
        aria-label="Value"
        value={draft.value}
        onChange={(e) => setDraft({ ...draft, value: e.target.value })}
      />
      <div className="flex gap-2">
        <button
          className="btn-primary"
          onClick={() => { onChange(draft); setEditing(false) }}
        >Save</button>
        <button
          className="px-3 py-1 text-sm text-neutral-500"
          onClick={() => setEditing(false)}
        >Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `ReferenceFactsCard`**

Create `src/apps/home/facts/ReferenceFactsCard.tsx`:

```typescript
import { useState } from 'react'
import { useReferenceFacts } from '@/hooks/useReferenceFacts'
import { FactRow } from './FactRow'
import type { Fact } from '@/types/home'

interface Props {
  spaceId: string
  facts: Fact[]
  updateSpace: (id: string, patch: { facts: Fact[] }) => Promise<void> | void
}

export function ReferenceFactsCard({ spaceId, facts, updateSpace }: Props) {
  const { addFact, updateFact, removeFact } = useReferenceFacts(spaceId, facts, updateSpace)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Fact>({ type: 'freetext', label: '', value: '' })

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Facts</h3>
        <button
          className="text-sm text-primary-700"
          onClick={() => setAdding(true)}
          aria-label="Add fact"
        >+ Add</button>
      </div>

      <div className="divide-y divide-neutral-200">
        {facts.map((f, i) => (
          <FactRow
            key={i}
            fact={f}
            onChange={(patch) => updateFact(i, patch)}
            onRemove={() => removeFact(i)}
          />
        ))}
      </div>

      {adding && (
        <div className="mt-3 pt-3 border-t border-neutral-200 space-y-2">
          <select
            className="input-base"
            aria-label="Type"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as Fact['type'] })}
          >
            <option value="wifi">WiFi</option>
            <option value="paint">Paint</option>
            <option value="code">Code / Combo</option>
            <option value="supply">Supply / Spec</option>
            <option value="measurement">Measurement</option>
            <option value="freetext">Note</option>
          </select>
          <input
            className="input-base"
            placeholder="Label"
            aria-label="Label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            className="input-base"
            placeholder="Value"
            aria-label="Value"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                try {
                  addFact(draft)
                  setDraft({ type: 'freetext', label: '', value: '' })
                  setAdding(false)
                } catch (err) {
                  alert((err as Error).message)
                }
              }}
            >Save</button>
            <button
              className="px-3 py-1 text-sm text-neutral-500"
              onClick={() => setAdding(false)}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest src/apps/home/facts/ReferenceFactsCard.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/apps/home/facts/
git commit -m "feat(home-app): reference facts card with inline edit"
```

---

## Task 11: `SpaceView` component

**Files:**
- Modify: `src/apps/home/SpaceView.tsx` (replace placeholder)
- Create: `src/apps/home/SpaceView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/SpaceView.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { SpaceView } from './SpaceView'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', userId: 'u1', name: 'Main', createdAt: new Date(), updatedAt: new Date() }],
    loading: false,
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        photoUrl: undefined, sortOrder: 0,
        facts: [{ type: 'paint', label: 'Wall', value: 'BM Cloud White' }],
        createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'z1', homeId: 'h1', parentSpaceId: 'r1', spaceType: 'zone', name: 'Pantry',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [],
    zones: [],
    loading: false,
    updateSpace: vi.fn(),
    addZone: vi.fn(),
  }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', name: 'Dishwasher', assetKind: 'item',
        assetType: 'appliance', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, captureAsset: vi.fn(),
  }),
}))

describe('SpaceView', () => {
  it('renders the room with facts and zones and assets', () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1']}>
        <Routes>
          <Route path="/home/space/:id" element={<SpaceView />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('BM Cloud White')).toBeInTheDocument()
    expect(screen.getByText('Pantry')).toBeInTheDocument()
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/SpaceView.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `SpaceView`**

Replace `src/apps/home/SpaceView.tsx`:

```typescript
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { ReferenceFactsCard } from './facts/ReferenceFactsCard'

export function SpaceView() {
  const { id } = useParams<{ id: string }>()
  const { homes } = useHomes()
  const home = homes[0]

  const { spaces, updateSpace, addZone } = useSpaces(home?.id)
  const { assets, captureAsset } = useAssets(home?.id)

  const space = useMemo(() => spaces.find((s) => s.id === id), [spaces, id])
  const childZones = useMemo(
    () => spaces.filter((s) => s.parentSpaceId === id),
    [spaces, id],
  )
  const here = useMemo(() => assets.filter((a) => a.spaceId === id), [assets, id])

  if (!space) return <div className="p-6 text-neutral-500">Loading…</div>

  const isZone = space.spaceType === 'zone'
  const parent = isZone ? spaces.find((s) => s.id === space.parentSpaceId) : null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link to={isZone ? `/home/space/${parent?.id}` : '/home'} className="text-sm text-primary-700">
          ← {isZone ? parent?.name : 'Home'}
        </Link>
        <h1 className="font-display text-2xl">{space.name}</h1>
        <button
          className="text-sm text-neutral-500"
          onClick={async () => {
            const name = prompt('Rename', space.name)
            if (name) await updateSpace(space.id, { name })
          }}
        >Edit</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 card p-0 overflow-hidden">
          <div className="aspect-[16/9] bg-neutral-200 flex items-center justify-center">
            {space.photoUrl ? (
              <img src={space.photoUrl} alt={space.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🏠</span>
            )}
          </div>
        </div>
        <ReferenceFactsCard
          spaceId={space.id}
          facts={space.facts}
          updateSpace={(id, patch) => updateSpace(id, patch)}
        />
      </div>

      {!isZone && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-lg">Zones</h2>
            <button
              className="text-sm text-primary-700"
              onClick={async () => {
                const name = prompt('Zone name')
                if (name && id) await addZone({ parentSpaceId: id, name })
              }}
            >+ Zone</button>
          </div>
          {childZones.length === 0 ? (
            <p className="text-sm text-neutral-500 mb-6">No zones yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {childZones.map((z) => (
                <Link key={z.id} to={`/home/space/${z.id}`} className="card p-3 hover:bg-neutral-50">
                  <div className="font-medium">{z.name}</div>
                  <div className="text-sm text-neutral-500">
                    {assets.filter((a) => a.spaceId === z.id).length} items
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">Assets</h2>
        <button
          className="text-sm text-primary-700"
          onClick={async () => {
            const name = prompt('Asset name')
            if (name) await captureAsset({ name, spaceId: id ?? null })
          }}
        >+ Asset here</button>
      </div>
      {here.length === 0 ? (
        <p className="text-sm text-neutral-500">No assets here yet.</p>
      ) : (
        <ul className="space-y-2">
          {here.map((a) => (
            <li key={a.id}>
              <Link to={`/home/asset/${a.id}`} className="block card p-3 hover:bg-neutral-50">
                <div className="flex items-center justify-between">
                  <span>{a.name}</span>
                  <span className="text-xs text-neutral-500">{a.assetType}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest src/apps/home/SpaceView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/apps/home/SpaceView.tsx src/apps/home/SpaceView.test.tsx
git commit -m "feat(home-app): SpaceView with facts/zones/assets"
```

---

## Task 12: `AssetDetailPanel`

**Files:**
- Create: `src/apps/home/AssetDetailPanel.tsx`
- Create: `src/apps/home/AssetDetailPanel.test.tsx`

The bottom-sheet/slide-over for viewing an asset. Reused on mobile + when opened from a list context on desktop. Full-page edit lives in `AssetView` (Task 13).

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/AssetDetailPanel.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AssetDetailPanel } from './AssetDetailPanel'
import type { Asset } from '@/types/home'

const ASSET: Asset = {
  id: 'a1', homeId: 'h1', spaceId: 'r1', assetKind: 'item', assetType: 'appliance',
  name: 'Dishwasher', tags: [], details: {}, notesId: null, domain: 'family',
  needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
}

describe('AssetDetailPanel', () => {
  it('renders the asset name and type', () => {
    render(<AssetDetailPanel asset={ASSET} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
    expect(screen.getByText(/appliance/i)).toBeInTheDocument()
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    render(<AssetDetailPanel asset={ASSET} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('inline-editing the name fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AssetDetailPanel asset={ASSET} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Dishwasher'))
    const input = screen.getByDisplayValue('Dishwasher')
    fireEvent.change(input, { target: { value: 'Bosch DW' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Bosch DW' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/AssetDetailPanel.test.tsx
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `AssetDetailPanel`**

Create `src/apps/home/AssetDetailPanel.tsx`:

```typescript
import { useState } from 'react'
import type { Asset } from '@/types/home'
import { assetTypeLabel } from '@/types/home'
import { ASSET_TYPE_FIELDS } from './assetTypes'

interface Props {
  asset: Asset
  onClose: () => void
  onUpdate: (patch: Partial<Asset>) => void | Promise<void>
  onDelete: () => void | Promise<void>
}

export function AssetDetailPanel({ asset, onClose, onUpdate, onDelete }: Props) {
  return (
    <div className="card p-4 max-w-xl w-full">
      <div className="flex items-center justify-between mb-3">
        <InlineText
          value={asset.name}
          onCommit={(v) => onUpdate({ name: v })}
          className="font-display text-2xl"
        />
        <button onClick={onClose} aria-label="Close" className="text-neutral-500 text-xl">✕</button>
      </div>

      {asset.photoUrl && (
        <img src={asset.photoUrl} alt={asset.name} className="w-full rounded-md mb-3" />
      )}

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">Type</dt>
        <dd>{assetTypeLabel(asset.assetType)}</dd>

        <dt className="text-neutral-500">Kind</dt>
        <dd>{asset.assetKind}</dd>

        <dt className="text-neutral-500">Purchased</dt>
        <dd>
          <InlineText
            value={asset.purchaseDate ?? ''}
            onCommit={(v) => onUpdate({ purchaseDate: v || undefined })}
            placeholder="YYYY-MM-DD"
          />
        </dd>

        <dt className="text-neutral-500">Warranty</dt>
        <dd>
          <InlineText
            value={asset.warrantyExpiresAt ?? ''}
            onCommit={(v) => onUpdate({ warrantyExpiresAt: v || undefined })}
            placeholder="YYYY-MM-DD"
          />
        </dd>

        <dt className="text-neutral-500">Serial</dt>
        <dd>
          <InlineText
            value={asset.serialNumber ?? ''}
            onCommit={(v) => onUpdate({ serialNumber: v || undefined })}
          />
        </dd>

        <dt className="text-neutral-500">Manual</dt>
        <dd>
          <InlineText
            value={asset.manualUrl ?? ''}
            onCommit={(v) => onUpdate({ manualUrl: v || undefined })}
            placeholder="URL"
          />
        </dd>

        {ASSET_TYPE_FIELDS[asset.assetType]?.map((f) => (
          <FieldPair key={f.key} label={f.label}>
            <InlineText
              value={String(asset.details[f.key] ?? '')}
              onCommit={(v) => onUpdate({ details: { ...asset.details, [f.key]: v } })}
            />
          </FieldPair>
        ))}
      </dl>

      <div className="mt-4 flex justify-end">
        <button
          className="text-sm text-red-600 hover:underline"
          onClick={onDelete}
        >Delete asset</button>
      </div>
    </div>
  )
}

function FieldPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function InlineText({
  value, onCommit, placeholder, className,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        className={`input-base ${className ?? ''}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`cursor-text ${className ?? ''} ${value ? '' : 'text-neutral-400'}`}
    >
      {value || placeholder || '—'}
    </span>
  )
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest src/apps/home/AssetDetailPanel.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/apps/home/AssetDetailPanel.tsx src/apps/home/AssetDetailPanel.test.tsx
git commit -m "feat(home-app): AssetDetailPanel with inline edit"
```

---

## Task 13: `AssetView` (full-page)

**Files:**
- Modify: `src/apps/home/AssetView.tsx` (replace placeholder)
- Create: `src/apps/home/AssetView.test.tsx`

Full-page wrapper around `AssetDetailPanel` for the desktop `/home/asset/:id` route. Loads the asset by id, supplies the update/delete callbacks, and adds breadcrumb navigation back to the room.

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/AssetView.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AssetView } from './AssetView'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', assetKind: 'item', assetType: 'appliance',
        name: 'Dishwasher', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, updateAsset: vi.fn(), deleteAsset: vi.fn(),
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [{ id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
      sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() }],
    loading: false,
  }),
}))

describe('AssetView', () => {
  it('renders the asset and a breadcrumb to the room', () => {
    render(
      <MemoryRouter initialEntries={['/home/asset/a1']}>
        <Routes>
          <Route path="/home/asset/:id" element={<AssetView />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
    expect(screen.getByText(/← Kitchen/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/AssetView.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `AssetView`**

Replace `src/apps/home/AssetView.tsx`:

```typescript
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useAssets } from '@/hooks/useAssets'
import { useSpaces } from '@/hooks/useSpaces'
import { AssetDetailPanel } from './AssetDetailPanel'

export function AssetView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { homes } = useHomes()
  const home = homes[0]
  const { assets, updateAsset, deleteAsset } = useAssets(home?.id)
  const { spaces } = useSpaces(home?.id)

  const asset = useMemo(() => assets.find((a) => a.id === id), [assets, id])
  const space = useMemo(() => spaces.find((s) => s.id === asset?.spaceId), [spaces, asset])

  if (!asset) return <div className="p-6 text-neutral-500">Loading…</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link to={space ? `/home/space/${space.id}` : '/home'} className="text-sm text-primary-700">
          ← {space?.name ?? 'Home'}
        </Link>
      </div>

      <AssetDetailPanel
        asset={asset}
        onClose={() => navigate(space ? `/home/space/${space.id}` : '/home')}
        onUpdate={(patch) => updateAsset(asset.id, patch)}
        onDelete={async () => {
          if (confirm(`Delete ${asset.name}?`)) {
            await deleteAsset(asset.id)
            navigate(space ? `/home/space/${space.id}` : '/home')
          }
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest src/apps/home/AssetView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/apps/home/AssetView.tsx src/apps/home/AssetView.test.tsx
git commit -m "feat(home-app): AssetView full-page wrapper around the detail panel"
```

---

## Task 14: `AssetCapture` (photo-first, single-asset)

**Files:**
- Create: `src/apps/home/capture/AssetCapture.tsx`
- Create: `src/apps/home/capture/AssetCapture.test.tsx`

Camera opens immediately. Photo + name + space → save (with `needs_details=true`). "Save & add another" reopens camera with the same room/zone pre-selected.

Capture screen is reachable via the FAB (added in Task 7's HomeOverview). The `/home/asset/new` route (used by the FAB) renders this component.

- [ ] **Step 1: Add `/home/asset/new` route to `HomeApp.tsx`**

Modify `src/apps/home/HomeApp.tsx` — add a `Route` for `asset/new` *before* the `asset/:id` route:

```tsx
<Route path="asset/new" element={<AssetCapture />} />
<Route path="asset/:id" element={<AssetView />} />
```

Add the import: `import { AssetCapture } from './capture/AssetCapture'`.

- [ ] **Step 2: Write the failing test**

Create `src/apps/home/capture/AssetCapture.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssetCapture } from './AssetCapture'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false,
  }),
}))
const captureAsset = vi.fn().mockResolvedValue({ id: 'a-new' })
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ assets: [], needsDetailsAssets: [], loading: false, captureAsset }),
}))

describe('AssetCapture', () => {
  it('renders camera prompt and name field', () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    expect(screen.getByText(/take a photo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('saving with name + room calls captureAsset with needs_details handled by hook', async () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Bike' } })
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'r1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })
    expect(captureAsset).toHaveBeenCalledWith({ name: 'Bike', spaceId: 'r1', photoUrl: undefined, assetKind: 'item' })
  })

  it('toggle "this is a collection" flips assetKind', async () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Lego' } })
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'r1' } })
    fireEvent.click(screen.getByLabelText(/collection/i))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })
    expect(captureAsset).toHaveBeenLastCalledWith(expect.objectContaining({ assetKind: 'collection' }))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest src/apps/home/capture/AssetCapture.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement `AssetCapture`**

Create `src/apps/home/capture/AssetCapture.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { supabase } from '@/lib/supabase'

export function AssetCapture() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialRoom = params.get('room') ?? ''
  const initialZone = params.get('zone') ?? ''

  const { homes } = useHomes()
  const home = homes[0]
  const { rooms, spaces } = useSpaces(home?.id)
  const { captureAsset } = useAssets(home?.id)

  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState(initialRoom)
  const [zoneId, setZoneId] = useState(initialZone)
  const [isCollection, setIsCollection] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  // Trigger camera on mount (mobile)
  useEffect(() => { fileInput.current?.click() }, [])

  const zonesForRoom = spaces.filter((s) => s.parentSpaceId === roomId)

  async function uploadPhoto(file: File): Promise<string | undefined> {
    if (!home) return undefined
    const path = `${home.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (error) return undefined
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    return data?.publicUrl
  }

  async function save(addAnother: boolean) {
    if (!name.trim() || !roomId) return
    setSaving(true)
    let url = photoUrl
    if (!url && photoFile) url = await uploadPhoto(photoFile)
    const spaceId = zoneId || roomId
    await captureAsset({
      name: name.trim(),
      spaceId,
      photoUrl: url,
      assetKind: isCollection ? 'collection' : 'item',
    })
    setSaving(false)
    if (addAnother) {
      setName(''); setIsCollection(false); setPhotoFile(null); setPhotoUrl(undefined)
      // Re-trigger camera with same room/zone retained
      fileInput.current?.click()
    } else {
      navigate(`/home/space/${spaceId}`)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="font-display text-2xl mb-4">Add asset</h1>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setPhotoFile(f)
            setPhotoUrl(URL.createObjectURL(f))
          }
        }}
      />

      <div
        className="card p-4 mb-3 text-center cursor-pointer"
        onClick={() => fileInput.current?.click()}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="captured" className="rounded-md max-h-64 mx-auto" />
        ) : (
          <p className="text-neutral-500">Take a photo</p>
        )}
      </div>

      <label className="block mb-2">
        <span className="text-sm text-neutral-600">Name</span>
        <input
          className="input-base w-full"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="block mb-2">
        <span className="text-sm text-neutral-600">Where</span>
        <select className="input-base w-full" value={roomId} onChange={(e) => { setRoomId(e.target.value); setZoneId('') }}>
          <option value="">Pick a room…</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>

      {roomId && zonesForRoom.length > 0 && (
        <label className="block mb-2">
          <span className="text-sm text-neutral-600">Zone (optional)</span>
          <select className="input-base w-full" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">— none —</option>
            {zonesForRoom.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2 mb-4 text-sm">
        <input type="checkbox" checked={isCollection} onChange={(e) => setIsCollection(e.target.checked)} aria-label="This is a collection" />
        This is a collection
      </label>

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={saving || !name.trim() || !roomId}
          onClick={() => save(false)}
        >{saving ? 'Saving…' : 'Save'}</button>
        <button
          className="px-4 py-2 rounded-md border border-neutral-300"
          disabled={saving || !name.trim() || !roomId}
          onClick={() => save(true)}
        >Save & add another</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify the asset-photos storage bucket exists**

```bash
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/storage/buckets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"asset-photos","name":"asset-photos","public":true}'
```

Expected: 200 (bucket created) or 409 (already exists). Both OK.

- [ ] **Step 6: Run test**

```bash
npx vitest src/apps/home/capture/AssetCapture.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/apps/home/capture/AssetCapture.tsx src/apps/home/capture/AssetCapture.test.tsx src/apps/home/HomeApp.tsx
git commit -m "feat(home-app): photo-first asset capture (single-asset mode)"
```

---

## Task 15: `RoomSessionMode`

**Files:**
- Create: `src/apps/home/capture/RoomSessionMode.tsx`
- Create: `src/apps/home/capture/RoomSessionMode.test.tsx`
- Modify: `src/apps/home/SpaceView.tsx` (add "Start room session" button on rooms only)

Sticky-room rapid capture. Reuses `useAssets.captureAsset`. Pinned header shows room + count. Camera reopens after each save.

- [ ] **Step 1: Add the route**

Modify `src/apps/home/HomeApp.tsx` — add inside `<Routes>`:

```tsx
<Route path="space/:id/session" element={<RoomSessionMode />} />
```

Import: `import { RoomSessionMode } from './capture/RoomSessionMode'`.

- [ ] **Step 2: Write the failing test**

Create `src/apps/home/capture/RoomSessionMode.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RoomSessionMode } from './RoomSessionMode'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
const captureAsset = vi.fn().mockResolvedValue({ id: 'a-new' })
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ captureAsset, assets: [], needsDetailsAssets: [], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [{ id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
      sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() }],
    rooms: [], zones: [], loading: false,
  }),
}))

beforeEach(() => captureAsset.mockClear())

describe('RoomSessionMode', () => {
  it('renders the pinned room header and counter', () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1/session']}>
        <Routes>
          <Route path="/home/space/:id/session" element={<RoomSessionMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Kitchen/)).toBeInTheDocument()
    expect(screen.getByText(/0 added/i)).toBeInTheDocument()
  })

  it('saving an asset increments the counter', async () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1/session']}>
        <Routes>
          <Route path="/home/space/:id/session" element={<RoomSessionMode />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Bike' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /save/i })))
    expect(captureAsset).toHaveBeenCalledWith({ name: 'Bike', spaceId: 'r1', photoUrl: undefined, assetKind: 'item' })
    expect(screen.getByText(/1 added/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest src/apps/home/capture/RoomSessionMode.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement `RoomSessionMode`**

Create `src/apps/home/capture/RoomSessionMode.tsx`:

```typescript
import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { supabase } from '@/lib/supabase'

export function RoomSessionMode() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { homes } = useHomes()
  const home = homes[0]
  const { spaces } = useSpaces(home?.id)
  const { captureAsset } = useAssets(home?.id)
  const room = spaces.find((s) => s.id === id)

  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function uploadPhoto(file: File): Promise<string | undefined> {
    if (!home) return undefined
    const path = `${home.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file)
    if (error) return undefined
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    return data?.publicUrl
  }

  async function save() {
    if (!name.trim() || !id) return
    setSaving(true)
    let url = photoUrl
    if (!url && photoFile) url = await uploadPhoto(photoFile)
    await captureAsset({ name: name.trim(), spaceId: id, photoUrl: url, assetKind: 'item' })
    setSaving(false)
    setCount((c) => c + 1)
    setName(''); setPhotoFile(null); setPhotoUrl(undefined)
    fileInput.current?.click()
  }

  if (!room) return <div className="p-6">Loading…</div>

  return (
    <div className="p-4 max-w-md mx-auto">
      <header className="card p-3 mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Session</div>
          <div className="font-display text-lg">{room.name}</div>
          <div className="text-sm text-neutral-500">{count} added</div>
        </div>
        <button
          className="text-sm text-primary-700"
          onClick={() => navigate(`/home/space/${id}`)}
        >End session</button>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) { setPhotoFile(f); setPhotoUrl(URL.createObjectURL(f)) }
        }}
      />

      <div
        className="card p-4 mb-3 text-center cursor-pointer"
        onClick={() => fileInput.current?.click()}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="captured" className="rounded-md max-h-64 mx-auto" />
        ) : (
          <p className="text-neutral-500">Tap to take photo</p>
        )}
      </div>

      <label className="block mb-3">
        <span className="text-sm text-neutral-600">Name</span>
        <input
          className="input-base w-full"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
        />
      </label>

      <button
        className="btn-primary w-full"
        disabled={saving || !name.trim()}
        onClick={save}
      >{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
```

- [ ] **Step 5: Add "Start room session" button on `SpaceView` (rooms only)**

In `src/apps/home/SpaceView.tsx`, find the "Assets" header section and add — directly before the existing `+ Asset here` button — a button shown only when `!isZone`:

```tsx
{!isZone && (
  <Link
    to={`/home/space/${id}/session`}
    className="text-sm text-neutral-600 hover:text-primary-700 mr-2"
  >Start room session →</Link>
)}
```

- [ ] **Step 6: Run test**

```bash
npx vitest src/apps/home/capture/RoomSessionMode.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/apps/home/capture/RoomSessionMode.tsx src/apps/home/capture/RoomSessionMode.test.tsx src/apps/home/SpaceView.tsx src/apps/home/HomeApp.tsx
git commit -m "feat(home-app): RoomSessionMode for sticky-room rapid capture"
```

---

## Task 16: Inbox "Home items needing details" section

**Files:**
- Modify: existing inbox component(s) — locate via `grep -rln "Inbox" src/components/`

Add a section that lists assets where `needs_details = true`, with a button per row to open the asset detail panel.

- [ ] **Step 1: Find the inbox view**

```bash
grep -rln "InboxSection\|InboxView\|'/inbox'" src/components/ src/apps/ 2>/dev/null
```

Read the resulting files. The expected pattern (from `src/apps/tasks/InboxViewContainer.tsx`) is a container that renders multiple sections. We add a new section component here.

- [ ] **Step 2: Create the new section component**

Create `src/apps/home/inbox/HomeNeedsDetailsSection.tsx`:

```typescript
import { Link } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useAssets } from '@/hooks/useAssets'
import { useSpaces } from '@/hooks/useSpaces'

export function HomeNeedsDetailsSection() {
  const { homes } = useHomes()
  const home = homes[0]
  const { needsDetailsAssets, loading } = useAssets(home?.id)
  const { spaces } = useSpaces(home?.id)

  if (loading || !home) return null
  if (needsDetailsAssets.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="font-display text-lg mb-2">Home items needing details</h2>
      <ul className="space-y-2">
        {needsDetailsAssets.map((a) => {
          const room = spaces.find((s) => s.id === a.spaceId)
          return (
            <li key={a.id} className="card p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {a.photoUrl ? (
                  <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-neutral-200" />
                )}
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-neutral-500">{room?.name ?? '—'}</div>
                </div>
              </div>
              <Link to={`/home/asset/${a.id}`} className="text-sm text-primary-700">Fill in →</Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: Wire the section into the inbox view**

In whatever file renders the inbox sections (e.g., `src/apps/tasks/InboxViewContainer.tsx` based on the grep), import and render the new section near the top of the existing section list:

```tsx
import { HomeNeedsDetailsSection } from '@/apps/home/inbox/HomeNeedsDetailsSection'
// ...inside the JSX, after the page header and before the first existing section:
<HomeNeedsDetailsSection />
```

If the inbox uses a `?section=home` query param (as the HomeOverview banner links to `/inbox?section=home`), add a small helper that scrolls to or highlights this section when the param is present:

```tsx
import { useSearchParams } from 'react-router-dom'
import { useEffect, useRef } from 'react'

const sectionRef = useRef<HTMLDivElement>(null)
const [params] = useSearchParams()
useEffect(() => {
  if (params.get('section') === 'home') sectionRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [params])
```

Wrap `<HomeNeedsDetailsSection />` in `<div ref={sectionRef}>`.

- [ ] **Step 4: Verify build + smoke**

```bash
npm run build
npm run dev
```

Capture an asset photo-first via `/home/asset/new`. Open `/inbox`. Expected: the new asset appears in the "Home items needing details" section.

- [ ] **Step 5: Commit**

```bash
git add src/apps/home/inbox/ src/apps/tasks/InboxViewContainer.tsx
git commit -m "feat(home-app): inbox section for home items needing details"
```

---

## Task 17: WallCalendar tab toggle (Calendar | Rooms)

**Files:**
- Modify: `src/components/wall/WallCalendar.tsx`

The wall app currently shows a single calendar view. Phase 1A adds a top tab toggle so the user can switch to a Rooms view (implemented in Task 18).

- [ ] **Step 1: Read the current `WallCalendar`**

```bash
wc -l src/components/wall/WallCalendar.tsx
```

If > 400 lines, read the file to understand the layout. Identify:
- Where the top header/toolbar lives
- Where the realtime subscription is set up (we must not break it)
- Where the idle timer lives (auto-return logic)

- [ ] **Step 2: Add tab state at the top of the component**

Inside the `WallCalendar` component function, near the top:

```typescript
import { useState } from 'react'
import { RoomsKioskView } from '@/apps/home/kiosk/RoomsKioskView'
// ...
const [tab, setTab] = useState<'calendar' | 'rooms'>('calendar')
```

(The `RoomsKioskView` component is built in Task 18; for Task 17 we can stub-import it temporarily — see Step 3.)

- [ ] **Step 3: Stub `RoomsKioskView` if Task 18 hasn't started**

Create `src/apps/home/kiosk/RoomsKioskView.tsx` (placeholder, replaced fully in Task 18):

```typescript
export function RoomsKioskView() {
  return <div className="p-8 text-center text-neutral-500">Rooms (placeholder)</div>
}
```

- [ ] **Step 4: Render the tab strip and switch content**

In `WallCalendar.tsx`, find the top of the rendered content (just inside the outermost `<div>`) and insert:

```tsx
<div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200">
  <button
    className={`px-3 py-1 rounded-md ${tab === 'calendar' ? 'bg-primary-100 text-primary-800' : 'text-neutral-600'}`}
    onClick={() => setTab('calendar')}
  >Calendar</button>
  <button
    className={`px-3 py-1 rounded-md ${tab === 'rooms' ? 'bg-primary-100 text-primary-800' : 'text-neutral-600'}`}
    onClick={() => setTab('rooms')}
  >Rooms</button>
</div>
```

Then wrap the existing calendar content in a conditional:

```tsx
{tab === 'calendar' ? (
  <ExistingCalendarContent />
) : (
  <RoomsKioskView />
)}
```

(`<ExistingCalendarContent />` is shorthand — keep the existing JSX as-is, just inside the conditional branch.)

- [ ] **Step 5: Verify realtime subscription still works**

If `WallCalendar.tsx` sets up Supabase realtime via `useEffect`, verify:
- The subscription is set up in a `useEffect` whose dependency list does NOT include `tab` (it should not, since the data is the same).
- If the subscription cleans up on unmount of an element gated by `tab === 'calendar'`, restructure so the realtime hook lives in the parent (always mounted).

Run `npm run dev` and switch tabs back and forth several times. Watch the network tab — there should NOT be repeated subscription/unsubscription cycles when toggling tabs.

- [ ] **Step 6: Verify idle return is tab-aware**

If there's a 5-minute idle timer that returns to a default tab/view, ensure it doesn't yank a user mid-tap on the Rooms tab. Either:
- Reset the timer on any touch (most robust), or
- Make the timer only fire when on the Calendar tab originally (less invasive)

If the existing timer is global, leave it alone for now; the spec accepts a known small risk here. Note this in the final review (Task 21).

- [ ] **Step 7: Commit**

```bash
git add src/components/wall/WallCalendar.tsx src/apps/home/kiosk/RoomsKioskView.tsx
git commit -m "feat(wall): add Calendar | Rooms tab toggle"
```

---

## Task 18: Kiosk views (Rooms grid, Space, Asset modal)

**Files:**
- Modify: `src/apps/home/kiosk/RoomsKioskView.tsx` (replace stub)
- Create: `src/apps/home/kiosk/SpaceKioskView.tsx`
- Create: `src/apps/home/kiosk/AssetKioskModal.tsx`
- Create: `src/apps/home/kiosk/RoomsKioskView.test.tsx`

Read-only walk-up surface. State-driven — no URL navigation (we're embedded in `WallCalendar`).

- [ ] **Step 1: Write the failing test**

Create `src/apps/home/kiosk/RoomsKioskView.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomsKioskView } from './RoomsKioskView'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Living Room',
        sortOrder: 1, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Living Room',
        sortOrder: 1, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false,
  }),
}))
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ assets: [], loading: false }) }))

describe('RoomsKioskView', () => {
  it('renders all rooms as tiles', () => {
    render(<RoomsKioskView />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Living Room')).toBeInTheDocument()
  })

  it('clicking a room shows the space view', () => {
    render(<RoomsKioskView />)
    fireEvent.click(screen.getByText('Kitchen'))
    expect(screen.getByText(/← Rooms/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/apps/home/kiosk/RoomsKioskView.test.tsx
```

Expected: FAIL (placeholder doesn't have rooms).

- [ ] **Step 3: Implement `AssetKioskModal`**

Create `src/apps/home/kiosk/AssetKioskModal.tsx`:

```typescript
import type { Asset } from '@/types/home'
import { assetTypeLabel } from '@/types/home'

interface Props {
  asset: Asset
  onClose: () => void
}

export function AssetKioskModal({ asset, onClose }: Props) {
  // Simple QR code via a stable URL: open the asset on the user's phone.
  // We use a public QR-image API-free approach: just text the link big.
  const phoneUrl = `${window.location.origin}/home/asset/${asset.id}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">{asset.name}</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl">✕</button>
        </div>

        {asset.photoUrl && (
          <img src={asset.photoUrl} alt={asset.name} className="w-full max-h-96 object-contain mb-4" />
        )}

        <dl className="grid grid-cols-2 gap-y-2 text-base">
          <dt className="text-neutral-500">Type</dt>
          <dd>{assetTypeLabel(asset.assetType)}</dd>
          {asset.purchaseDate && (<>
            <dt className="text-neutral-500">Purchased</dt>
            <dd>{asset.purchaseDate}</dd>
          </>)}
          {asset.warrantyExpiresAt && (<>
            <dt className="text-neutral-500">Warranty</dt>
            <dd>until {asset.warrantyExpiresAt}</dd>
          </>)}
          {asset.serialNumber && (<>
            <dt className="text-neutral-500">Serial</dt>
            <dd>{asset.serialNumber}</dd>
          </>)}
        </dl>

        <div className="mt-6 pt-4 border-t border-neutral-200 text-center">
          <p className="text-sm text-neutral-500 mb-2">To edit, open on your phone:</p>
          <code className="text-base bg-neutral-100 px-3 py-1 rounded">{phoneUrl}</code>
        </div>
      </div>
    </div>
  )
}
```

(Note: a real QR-code rendering can be added later — for Phase 1A, a copyable URL is sufficient and avoids an extra dependency.)

- [ ] **Step 4: Implement `SpaceKioskView`**

Create `src/apps/home/kiosk/SpaceKioskView.tsx`:

```typescript
import { useState } from 'react'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { AssetKioskModal } from './AssetKioskModal'
import type { Asset, Space } from '@/types/home'

interface Props {
  spaceId: string
  onBack: () => void
  onSelectSpace: (id: string) => void
}

export function SpaceKioskView({ spaceId, onBack, onSelectSpace }: Props) {
  const { homes } = useHomes()
  const home = homes[0]
  const { spaces } = useSpaces(home?.id)
  const { assets } = useAssets(home?.id)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  const space = spaces.find((s) => s.id === spaceId)
  if (!space) return <div className="p-8 text-center">Loading…</div>

  const isZone = space.spaceType === 'zone'
  const childZones = spaces.filter((s) => s.parentSpaceId === spaceId)
  const here = assets.filter((a) => a.spaceId === spaceId)
  const parent = isZone ? spaces.find((s) => s.id === space.parentSpaceId) : null
  const parentFacts = isZone ? (parent?.facts ?? []) : []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="text-lg text-primary-700 mb-4">
        ← {isZone ? parent?.name : 'Rooms'}
      </button>

      <h1 className="font-display text-4xl mb-4">{space.name}</h1>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          {space.photoUrl ? (
            <img src={space.photoUrl} alt={space.name} className="w-full rounded-lg" />
          ) : (
            <div className="aspect-[16/9] bg-neutral-200 rounded-lg flex items-center justify-center text-6xl">🏠</div>
          )}
        </div>
        {(space.facts.length > 0 || parentFacts.length > 0) && (
          <div className="card p-4">
            <h3 className="font-display text-xl mb-2">Facts</h3>
            <ul className="space-y-2 text-base">
              {space.facts.map((f, i) => (
                <li key={i}>
                  <div className="text-sm text-neutral-500">{f.label}</div>
                  <div>{f.value}</div>
                </li>
              ))}
              {parentFacts.length > 0 && (
                <li className="pt-2 border-t border-neutral-200 text-sm text-neutral-500">
                  Inherited from {parent?.name}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {!isZone && childZones.length > 0 && (
        <>
          <h2 className="font-display text-2xl mb-2">Zones</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {childZones.map((z) => (
              <button key={z.id} onClick={() => onSelectSpace(z.id)} className="card p-4 text-left hover:bg-neutral-50">
                <div className="font-medium text-lg">{z.name}</div>
                <div className="text-sm text-neutral-500">
                  {assets.filter((a) => a.spaceId === z.id).length} items
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="font-display text-2xl mb-2">Assets</h2>
      <ul className="space-y-2">
        {here.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => setSelectedAsset(a)}
              className="w-full text-left card p-3 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className="text-sm text-neutral-500">{a.assetType}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedAsset && (
        <AssetKioskModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement `RoomsKioskView`**

Replace `src/apps/home/kiosk/RoomsKioskView.tsx`:

```typescript
import { useState } from 'react'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { SpaceKioskView } from './SpaceKioskView'

export function RoomsKioskView() {
  const { homes, loading: homesLoading } = useHomes()
  const home = homes[0]
  const { rooms, loading: spacesLoading } = useSpaces(home?.id)
  const { assets, loading: assetsLoading } = useAssets(home?.id)

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)

  if (homesLoading || spacesLoading || assetsLoading) {
    return <div className="p-8 text-center text-neutral-500">Loading…</div>
  }

  if (!home) {
    return <div className="p-8 text-center text-neutral-500">No home set up yet.</div>
  }

  if (selectedSpaceId) {
    return (
      <SpaceKioskView
        spaceId={selectedSpaceId}
        onBack={() => setSelectedSpaceId(null)}
        onSelectSpace={setSelectedSpaceId}
      />
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl mb-4">Rooms</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {rooms.map((r) => {
          const count = assets.filter((a) => a.spaceId === r.id).length
          return (
            <button
              key={r.id}
              onClick={() => setSelectedSpaceId(r.id)}
              className="card p-0 overflow-hidden text-left hover:shadow-md transition"
            >
              <div className="aspect-[4/3] bg-neutral-200 flex items-center justify-center">
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl">🏠</span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-lg">{r.name}</div>
                <div className="text-sm text-neutral-500">{count} item{count === 1 ? '' : 's'}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run test**

```bash
npx vitest src/apps/home/kiosk/RoomsKioskView.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/apps/home/kiosk/
git commit -m "feat(home-app): kiosk Rooms surface (RoomsKioskView + SpaceKioskView + AssetKioskModal)"
```

---

## Task 19: Kiosk card types + kiosk-agent rules + `source_asset_id` column

**Files:**
- Create: `supabase/migrations/092_kiosk_cards_asset.sql`
- Modify: `supabase/functions/kiosk-agent/index.ts`

- [ ] **Step 1: Read the existing kiosk-agent to understand its rule pattern**

```bash
cat supabase/functions/kiosk-agent/index.ts
```

Identify the existing rules and the shape of card insert payloads. The new rules will follow the same pattern.

- [ ] **Step 2: Write migration `092`**

Create `supabase/migrations/092_kiosk_cards_asset.sql`:

```sql
-- 092_kiosk_cards_asset.sql
-- Phase 1A: kiosk_cards gets a new source pointer for assets,
-- so the kiosk-agent can surface home-related cards
-- (asset_added, warranty_expiring, needs_details, recently_added).

alter table kiosk_cards
  add column if not exists source_asset_id uuid references assets(id) on delete cascade;

create index if not exists kiosk_cards_source_asset_idx
  on kiosk_cards(source_asset_id) where source_asset_id is not null;
```

Apply via Management API:

```bash
SQL=$(cat supabase/migrations/092_kiosk_cards_asset.sql | jq -Rs .)
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
```

Expected: 200.

- [ ] **Step 3: Add four new rules to `kiosk-agent/index.ts`**

Inside the agent's main handler (where existing rules run), add the four new rule functions. Follow the existing rule signature exactly — read at least one existing rule first to mirror its shape.

Add four functions (the names match `card_type` values):

```typescript
// Rule: home.asset_added
//   Surface 24h after a needs_details asset was created.
async function ruleHomeAssetAdded(supabase, userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('assets')
    .select('id, name, space_id')
    .eq('needs_details', true)
    .lte('created_at', since)
    .gte('created_at', cutoff)
  if (!data?.length) return []
  return data.map((a) => ({
    user_id: userId,
    card_type: 'home.asset_added',
    title: `${a.name} — needs details`,
    subtitle: 'Tap your phone to fill in the rest',
    body: { asset_id: a.id },
    source_asset_id: a.id,
    icon: '📦',
    priority: 30,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }))
}

// Rule: home.warranty_expiring
//   60 days out from warranty expiration.
async function ruleHomeWarrantyExpiring(supabase, userId) {
  const inSixty = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('assets')
    .select('id, name, warranty_expires_at')
    .gte('warranty_expires_at', today)
    .lte('warranty_expires_at', inSixty)
  if (!data?.length) return []
  return data.map((a) => ({
    user_id: userId,
    card_type: 'home.warranty_expiring',
    title: `${a.name} warranty expires soon`,
    subtitle: a.warranty_expires_at,
    body: { asset_id: a.id },
    source_asset_id: a.id,
    icon: '⏰',
    priority: 40,
    expires_at: new Date(a.warranty_expires_at + 'T00:00:00Z').toISOString(),
  }))
}

// Rule: home.needs_details — only when count > 5
async function ruleHomeNeedsDetails(supabase, userId) {
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('needs_details', true)
  if (!count || count <= 5) return []
  return [{
    user_id: userId,
    card_type: 'home.needs_details',
    title: `${count} assets need details`,
    subtitle: 'Open Symphony Home to fill in',
    body: { count },
    source_asset_id: null,
    icon: '⚠️',
    priority: 25,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }]
}

// Rule: home.recently_added — Sunday digest
async function ruleHomeRecentlyAdded(supabase, userId) {
  const today = new Date()
  if (today.getDay() !== 0) return []  // Sunday only
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', weekAgo)
  if (!count || count === 0) return []
  return [{
    user_id: userId,
    card_type: 'home.recently_added',
    title: `${count} new asset${count === 1 ? '' : 's'} this week`,
    subtitle: 'Tap to review',
    body: { count },
    source_asset_id: null,
    icon: '🆕',
    priority: 15,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }]
}
```

In the agent's main run loop (where it iterates per-user and combines existing rule outputs), call the four new rules and `upsert` their cards into `kiosk_cards` with the same dedupe pattern existing rules use (e.g., on `(user_id, card_type, source_asset_id)`).

- [ ] **Step 4: Deploy the edge function**

```bash
npx supabase functions deploy kiosk-agent
```

Expected: deployment succeeds. Trigger one run manually:

```bash
curl -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/kiosk-agent" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: 200; check `kiosk_cards` table for new rows of the new types if conditions are met.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/092_kiosk_cards_asset.sql supabase/functions/kiosk-agent/index.ts
git commit -m "feat(home-app): kiosk-agent rules for home cards + source_asset_id column"
```

---

## Task 20: E2E happy paths

**Files:**
- Create: `e2e/home-desktop.spec.ts`
- Create: `e2e/home-mobile.spec.ts`
- Create: `e2e/home-kiosk.spec.ts`

These rely on the existing Playwright test seed (auth + a household). Reference an existing E2E file (e.g., `e2e/app.spec.ts`) for the auth pattern.

- [ ] **Step 1: Read an existing E2E spec to learn auth + seeding patterns**

```bash
ls e2e/
cat e2e/app.spec.ts | head -80
```

Note the login helper, base URL, and any test fixtures.

- [ ] **Step 2: Create `e2e/home-desktop.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
// Adapt the import path below to match the existing test-utils helper.
// E.g., if the project has e2e/utils/login.ts, import from there.
import { signIn } from './utils/login'

test.describe('Home app — desktop', () => {
  test('user can create a room and view it on the overview', async ({ page }) => {
    await signIn(page)
    await page.goto('/home')
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

    // Add a room
    page.once('dialog', (d) => d.accept('Test Room'))
    await page.getByRole('button', { name: '+ Room' }).click()

    await expect(page.getByText('Test Room')).toBeVisible()
  })

  test('user can navigate from room tile to space view', async ({ page }) => {
    await signIn(page)
    await page.goto('/home')
    await page.getByText('Test Room').first().click()
    await expect(page.getByRole('heading', { name: 'Test Room' })).toBeVisible()
  })
})
```

- [ ] **Step 3: Create `e2e/home-mobile.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { signIn } from './utils/login'

test.use({ viewport: { width: 390, height: 844 } })  // iPhone 14

test.describe('Home app — mobile capture', () => {
  test('FAB opens the capture screen', async ({ page }) => {
    await signIn(page)
    await page.goto('/home')
    await page.getByRole('button', { name: '+ Asset' }).click()
    await expect(page.getByRole('heading', { name: 'Add asset' })).toBeVisible()
  })

  test('saving an asset records needs_details=true', async ({ page }) => {
    await signIn(page)
    await page.goto('/home/asset/new')

    // Mock file picker — bypass camera since Playwright can't capture
    await page.setInputFiles('input[type=file]', {
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake'),
    })

    await page.getByLabel('Name').fill('Test Bike')
    await page.getByLabel('Where').selectOption({ index: 1 })  // first room
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // Should redirect to the space view
    await expect(page.getByText('Test Bike')).toBeVisible()

    // Verify asset shows in inbox triage section
    await page.goto('/inbox')
    await expect(page.getByText('Test Bike')).toBeVisible()
  })
})
```

- [ ] **Step 4: Create `e2e/home-kiosk.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { signIn } from './utils/login'

test.describe('Home app — kiosk', () => {
  test('rooms tab on wall shows rooms grid', async ({ page }) => {
    await signIn(page)
    await page.goto('/wall')
    await page.getByRole('button', { name: 'Rooms' }).click()
    await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible()
  })

  test('tapping a room shows the space view', async ({ page }) => {
    await signIn(page)
    await page.goto('/wall')
    await page.getByRole('button', { name: 'Rooms' }).click()
    await page.getByText('Test Room').first().click()
    await expect(page.getByRole('heading', { name: 'Test Room' })).toBeVisible()
  })
})
```

- [ ] **Step 5: Run E2E**

```bash
npm run test:e2e -- e2e/home-desktop.spec.ts e2e/home-mobile.spec.ts e2e/home-kiosk.spec.ts
```

Expected: all PASS. If a spec fails because the auth helper at `e2e/utils/login.ts` doesn't match what's in the repo, adapt the import to the actual helper file (the existing E2E suite must already have one).

- [ ] **Step 6: Commit**

```bash
git add e2e/home-desktop.spec.ts e2e/home-mobile.spec.ts e2e/home-kiosk.spec.ts
git commit -m "test(home-app): e2e happy paths for desktop, mobile, kiosk"
```

---

## Task 21: Self-review + final verification

**Files:** none (review-only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
```

Expected: all PASS.

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint
npm run build
```

Expected: zero errors. Fix anything that broke and commit a separate `fix(home-app): lint/typecheck` commit.

- [ ] **Step 3: Spec coverage walkthrough**

Open the spec at `docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md` and verify each section is implemented:

- Section 1 (Data model) → Task 1 (migration) + Task 2 (types)
- Section 2 (Surfaces & navigation) → Task 7 (sidebar + routes)
- Section 3 (Mobile capture) → Tasks 14 (single-asset) + 15 (room session) + 16 (inbox triage)
- Section 4 (Kiosk Rooms) → Tasks 17 (tab toggle) + 18 (kiosk views) + 19 (cards + agent)
- Section 5 (Desktop browse/edit) → Tasks 9 (overview) + 10 (facts) + 11 (space) + 12 (panel) + 13 (asset)
- Section 6 (Error handling & testing) → Task 20 (E2E) + every TDD task in the plan

If any spec requirement is missing, add a follow-up commit before claiming done.

- [ ] **Step 4: Smoke-test the full happy path manually**

```bash
npm run dev
```

In a desktop browser:
1. Open `/home`. Create a home if prompted, then add a room "Kitchen".
2. Click into Kitchen. Add a fact ("Wall color: BM Cloud White"). Add a zone "Pantry".
3. Click `+ Asset here`. Save with name "Dishwasher".
4. Open `/inbox`. Verify "Dishwasher" appears in "Home items needing details".
5. Click "Fill in →". Edit purchase date and serial. Save.
6. Verify the asset no longer appears in the triage section.
7. Open `/wall`. Click the Rooms tab. Verify Kitchen tile shows.
8. Tap Kitchen → verify space view shows photo placeholder, facts, Pantry zone, Dishwasher asset.
9. Tap Dishwasher → verify modal shows fields with the URL for editing on phone.

In a phone-sized viewport (Chrome DevTools mobile mode):
10. Open `/home/asset/new`. Verify camera prompts (or file picker on desktop). Save with name + room.
11. Open `/home/space/<room id>`, click "Start room session", capture 3 in a row, end session.

If any step breaks, file a bug; do NOT proceed to deployment until all 11 steps pass.

- [ ] **Step 5: Final commit (only if Step 1–4 produced changes)**

If you fixed any issues uncovered by the smoke test:

```bash
git add -A   # only the specific files you changed
git commit -m "fix(home-app): polish from smoke-test pass"
```

- [ ] **Step 6: Done**

The Home app Phase 1A is complete. Subsequent phases (1B org plans, 2 service log + vendors, 3 doc vault, 4 critical-date dashboard) build on this foundation without breaking changes to the schema or surfaces shipped here.
