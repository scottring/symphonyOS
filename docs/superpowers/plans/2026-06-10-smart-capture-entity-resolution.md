# Smart Capture v1 — Entity Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing "Call Macmillan Guitars" into Add-to-Today auto-resolves the contact (alias → containment → fuzzy), shows an inline suggestion with phone + last-task context, links on Enter with zero extra taps, and persists accepted/dismissed outcomes so matching compounds across devices.

**Architecture:** A pure resolver module (`entityResolver.ts`) runs client-side inside `useQuickParse` (explicit syntax always wins). `TodayAddInput` becomes parse-aware like `TimelineQuickInput` and submits a structured result. Two new Supabase tables (`entity_aliases`, `resolution_log`) + one RPC capture learning; a `useResolutionLearning` hook loads aliases and fire-and-forgets outcomes.

**Tech Stack:** React 19, TypeScript, Fuse.js 7 (already a dependency), Supabase (Postgres + RLS), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-10-smart-capture-entity-resolution-design.md` — read it first.

**Worktree:** Work in `.worktrees/smart-capture` (branch `smart-capture`, off `origin/main`). The pre-push hook runs `tsc --noEmit` + unit tests on pushes to `main`. Push to `main` auto-deploys — push only at the end, after Task 8.

---

### Task 1: Database migration — learning tables + alias upsert RPC

**Files:**
- Create: `supabase/migrations/2026-06-10_entity_resolution_learning.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Smart Capture v1: durable learning for entity resolution.
-- entity_aliases: learned text→entity mappings (only created when a fuzzy/alias
-- match is accepted; exact-name containment needs no alias).
-- resolution_log: every suggestion outcome — the labeled corpus future smarter
-- layers read or train on.

create table if not exists entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias_normalized text not null,
  entity_type text not null check (entity_type in ('contact','project')),
  entity_id uuid not null,
  source text not null check (source in ('accepted','corrected')),
  hit_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, alias_normalized, entity_type)
);

create table if not exists resolution_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_text text not null,
  suggested_entity_type text,
  suggested_entity_id uuid,
  score real,
  tier text,
  action text not null check (action in ('auto_applied','accepted','dismissed','ignored')),
  task_id uuid,
  created_at timestamptz not null default now()
);

alter table entity_aliases enable row level security;
alter table resolution_log enable row level security;

create policy "entity_aliases_select_own" on entity_aliases
  for select using (auth.uid() = user_id);
create policy "entity_aliases_insert_own" on entity_aliases
  for insert with check (auth.uid() = user_id);
create policy "entity_aliases_update_own" on entity_aliases
  for update using (auth.uid() = user_id);
create policy "entity_aliases_delete_own" on entity_aliases
  for delete using (auth.uid() = user_id);

create policy "resolution_log_select_own" on resolution_log
  for select using (auth.uid() = user_id);
create policy "resolution_log_insert_own" on resolution_log
  for insert with check (auth.uid() = user_id);

-- Atomic insert-or-increment for learned aliases (supabase-js upsert can't
-- express hit_count = hit_count + 1).
create or replace function upsert_entity_alias(
  p_alias text,
  p_entity_type text,
  p_entity_id uuid,
  p_source text
) returns void
language sql
security invoker
as $$
  insert into entity_aliases (user_id, alias_normalized, entity_type, entity_id, source)
  values (auth.uid(), p_alias, p_entity_type, p_entity_id, p_source)
  on conflict (user_id, alias_normalized, entity_type)
  do update set hit_count = entity_aliases.hit_count + 1,
                last_used_at = now();
$$;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP for project `mwadppyrqzuzgstmwpuy` (configured in `.mcp.json`) to execute the SQL, or `npx supabase db push` if linked locally. Then verify:

```sql
select table_name from information_schema.tables
where table_name in ('entity_aliases','resolution_log');
```
Expected: both rows returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-06-10_entity_resolution_learning.sql
git commit -m "feat(smart-capture): entity_aliases + resolution_log tables and alias upsert RPC"
```

---

### Task 2: `entityResolver.ts` — pure resolver (TDD)

**Files:**
- Create: `src/lib/entityResolver.ts`
- Test: `src/lib/entityResolver.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/entityResolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveContact, type ResolverContext } from './entityResolver'

const macmillan = { id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }
const jon = { id: 'c2', name: 'Jonathan Katz' }
const jonathanK = { id: 'c3', name: 'Jonathan Kane' }

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  contacts: [macmillan, jon, jonathanK],
  aliases: [],
  ...over,
})

describe('resolveContact — tier 2 containment (the Macmillan case)', () => {
  it('resolves a contact whose full name appears in the title', () => {
    const s = resolveContact('Call Macmillan Guitars', ctx())
    expect(s).not.toBeNull()
    expect(s!.contactId).toBe('c1')
    expect(s!.tier).toBe('containment')
    expect(s!.band).toBe('apply')
    expect(s!.phone).toBe('410-555-0142')
  })

  it('detects call intent from the leading verb', () => {
    expect(resolveContact('Call Macmillan Guitars', ctx())!.callIntent).toBe(true)
    expect(resolveContact('text macmillan guitars', ctx())!.callIntent).toBe(true)
    expect(resolveContact('Visit Macmillan Guitars', ctx())!.callIntent).toBe(false)
  })

  it('matches case- and punctuation-insensitively', () => {
    const s = resolveContact('call macmillan guitars!', ctx())
    expect(s!.contactId).toBe('c1')
  })

  it('returns null when nothing matches', () => {
    expect(resolveContact('Buy milk', ctx())).toBeNull()
  })
})

describe('resolveContact — tier 1 learned aliases', () => {
  it('resolves via a learned alias at score 1.0', () => {
    const s = resolveContact('call the guitar place', ctx({
      aliases: [{ aliasNormalized: 'the guitar place', entityType: 'contact', entityId: 'c1' }],
    }))
    expect(s!.tier).toBe('alias')
    expect(s!.score).toBe(1)
    expect(s!.band).toBe('apply')
    expect(s!.contactId).toBe('c1')
  })

  it('alias tier beats containment tier', () => {
    // Alias maps "jonathan" to c3 even though c2's name also contains it.
    const s = resolveContact('call jonathan', ctx({
      aliases: [{ aliasNormalized: 'jonathan', entityType: 'contact', entityId: 'c3' }],
    }))
    expect(s!.contactId).toBe('c3')
    expect(s!.tier).toBe('alias')
  })

  it('ignores project-type aliases for contact resolution', () => {
    const s = resolveContact('call the guitar place', ctx({
      aliases: [{ aliasNormalized: 'the guitar place', entityType: 'project', entityId: 'c1' }],
    }))
    expect(s).toBeNull()
  })
})

describe('resolveContact — tier 3 fuzzy', () => {
  it('fuzzy-matches a misspelling as a suggestion', () => {
    const s = resolveContact('call macmilan guitars', ctx()) // missing an l
    expect(s).not.toBeNull()
    expect(s!.contactId).toBe('c1')
    expect(s!.tier).toBe('fuzzy')
    expect(s!.score).toBeGreaterThanOrEqual(0.6)
  })

  it('near-tie between two contacts never pre-applies', () => {
    const s = resolveContact('call jonathan', ctx())
    // "Jonathan Katz" vs "Jonathan Kane" — ambiguous
    if (s) expect(s.band).toBe('ghost')
  })

  it('disables fuzzy for candidates under 5 chars', () => {
    expect(resolveContact('call jon', ctx({ contacts: [jonathanK] }))).toBeNull()
  })
})

describe('verb stripping', () => {
  it('strips multi-word "pick up"', () => {
    const s = resolveContact('pick up macmillan guitars', ctx())
    expect(s!.contactId).toBe('c1')
    expect(s!.callIntent).toBe(false)
  })

  it('returns null for a bare verb', () => {
    expect(resolveContact('call', ctx())).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/entityResolver.test.ts`
Expected: FAIL — "Cannot find module './entityResolver'"

- [ ] **Step 3: Implement the resolver**

```typescript
// src/lib/entityResolver.ts
import Fuse from 'fuse.js'

export interface ResolverContact {
  id: string
  name: string
  phone?: string
}

export interface EntityAlias {
  aliasNormalized: string
  entityType: 'contact' | 'project'
  entityId: string
}

export interface ResolverContext {
  contacts: ResolverContact[]
  aliases: EntityAlias[]
}

export type SuggestionTier = 'alias' | 'containment' | 'fuzzy'
export type SuggestionBand = 'apply' | 'ghost'

export interface ContactSuggestion {
  contactId: string
  contactName: string
  phone?: string
  /** The normalized text that matched — stored as the alias on accept. */
  matchedText: string
  score: number
  tier: SuggestionTier
  band: SuggestionBand
  callIntent: boolean
}

const CALL_INTENT_VERBS = ['call', 'phone', 'text']
const LEAD_VERBS = [...CALL_INTENT_VERBS, 'email', 'visit', 'see', 'pick up']

const APPLY_THRESHOLD = 0.9
const GHOST_THRESHOLD = 0.6
const TIE_MARGIN = 0.05
const MIN_FUZZY_CHARS = 5
const FUSE_OPTIONS = { keys: ['name'], includeScore: true, threshold: 0.35, ignoreLocation: true } as const

export function normalizeEntityText(s: string): string {
  return s.toLowerCase().replace(/[.,!?'"]/g, '').replace(/\s+/g, ' ').trim()
}

function stripLeadVerb(normalized: string): { candidate: string; callIntent: boolean } {
  // Longest verbs first so "pick up" wins over a hypothetical "pick".
  const verbs = [...LEAD_VERBS].sort((a, b) => b.length - a.length)
  for (const verb of verbs) {
    if (normalized === verb) return { candidate: '', callIntent: CALL_INTENT_VERBS.includes(verb) }
    if (normalized.startsWith(verb + ' ')) {
      return { candidate: normalized.slice(verb.length + 1), callIntent: CALL_INTENT_VERBS.includes(verb) }
    }
  }
  return { candidate: normalized, callIntent: false }
}

/** Contiguous word n-grams, longest first (longer matches are more specific). */
function ngrams(text: string, maxN = 4): string[] {
  const words = text.split(' ').filter(Boolean)
  const grams: string[] = []
  for (let n = Math.min(maxN, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) grams.push(words.slice(i, i + n).join(' '))
  }
  return grams
}

// Fuse index cache keyed on the contacts array identity (stores are referentially
// stable between data changes), so per-keystroke resolution doesn't rebuild it.
const fuseCache = new WeakMap<ResolverContact[], Fuse<ResolverContact>>()
function getFuse(contacts: ResolverContact[]): Fuse<ResolverContact> {
  let fuse = fuseCache.get(contacts)
  if (!fuse) {
    fuse = new Fuse(contacts, FUSE_OPTIONS)
    fuseCache.set(contacts, fuse)
  }
  return fuse
}

export function resolveContact(title: string, ctx: ResolverContext): ContactSuggestion | null {
  const normalized = normalizeEntityText(title)
  if (!normalized) return null
  const { candidate, callIntent } = stripLeadVerb(normalized)
  if (!candidate) return null

  const byId = new Map(ctx.contacts.map((c) => [c.id, c]))
  const suggestion = (
    c: ResolverContact, matchedText: string, score: number, tier: SuggestionTier, band: SuggestionBand,
  ): ContactSuggestion => ({
    contactId: c.id, contactName: c.name, phone: c.phone, matchedText, score, tier, band, callIntent,
  })

  // Tier 1 — learned aliases (score 1.0, pre-apply)
  const aliasMap = new Map(
    ctx.aliases.filter((a) => a.entityType === 'contact').map((a) => [a.aliasNormalized, a.entityId]),
  )
  for (const gram of ngrams(candidate)) {
    const entityId = aliasMap.get(gram)
    const c = entityId ? byId.get(entityId) : undefined
    if (c) return suggestion(c, gram, 1, 'alias', 'apply')
  }

  // Tier 2 — full-name containment (score 0.95, pre-apply)
  for (const c of ctx.contacts) {
    const name = normalizeEntityText(c.name)
    if (name.length >= 3 && candidate.includes(name)) {
      return suggestion(c, name, 0.95, 'containment', 'apply')
    }
  }

  // Tier 3 — fuzzy (band by score; ties never pre-apply)
  if (candidate.length < MIN_FUZZY_CHARS) return null
  const fuse = getFuse(ctx.contacts)
  const bestPerContact = new Map<string, { c: ResolverContact; score: number; gram: string }>()
  for (const gram of ngrams(candidate)) {
    if (gram.length < MIN_FUZZY_CHARS) continue
    for (const r of fuse.search(gram)) {
      const score = 1 - (r.score ?? 1)
      const prev = bestPerContact.get(r.item.id)
      if (!prev || score > prev.score) bestPerContact.set(r.item.id, { c: r.item, score, gram })
    }
  }
  const ranked = [...bestPerContact.values()].sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < GHOST_THRESHOLD) return null
  const second = ranked[1]
  const tie = !!second && best.score - second.score < TIE_MARGIN
  const band: SuggestionBand = !tie && best.score >= APPLY_THRESHOLD ? 'apply' : 'ghost'
  return suggestion(best.c, best.gram, best.score, 'fuzzy', band)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/entityResolver.test.ts`
Expected: PASS (all). If the fuzzy-misspelling test fails on score, check Fuse's score for "macmilan guitars" vs "Macmillan Guitars" — adjust the test's expectation comment, not the thresholds (thresholds are spec'd).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entityResolver.ts src/lib/entityResolver.test.ts
git commit -m "feat(smart-capture): pure entity resolver — alias/containment/fuzzy tiers"
```

---

### Task 3: `phoneNumber` flows through `addTask`

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` (AddTaskOptions ~line 253, optimistic task ~line 290, insert payload ~line 320)
- Test: `src/hooks/useSupabaseTasks.test.ts` (add one case following the file's existing mock pattern)

- [ ] **Step 1: Add a failing test**

Open `src/hooks/useSupabaseTasks.test.ts`, find the existing `addTask` tests, and add (adapting to the file's established mock helpers — reuse its supabase mock):

```typescript
it('passes phoneNumber through to the insert payload', async () => {
  // Arrange using the file's existing renderHook + supabase mock setup
  const { result } = renderHookWithAuth() // ← use the file's actual helper name
  await act(() => result.current.addTask('Call Macmillan Guitars', 'c1', undefined, new Date(), {
    phoneNumber: '410-555-0142',
  }))
  const insertArg = insertMock.mock.calls[0][0] // ← the file's captured insert mock
  expect(insertArg.phone_number).toBe('410-555-0142')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — `phone_number` is `undefined` (and TS error: `phoneNumber` not in `AddTaskOptions`).

- [ ] **Step 3: Implement**

In `AddTaskOptions` add:

```typescript
    phoneNumber?: string  // Tap-to-call number (e.g. resolved from a linked contact)
```

In the optimistic task object add:

```typescript
      phoneNumber: options?.phoneNumber,
```

In the insert payload add:

```typescript
        phone_number: options?.phoneNumber ?? null,
```

(`Task.phoneNumber` and the `phone_number` column already exist; `dbTaskToTask` already maps it.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(smart-capture): addTask accepts phoneNumber"
```

---

### Task 4: `useResolutionLearning` — aliases in, outcomes out

**Files:**
- Create: `src/hooks/useResolutionLearning.ts`
- Test: `src/hooks/useResolutionLearning.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/useResolutionLearning.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const selectMock = vi.fn()
const insertMock = vi.fn().mockResolvedValue({ error: null })
const rpcMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => table === 'entity_aliases'
      ? { select: selectMock }
      : { insert: insertMock }),
    rpc: rpcMock,
  },
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

import { useResolutionLearning } from './useResolutionLearning'
import type { ContactSuggestion } from '@/lib/entityResolver'

const fuzzySuggestion: ContactSuggestion = {
  contactId: 'c1', contactName: 'Macmillan Guitars', phone: '410-555-0142',
  matchedText: 'macmilan guitars', score: 0.82, tier: 'fuzzy', band: 'ghost', callIntent: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  selectMock.mockResolvedValue({ data: [
    { alias_normalized: 'the guitar place', entity_type: 'contact', entity_id: 'c1' },
  ], error: null })
  insertMock.mockResolvedValue({ error: null })
  rpcMock.mockResolvedValue({ error: null })
})

describe('useResolutionLearning', () => {
  it('loads aliases mapped to camelCase', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    expect(result.current.aliases[0]).toEqual({
      aliasNormalized: 'the guitar place', entityType: 'contact', entityId: 'c1',
    })
  })

  it('accepted fuzzy outcome: logs + upserts alias + adds local alias', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmilan guitars', suggestion: fuzzySuggestion, action: 'accepted', taskId: 't1',
    }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', input_text: 'call macmilan guitars', action: 'accepted',
      suggested_entity_id: 'c1', tier: 'fuzzy', task_id: 't1',
    }))
    expect(rpcMock).toHaveBeenCalledWith('upsert_entity_alias', {
      p_alias: 'macmilan guitars', p_entity_type: 'contact', p_entity_id: 'c1', p_source: 'accepted',
    })
    expect(result.current.aliases).toHaveLength(2)
  })

  it('containment outcome logs but never creates an alias', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmillan guitars',
      suggestion: { ...fuzzySuggestion, tier: 'containment', matchedText: 'macmillan guitars', score: 0.95, band: 'apply' },
      action: 'auto_applied',
    }))
    expect(insertMock).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('dismissed outcome logs only', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmilan guitars', suggestion: fuzzySuggestion, action: 'dismissed',
    }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'dismissed' }))
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

Note: check how `useAuth` is actually imported in this repo (`grep -rn "useAuth" src/hooks/useSupabaseTasks.ts`) and match the mock path to the real module path.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/useResolutionLearning.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/hooks/useResolutionLearning.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth' // ← match the repo's actual auth hook path
import type { ContactSuggestion, EntityAlias } from '@/lib/entityResolver'

export type ResolutionAction = 'auto_applied' | 'accepted' | 'dismissed' | 'ignored'

export interface ResolutionOutcome {
  inputText: string
  suggestion: ContactSuggestion
  action: ResolutionAction
  taskId?: string
}

/**
 * Loads learned entity aliases (once per session) and records resolution
 * outcomes. All writes are fire-and-forget: a failed write must never block
 * or fail task creation.
 */
export function useResolutionLearning() {
  const { user } = useAuth()
  const [aliases, setAliases] = useState<EntityAlias[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('entity_aliases')
      .select('alias_normalized, entity_type, entity_id')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setAliases(data.map((d) => ({
          aliasNormalized: d.alias_normalized as string,
          entityType: d.entity_type as EntityAlias['entityType'],
          entityId: d.entity_id as string,
        })))
      })
    return () => { cancelled = true }
  }, [user])

  const recordOutcome = useCallback((o: ResolutionOutcome) => {
    if (!user) return
    void supabase.from('resolution_log').insert({
      user_id: user.id,
      input_text: o.inputText,
      suggested_entity_type: 'contact',
      suggested_entity_id: o.suggestion.contactId,
      score: o.suggestion.score,
      tier: o.suggestion.tier,
      action: o.action,
      task_id: o.taskId ?? null,
    })

    const learns = (o.action === 'accepted' || o.action === 'auto_applied') && o.suggestion.tier !== 'containment'
    if (learns) {
      void supabase.rpc('upsert_entity_alias', {
        p_alias: o.suggestion.matchedText,
        p_entity_type: 'contact',
        p_entity_id: o.suggestion.contactId,
        p_source: 'accepted',
      })
      // Optimistic local alias so the learning works within the same session.
      setAliases((prev) =>
        prev.some((a) => a.aliasNormalized === o.suggestion.matchedText && a.entityType === 'contact')
          ? prev
          : [...prev, { aliasNormalized: o.suggestion.matchedText, entityType: 'contact', entityId: o.suggestion.contactId }],
      )
    }
  }, [user])

  return { aliases, recordOutcome }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useResolutionLearning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useResolutionLearning.ts src/hooks/useResolutionLearning.test.ts
git commit -m "feat(smart-capture): useResolutionLearning — alias load + outcome write-back"
```

---

### Task 5: Resolver step in `useQuickParse`

**Files:**
- Modify: `src/hooks/useQuickParse.ts`
- Test: `src/hooks/useQuickParse.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing tests** (append to the existing file, following its existing render pattern)

```typescript
import { resolveContact } from '@/lib/entityResolver'
import type { ResolverContext } from '@/lib/entityResolver'

describe('useQuickParse — implicit contact resolution', () => {
  const resolver: ResolverContext = {
    contacts: [{ id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }],
    aliases: [],
  }
  const ctx = {
    projects: [],
    contacts: [{ id: 'c1', name: 'Macmillan Guitars' }],
    familyMembers: [],
  }

  it('suggests an implicit contact when no explicit syntax matched', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    expect(result.current.suggestion?.contactId).toBe('c1')
    expect(result.current.suggestion?.band).toBe('apply')
  })

  it('explicit @mention wins — resolver is skipped', () => {
    const ctx2 = { ...ctx, contacts: [...ctx.contacts, { id: 'c2', name: 'Jon' }] }
    const { result } = renderHook(() => useQuickParse('Call @jon about Macmillan Guitars', ctx2, 'personal', resolver))
    expect(result.current.effectiveParsed.contactId).toBe('c2')
    expect(result.current.suggestion).toBeNull()
  })

  it('apply-band suggestion flows into effectiveParsed.contactId', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    expect(result.current.effectiveParsed.contactId).toBe('c1')
  })

  it('dismissSuggestion removes the applied contact and ghost stays out until accepted', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    act(() => result.current.dismissSuggestion())
    expect(result.current.effectiveParsed.contactId).toBeUndefined()
    expect(result.current.suggestionState).toBe('dismissed')
  })

  it('acceptSuggestion applies a ghost-band suggestion', () => {
    const fuzzyResolver: ResolverContext = {
      contacts: [{ id: 'c1', name: 'Macmillan Guitars' }, { id: 'c9', name: 'Macmillan Grocers' }],
      aliases: [],
    }
    const { result } = renderHook(() => useQuickParse('call macmillan', ctx, 'personal', fuzzyResolver))
    if (result.current.suggestion?.band === 'ghost') {
      expect(result.current.effectiveParsed.contactId).toBeUndefined()
      act(() => result.current.acceptSuggestion())
      expect(result.current.effectiveParsed.contactId).toBe(result.current.suggestion.contactId)
    }
  })

  it('without a resolver arg, behavior is unchanged (no suggestion field set)', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal'))
    expect(result.current.suggestion).toBeNull()
    expect(result.current.effectiveParsed.contactId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/useQuickParse.test.ts`
Expected: FAIL — `suggestion` / 4th argument don't exist.

- [ ] **Step 3: Implement**

Modify `useQuickParse`:

```typescript
import { resolveContact, type ResolverContext, type ContactSuggestion } from '@/lib/entityResolver'

export type SuggestionState = 'none' | 'accepted' | 'dismissed'

export function useQuickParse(
  title: string,
  ctx: ParserContext,
  currentDomain: Domain,
  resolver?: ResolverContext,
) {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [suggestionState, setSuggestionState] = useState<SuggestionState>('none')

  const parsed = useMemo<ParsedQuickInput>(
    () => parseQuickInput(title, ctx),
    [title, ctx],
  )

  // Implicit resolution — only when no explicit contact matched and a resolver
  // context was provided. Pure + cached Fuse index → cheap per keystroke.
  const suggestion = useMemo<ContactSuggestion | null>(() => {
    if (!resolver || parsed.contactId || !title.trim()) return null
    return resolveContact(parsed.title || title, resolver)
  }, [resolver, parsed, title])

  // Reset accept/dismiss whenever the suggestion target changes.
  const suggestionKey = suggestion ? `${suggestion.contactId}:${suggestion.band}` : ''
  useEffect(() => { setSuggestionState('none') }, [suggestionKey])

  const suggestionApplied =
    !!suggestion &&
    suggestionState !== 'dismissed' &&
    (suggestion.band === 'apply' || suggestionState === 'accepted')

  const effectiveParsed = useMemo(() => ({
    ...parsed,
    projectId: overrides.projectId === null ? undefined : (overrides.projectId ?? parsed.projectId),
    contactId: overrides.contactId === null
      ? undefined
      : (overrides.contactId ?? parsed.contactId ?? (suggestionApplied ? suggestion!.contactId : undefined)),
    dueDate: overrides.dueDate === null ? undefined : (overrides.dueDate ?? parsed.dueDate),
    category: overrides.category === null ? undefined : (overrides.category ?? parsed.category),
    context: overrides.context === null ? undefined : (overrides.context ?? (currentDomain !== 'universal' ? currentDomain as TaskContext : undefined)),
    assignedMemberIds: overrides.assignedMemberIds === null ? undefined : (overrides.assignedMemberIds ?? parsed.assignedMemberIds),
  }), [parsed, overrides, currentDomain, suggestionApplied, suggestion])
```

Update `contactName` to also resolve from the suggestion:

```typescript
  const contactName = useMemo(() => {
    if (!effectiveParsed.contactId) return null
    if (suggestionApplied && suggestion!.contactId === effectiveParsed.contactId) return suggestion!.contactName
    return ctx.contacts.find(c => c.id === effectiveParsed.contactId)?.name ?? null
  }, [effectiveParsed.contactId, ctx.contacts, suggestionApplied, suggestion])
```

Extend the return object (keep every existing field):

```typescript
  return {
    effectiveParsed,
    hasFields,
    projectName,
    contactName,
    suggestion,
    suggestionState,
    suggestionApplied,
    acceptSuggestion: () => setSuggestionState('accepted'),
    dismissSuggestion: () => setSuggestionState('dismissed'),
    resetSuggestion: () => setSuggestionState('none'),
    resetOverrides: () => setOverrides({}),
    // ...all existing clear*/apply* functions unchanged
  }
```

- [ ] **Step 4: Run the full existing suites to verify no regression**

Run: `npx vitest run src/hooks/useQuickParse.test.ts src/lib/quickInputParser.test.ts`
Expected: PASS — all existing tests plus the new block.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useQuickParse.ts src/hooks/useQuickParse.test.ts
git commit -m "feat(smart-capture): implicit contact suggestion in useQuickParse"
```

---

### Task 6: `TodayAddInput` — parse-aware with suggestion line

**Files:**
- Rewrite: `src/components/schedule/TodayAddInput.tsx`
- Test: Create `src/components/schedule/TodayAddInput.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/schedule/TodayAddInput.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TodayAddInput, type TodayCaptureResult } from './TodayAddInput'

const parserContext = {
  projects: [],
  contacts: [{ id: 'c1', name: 'Macmillan Guitars' }],
  familyMembers: [],
}
const resolver = {
  contacts: [{ id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }],
  aliases: [],
}

function setup(onAdd = vi.fn<(r: TodayCaptureResult) => void>()) {
  render(
    <TodayAddInput
      onAdd={onAdd}
      parserContext={parserContext}
      currentDomain="personal"
      resolver={resolver}
      getRecentTaskForContact={(id) =>
        id === 'c1' ? { title: 'guitar repair follow-up', date: new Date('2026-05-26') } : null}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /add to today/i }))
  return { input: screen.getByPlaceholderText('Add to today...'), onAdd }
}

describe('TodayAddInput smart capture', () => {
  it('shows a pre-applied suggestion with phone and last-task context', async () => {
    vi.useFakeTimers()
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(screen.getByText(/Macmillan Guitars/)).toBeInTheDocument()
    expect(screen.getByText(/410-555-0142/)).toBeInTheDocument()
    expect(screen.getByText(/guitar repair follow-up/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('Enter submits with the suggested contact linked and phone attached', async () => {
    vi.useFakeTimers()
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
    const r = onAdd.mock.calls[0][0]
    expect(r.contactId).toBe('c1')
    expect(r.phoneNumber).toBe('410-555-0142')
    expect(r.resolution?.action).toBe('auto_applied')
    vi.useRealTimers()
  })

  it('unlinking via the × dismisses, and submit reports dismissed', async () => {
    vi.useFakeTimers()
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.click(screen.getByRole('button', { name: /unlink suggestion/i }))
    fireEvent.keyDown(input, { key: 'Enter' })
    const r = onAdd.mock.calls[0][0]
    expect(r.contactId).toBeUndefined()
    expect(r.phoneNumber).toBeUndefined()
    expect(r.resolution?.action).toBe('dismissed')
    vi.useRealTimers()
  })

  it('Esc dismisses the suggestion first, then clears the input', async () => {
    vi.useFakeTimers()
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText(/410-555-0142/)).not.toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('Call Macmillan Guitars')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Add to today...')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('plain text with no match submits exactly as before', () => {
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Buy milk' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const r = onAdd.mock.calls[0][0]
    expect(r.title).toBe('Buy milk')
    expect(r.contactId).toBeUndefined()
    expect(r.resolution).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/schedule/TodayAddInput.test.tsx`
Expected: FAIL — new props don't exist.

- [ ] **Step 3: Rewrite the component**

```tsx
// src/components/schedule/TodayAddInput.tsx
import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Plus, Check, X, Phone } from 'lucide-react'
import type { ParserContext } from '@/lib/quickInputParser'
import type { ResolverContext, ContactSuggestion } from '@/lib/entityResolver'
import { useQuickParse } from '@/hooks/useQuickParse'
import type { ResolutionAction } from '@/hooks/useResolutionLearning'
import type { TaskCategory } from '@/types/task'

type Domain = 'work' | 'family' | 'personal' | 'universal'

export interface TodayCaptureResult {
  title: string
  scheduledFor: Date | null      // null → caller defaults to "today, all-day"
  category?: TaskCategory
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
  phoneNumber?: string
  /** Present only when a suggestion was shown — feeds resolution_log. */
  resolution?: {
    inputText: string
    suggestion: ContactSuggestion
    action: ResolutionAction
  }
}

interface TodayAddInputProps {
  onAdd: (r: TodayCaptureResult) => void
  parserContext: ParserContext
  currentDomain: Domain
  resolver: ResolverContext
  getRecentTaskForContact?: (contactId: string) => { title: string; date: Date } | null
}

/** Debounce a value — used to keep the suggestion line from flickering per keystroke. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function TodayAddInput({ onAdd, parserContext, currentDomain, resolver, getRecentTaskForContact }: TodayAddInputProps) {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Stable ctx identity for useQuickParse's parse memo.
  const ctx = useMemo(
    () => parserContext,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parserContext.projects, parserContext.contacts, parserContext.familyMembers],
  )

  const debouncedValue = useDebouncedValue(value, 150)
  const qp = useQuickParse(debouncedValue, ctx, currentDomain, resolver)
  const { suggestion, suggestionState, suggestionApplied } = qp

  const recentTask = useMemo(
    () => (suggestion && getRecentTaskForContact ? getRecentTaskForContact(suggestion.contactId) : null),
    [suggestion, getRecentTaskForContact],
  )

  const expand = useCallback(() => {
    setExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const reset = useCallback(() => {
    setValue('')
    setExpanded(false)
    qp.resetOverrides()
    qp.resetSuggestion()
  }, [qp])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    const p = qp.effectiveParsed
    const attachPhone = suggestionApplied && suggestion?.callIntent && suggestion.phone
      ? suggestion.phone
      : undefined
    const action: ResolutionAction | null = !suggestion
      ? null
      : suggestionApplied
        ? (suggestionState === 'accepted' ? 'accepted' : 'auto_applied')
        : suggestionState === 'dismissed' ? 'dismissed' : 'ignored'
    onAdd({
      title: p.title?.trim() || trimmed,
      scheduledFor: p.dueDate ?? null,
      category: p.category,
      projectId: p.projectId,
      contactId: p.contactId,
      assignedMemberIds: p.assignedMemberIds,
      phoneNumber: attachPhone,
      resolution: suggestion && action ? { inputText: trimmed, suggestion, action } : undefined,
    })
    reset()
  }, [value, qp, suggestion, suggestionState, suggestionApplied, onAdd, reset])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      // Esc cascade: dismiss a visible suggestion first; second Esc clears/collapses.
      if (suggestion && suggestionState !== 'dismissed') {
        qp.dismissSuggestion()
        return
      }
      reset()
      inputRef.current?.blur()
    }
  }, [handleSubmit, suggestion, suggestionState, qp, reset])

  const handleBlur = useCallback(() => {
    if (!value.trim()) setExpanded(false)
  }, [value])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-150"
        aria-label="Add to today"
      >
        <Plus className="w-4 h-4" />
        Add to today
      </button>
    )
  }

  const showSuggestion = !!suggestion && suggestionState !== 'dismissed'

  return (
    <div className="rounded-lg border border-primary-300 bg-white shadow-sm transition-all duration-200">
      <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2">
        <span className="text-lg leading-none text-primary-500">+</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Add to today..."
          className="flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none"
        />
        {value.trim() && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSubmit}
            className="px-2.5 py-1 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
          >
            Add
          </button>
        )}
      </div>

      {showSuggestion && (
        <div
          className={`flex items-start gap-2 px-3 pb-2 md:px-4 min-h-[44px] ${suggestionApplied ? '' : 'opacity-60'}`}
        >
          {suggestionApplied ? (
            <Check className="w-3.5 h-3.5 mt-0.5 text-primary-500 shrink-0" />
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => qp.acceptSuggestion()}
              className="text-xs text-primary-600 font-medium shrink-0 mt-0.5"
            >
              tap to link
            </button>
          )}
          <div className="flex-1 text-xs text-neutral-600 leading-snug">
            <span className="font-medium text-neutral-800">{suggestion.contactName}</span>
            {suggestion.phone && (
              <span className="ml-1.5 inline-flex items-center gap-0.5">
                <Phone className="w-3 h-3 inline" /> {suggestion.phone}
              </span>
            )}
            {recentTask && (
              <div className="text-neutral-400">
                last: {recentTask.title} · {recentTask.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
          {suggestionApplied && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => qp.dismissSuggestion()}
              aria-label="Unlink suggestion"
              className="p-1 text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/schedule/TodayAddInput.test.tsx`
Expected: PASS. (This will temporarily break `TodayView`'s usage — TypeScript errors are expected until Task 7; `vitest run` on this file alone still works.)

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayAddInput.tsx src/components/schedule/TodayAddInput.test.tsx
git commit -m "feat(smart-capture): parse-aware TodayAddInput with inline contact suggestion"
```

---

### Task 7: Wire it through `HomeViewContainer` / `ScheduleActionsContext` / `TodayView`

**Files:**
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (handler ~line 209, context value ~line 410)
- Modify: `src/contexts/ScheduleActionsContext.tsx` (type additions)
- Modify: `src/components/schedule/TodayView.tsx` (lines ~451, ~456 — the two `<TodayAddInput>` renders)
- Modify: `src/components/schedule/TodayView.test.tsx` (update mocks/props expectations)

- [ ] **Step 1: Extend `ScheduleActionsContext` type**

Add to the context interface (alongside the existing `contacts` field):

```typescript
  /** Structured create from the smart Add-to-Today input. */
  onCreateTaskParsed?: (r: TodayCaptureResult) => void | Promise<void>
  /** Stable parser context for parse-aware inputs. */
  parserContext?: ParserContext
  currentDomain?: 'work' | 'family' | 'personal' | 'universal'
  /** Resolver inputs for implicit entity resolution. */
  resolverContext?: ResolverContext
  getRecentTaskForContact?: (contactId: string) => { title: string; date: Date } | null
```

with imports:

```typescript
import type { TodayCaptureResult } from '@/components/schedule/TodayAddInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { ResolverContext } from '@/lib/entityResolver'
```

- [ ] **Step 2: Build the values in `HomeViewContainer`**

Near the other hooks (~line 47–61):

```typescript
import { useResolutionLearning } from '@/hooks/useResolutionLearning'
import type { ResolverContext } from '@/lib/entityResolver'
import type { TodayCaptureResult } from '@/components/schedule/TodayAddInput'
import type { ParserContext } from '@/lib/quickInputParser'

  const { aliases, recordOutcome } = useResolutionLearning()

  const parserContext = useMemo<ParserContext>(
    () => ({ projects, contacts, familyMembers }),
    [projects, contacts, familyMembers],
  )

  const resolverContext = useMemo<ResolverContext>(
    () => ({
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? undefined })),
      aliases,
    }),
    [contacts, aliases],
  )

  const getRecentTaskForContact = useCallback(
    (contactId: string) => {
      const recent = tasks
        .filter((t) => t.contactId === contactId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      return recent ? { title: recent.title, date: recent.createdAt } : null
    },
    [tasks],
  )
```

Then the structured handler, next to the existing `onCreateTaskFromValue` (which stays as the raw-string fallback):

```typescript
  const onCreateTaskParsed = useCallback(
    async (r: TodayCaptureResult) => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const taskId = await addTask(r.title, r.contactId, r.projectId, r.scheduledFor ?? today, {
        assignedTo: r.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id,
        assignedToAll: r.assignedMemberIds,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        category: r.category,
        isAllDay: r.scheduledFor ? false : true,
        phoneNumber: r.phoneNumber,
      })
      if (r.resolution) {
        recordOutcome({
          inputText: r.resolution.inputText,
          suggestion: r.resolution.suggestion,
          action: r.resolution.action,
          taskId,
        })
      }
    },
    [addTask, getCurrentUserMember, currentDomain, recordOutcome],
  )
```

Add `onCreateTaskParsed`, `parserContext`, `currentDomain`, `resolverContext`, `getRecentTaskForContact` to the context value object (~line 410, where `contactsMap`/`projectsMap` already are).

- [ ] **Step 3: Update the two `TodayView` render sites**

Replace both `<TodayAddInput onAdd={ctx.onCreateTask} />` occurrences (~lines 451, 456) with:

```tsx
<TodayAddInput
  onAdd={ctx.onCreateTaskParsed!}
  parserContext={ctx.parserContext!}
  currentDomain={ctx.currentDomain ?? 'universal'}
  resolver={ctx.resolverContext!}
  getRecentTaskForContact={ctx.getRecentTaskForContact}
/>
```

If `TodayView.test.tsx` stubs the context, extend its stub with the new fields (`onCreateTaskParsed: vi.fn()`, `parserContext: { projects: [], contacts: [], familyMembers: [] }`, `currentDomain: 'personal'`, `resolverContext: { contacts: [], aliases: [] }`).

- [ ] **Step 4: Typecheck + run the affected suites**

```bash
npx tsc --noEmit
npx vitest run src/components/schedule/ src/hooks/useQuickParse.test.ts
```
Expected: tsc clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/apps/tasks/HomeViewContainer.tsx src/contexts/ScheduleActionsContext.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(smart-capture): wire smart Add-to-Today through context with learning write-back"
```

---

### Task 8: Full verification, manual check, push

- [ ] **Step 1: Full test suite + typecheck + lint**

```bash
npx tsc --noEmit && npx vitest run && npm run lint
```
Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Manual verification in the dev app**

```bash
npm run dev
```
In the browser (Today view):
1. Type `Call Macmillan Guitars` (or any real contact) in Add-to-Today → suggestion line appears within ~200ms with name + phone + last task.
2. Press Enter → task created, contact chip on the task, tap-to-call works.
3. Type a misspelling of a contact → ghost suggestion, "tap to link" works.
4. ✕ a pre-applied suggestion → task created unlinked.
5. In Supabase (table editor or SQL): `select action, tier, input_text from resolution_log order by created_at desc limit 5;` → rows match the actions just performed; `select * from entity_aliases;` → row exists only for the accepted fuzzy match.
6. Repeat the misspelling from step 3 → now resolves at tier "alias" instantly (pre-applied).

- [ ] **Step 3: Rebase + push (auto-deploys)**

```bash
git fetch origin && git rebase origin/main
git push origin HEAD:main
```
The pre-push hook runs tsc + unit tests. Expected: push succeeds, Vercel deploys.

- [ ] **Step 4: Clean up the worktree** (after confirming deploy)

```bash
git worktree remove .worktrees/smart-capture
```

---

## Plan self-review notes

- **Spec coverage:** tiers/bands/tie/verb-strip (Task 2), inline UX + Esc cascade + 44px tap target (Task 6), phone attach on call intent (Tasks 3, 6, 7), learning tables + write-back rules incl. no-alias-for-containment (Tasks 1, 4), history display-only (Tasks 6, 7), explicit-syntax precedence + no-resolver-no-change (Task 5), degradation (resolver absent/empty → current behavior, Tasks 5–6).
- **Known judgment calls for the implementer:** exact `useAuth` import path (verify, Task 4 note); `useSupabaseTasks.test.ts` mock helper names (adapt, Task 3); `TodayView.test.tsx` context stub shape (adapt, Task 7). These are existing-pattern lookups, not design decisions.
