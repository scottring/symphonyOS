# Plan-from-paper Duplicate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A line on a photographed plan page that already exists as a task re-places that task instead of creating a duplicate.

**Architecture:** `parse-plan` transcribes exactly as it does today, then reads the caller's open tasks through an RLS-scoped client and passes the parsed titles plus those candidates to a shared matcher module (`_shared/planMatch.ts`) that makes one text-only Haiku call. The matcher fails soft — any error returns no matches and the parse still succeeds. The client merges matches onto `PlanItem`s, the review sheet flags them, and the commit path routes matched items to `updateTask` instead of `addTask`.

**Tech Stack:** Deno edge functions (Supabase), React 19 + TypeScript strict, Vitest, Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-plan-dedupe-design.md`. Read it first.
- Work in the worktree `.worktrees/plan-dedupe` on branch `plan-dedupe`. Never edit or commit in the main worktree.
- Node must be 22.14.0 before running tests. Run `node -v` first; if wrong, `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- `npm test` is WATCH mode. Always use `npx vitest run <path>`.
- Typecheck with `npx tsc --noEmit -p tsconfig.app.json`. At the repo root `npx tsc --noEmit` is a no-op.
- That project **excludes test files** (`tsconfig.app.json:34`), so tsc never type-checks a `*.test.tsx`. Type errors in fixtures surface only when vitest compiles them — never conclude a fixture is sound because tsc was silent.
- Date fixtures must not be UTC midnight. A `T00:00:00.000Z` literal reads back as the previous day in every timezone west of UTC, so a test asserting the date passes in CI and fails locally. Use noon UTC.
- Edge-function modules are tested with **vitest**, not `deno test` — `supabase/functions/**/*.{test,spec}.ts` is in the vitest `include`.
- Never use the service-role client to read user rows. Reads of `tasks` must go through a client carrying the caller's `Authorization` header so RLS applies.
- Never partial-`upsert` the `tasks` table (guaranteed 23502). Writes go through the existing `updateTask` / `addTask` hooks.
- No emojis in UI copy. Use lucide icons.
- The vision prompt in `parse-plan` must not be modified by any task in this plan.

---

### Task 1: The matcher module

**Files:**
- Create: `supabase/functions/_shared/planMatch.ts`
- Test: `supabase/functions/_shared/planMatch.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface MatchCandidate { id: string; title: string }`
  - `interface PlanMatch { index: number; taskId: string }`
  - `function validateMatches(raw: unknown, candidateIds: Set<string>, itemCount: number): PlanMatch[]`
  - `function buildMatchPrompt(titles: string[], candidates: MatchCandidate[]): string`
  - `type ModelCaller = (prompt: string) => Promise<string>`
  - `function matchPlanItems(titles: string[], candidates: MatchCandidate[], call: ModelCaller): Promise<PlanMatch[]>`
  - `function callHaiku(apiKey: string): ModelCaller`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/planMatch.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import {
  validateMatches,
  buildMatchPrompt,
  matchPlanItems,
  type MatchCandidate,
} from './planMatch.ts'

const CANDIDATES: MatchCandidate[] = [
  { id: 't-roof', title: 'Call the roofer' },
  { id: 't-bank', title: 'Call bank re: the wire transfer' },
]
const IDS = new Set(CANDIDATES.map((c) => c.id))

describe('validateMatches', () => {
  it('keeps a well-formed match', () => {
    expect(validateMatches({ matches: [{ index: 0, task_id: 't-roof' }] }, IDS, 2))
      .toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('drops an id that was never sent as a candidate', () => {
    // The hallucination guard: a model-invented id must never reach a write.
    expect(validateMatches({ matches: [{ index: 0, task_id: 't-invented' }] }, IDS, 2)).toEqual([])
  })

  it('drops an index outside the parsed item range', () => {
    expect(validateMatches({ matches: [{ index: 9, task_id: 't-roof' }] }, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: [{ index: -1, task_id: 't-roof' }] }, IDS, 2)).toEqual([])
  })

  it('keeps only the first match for a repeated index', () => {
    const out = validateMatches(
      { matches: [{ index: 0, task_id: 't-roof' }, { index: 0, task_id: 't-bank' }] },
      IDS,
      2,
    )
    expect(out).toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('tolerates a malformed response instead of throwing', () => {
    expect(validateMatches(null, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: 'nope' }, IDS, 2)).toEqual([])
    expect(validateMatches({}, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: [{ index: 'x', task_id: 't-roof' }] }, IDS, 2)).toEqual([])
  })
})

describe('buildMatchPrompt', () => {
  it('lists every candidate id and every parsed title', () => {
    const prompt = buildMatchPrompt(['Call roofer'], CANDIDATES)
    expect(prompt).toContain('t-roof')
    expect(prompt).toContain('Call the roofer')
    expect(prompt).toContain('0: Call roofer')
  })

  it('states the same-action bar so a different action on the same subject is excluded', () => {
    const prompt = buildMatchPrompt(['x'], CANDIDATES)
    expect(prompt).toContain('same action')
  })
})

describe('matchPlanItems', () => {
  it('short-circuits with no candidates and never calls the model', async () => {
    const call = vi.fn()
    expect(await matchPlanItems(['Call roofer'], [], call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it('short-circuits with no items and never calls the model', async () => {
    const call = vi.fn()
    expect(await matchPlanItems([], CANDIDATES, call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it('validates whatever the model returns', async () => {
    const call = vi.fn().mockResolvedValue('{"matches":[{"index":0,"task_id":"t-roof"}]}')
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call))
      .toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('strips markdown fences the model may wrap the JSON in', async () => {
    const call = vi.fn().mockResolvedValue('```json\n{"matches":[{"index":0,"task_id":"t-bank"}]}\n```')
    expect(await matchPlanItems(['bank'], CANDIDATES, call))
      .toEqual([{ index: 0, taskId: 't-bank' }])
  })

  it('returns no matches when the model call rejects', async () => {
    // Fails soft: a matcher problem must never take down a parse that succeeded.
    const call = vi.fn().mockRejectedValue(new Error('529 overloaded'))
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call)).toEqual([])
  })

  it('returns no matches when the model returns unparseable text', async () => {
    const call = vi.fn().mockResolvedValue('I could not determine any matches.')
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/planMatch.test.ts`
Expected: FAIL — cannot resolve `./planMatch.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/planMatch.ts`:

```typescript
/** Plan-from-paper duplicate matching.
 *
 *  Given the titles transcribed off a plan page and the user's open tasks,
 *  decide which written lines ALREADY EXIST as tasks. A match re-places the
 *  existing task instead of creating a twin (see the 2026-08-19 spec).
 *
 *  Deliberately separate from the vision call in parse-plan: transcription is
 *  the thing that must not regress, so its prompt is untouched, and a matcher
 *  failure degrades to "no matches" rather than losing a parsed page. */

const MODEL = 'claude-haiku-4-5-20251001'
/** Enough context for a plan page against a working backlog; caps prompt cost. */
export const MAX_CANDIDATES = 300

export interface MatchCandidate {
  id: string
  title: string
}

export interface PlanMatch {
  index: number
  taskId: string
}

export type ModelCaller = (prompt: string) => Promise<string>

export function buildMatchPrompt(titles: string[], candidates: MatchCandidate[]): string {
  const written = titles.map((t, i) => `${i}: ${t}`).join('\n')
  const existing = candidates.map((c) => `- ${c.id}: ${c.title}`).join('\n')
  return `A user planned on paper and photographed the page. These lines were transcribed from it:

${written}

These are the tasks already in their app:

${existing}

For each written line, decide whether it refers to a task that already exists.

The bar for a match: the written line and the existing task must name the SAME ACTION.
- Paraphrase and shorthand DO match. "bank" matches "Call bank re: the wire transfer".
- A different action on the same subject does NOT match. "Call roofer" does not match "Pay roofer invoice".
- If you are unsure, return no match for that line. A missed match costs the user a duplicate they can delete; a wrong match silently re-dates real work.

Respond with ONLY a JSON object (no markdown fences, no prose). Include an entry ONLY for lines that match:

{"matches": [{"index": 0, "task_id": "the id of the existing task"}]}

If nothing matches, return {"matches": []}.`
}

/** Validate the model's response. Every guard degrades to "no match" — an
 *  invented id or a stray index must never reach a write. */
export function validateMatches(
  raw: unknown,
  candidateIds: Set<string>,
  itemCount: number,
): PlanMatch[] {
  const matches = (raw as { matches?: unknown } | null)?.matches
  if (!Array.isArray(matches)) return []
  const out: PlanMatch[] = []
  const claimed = new Set<number>()
  for (const entry of matches) {
    const e = entry as { index?: unknown; task_id?: unknown }
    if (typeof e.index !== 'number' || !Number.isInteger(e.index)) continue
    if (e.index < 0 || e.index >= itemCount) continue
    if (typeof e.task_id !== 'string' || !candidateIds.has(e.task_id)) continue
    if (claimed.has(e.index)) continue
    claimed.add(e.index)
    out.push({ index: e.index, taskId: e.task_id })
  }
  return out
}

/** One text-only Haiku call. Never throws — see the module note. */
export async function matchPlanItems(
  titles: string[],
  candidates: MatchCandidate[],
  call: ModelCaller,
): Promise<PlanMatch[]> {
  if (titles.length === 0 || candidates.length === 0) return []
  try {
    const text = await call(buildMatchPrompt(titles, candidates))
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    return validateMatches(
      JSON.parse(stripped),
      new Set(candidates.map((c) => c.id)),
      titles.length,
    )
  } catch (e) {
    console.error('planMatch failed, continuing without matches:', e instanceof Error ? e.message : String(e))
    return []
  }
}

export function callHaiku(apiKey: string): ModelCaller {
  return async (prompt: string) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((b) => b.type === 'text')?.text
    if (typeof text !== 'string') throw new Error('No text in Anthropic response')
    return text
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/planMatch.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planMatch.ts supabase/functions/_shared/planMatch.test.ts
git commit -m "feat(plan): matcher module — which written lines already exist as tasks"
```

---

### Task 2: Wire the matcher into parse-plan

**Files:**
- Modify: `supabase/functions/parse-plan/index.ts`

**Interfaces:**
- Consumes: `matchPlanItems`, `callHaiku`, `MAX_CANDIDATES`, `type MatchCandidate` from Task 1.
- Produces: the `parse-plan` response gains a `matches` array of
  `{ index: number, task_id: string, bucket: string | null, scheduled_for: string | null }`.
  Task 3 consumes exactly this shape.

**Note:** the vision prompt (`buildPrompt`) is NOT touched. Only orchestration is added.

- [ ] **Step 1: Add the import**

At the top of `supabase/functions/parse-plan/index.ts`, after the existing `createClient` import:

```typescript
import { matchPlanItems, callHaiku, MAX_CANDIDATES, type MatchCandidate } from '../_shared/planMatch.ts'
```

- [ ] **Step 2: Add the candidate fetch helper**

Add above `Deno.serve`:

```typescript
interface OpenTaskRow {
  id: string
  title: string
  bucket: string | null
  scheduled_for: string | null
}

/** The user's open tasks, read through THEIR token so RLS applies. The
 *  service-role client must never read user rows here — it bypasses RLS and
 *  would surface other household members' tasks as match candidates. */
async function fetchOpenTasks(url: string, anonKey: string, authHeader: string): Promise<OpenTaskRow[]> {
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data, error } = await asUser
    .from('tasks')
    .select('id, title, bucket, scheduled_for')
    .eq('completed', false)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES)
  if (error) throw new Error(`Could not read open tasks: ${error.message}`)
  return (data ?? []) as OpenTaskRow[]
}
```

- [ ] **Step 3: Read the anon key alongside the other env vars**

Find this block:

```typescript
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !serviceKey) return json({ error: 'Missing server config' }, 500)
```

Replace with:

```typescript
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !serviceKey || !anonKey) return json({ error: 'Missing server config' }, 500)
```

- [ ] **Step 4: Run the matcher after the parse and return its result**

Find the end of the `try` block:

```typescript
    return json({ ok: true, items })
```

Replace with:

```typescript
    // Matching runs AFTER transcription and is fully contained: any failure
    // here returns an unflagged page rather than losing the parse.
    let matches: { index: number; task_id: string; bucket: string | null; scheduled_for: string | null }[] = []
    try {
      const open = await fetchOpenTasks(url, anonKey, authHeader)
      const candidates: MatchCandidate[] = open.map((t) => ({ id: t.id, title: t.title }))
      const byId = new Map(open.map((t) => [t.id, t]))
      matches = (await matchPlanItems(items.map((i) => i.title), candidates, callHaiku(apiKey)))
        .flatMap((m) => {
          const row = byId.get(m.taskId)
          return row
            ? [{ index: m.index, task_id: m.taskId, bucket: row.bucket, scheduled_for: row.scheduled_for }]
            : []
        })
    } catch (e) {
      console.error('parse-plan match step failed:', e instanceof Error ? e.message : String(e))
    }

    return json({ ok: true, items, matches })
```

- [ ] **Step 5: Typecheck the client (the edge function is Deno, so this only proves nothing else broke)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Re-run the matcher tests to confirm the shared module still passes**

Run: `npx vitest run supabase/functions/_shared/planMatch.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/parse-plan/index.ts
git commit -m "feat(plan): parse-plan returns duplicate matches alongside items"
```

---

### Task 3: Client types, match merge, and the update mapping

**Files:**
- Modify: `src/lib/planParse.ts`
- Test: `src/lib/planParse.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: the `matches` array shape from Task 2.
- Produces:
  - `interface ExistingMatch { taskId: string; label: string; placement: PlanPlacement | null }`
  - `PlanItem` gains `existing: ExistingMatch | null`
  - `function describeExisting(bucket: string | null, scheduledFor: string | null): { label: string; placement: PlanPlacement | null }`
  - `function placementsEqual(a: PlanPlacement | null, b: PlanPlacement): boolean`
  - `function planItemToUpdateArgs(item: PlanItem, ctx: PlanCommitContext): Partial<Task>`
  - `validatePlanItems` keeps its signature and now populates `existing`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/planParse.test.ts` (and extend the import at the top of that
file to include the new symbols):

```typescript
import {
  describeExisting,
  placementsEqual,
  planItemToUpdateArgs,
  type ExistingMatch,
} from './planParse'

describe('describeExisting', () => {
  it('labels a dated task with a short local date', () => {
    const out = describeExisting('timed', '2026-08-20T00:00:00.000Z')
    expect(out.label).toMatch(/Aug 20/)
    expect(out.placement).toEqual({ kind: 'date', date: '2026-08-20' })
  })

  it('labels the week bucket', () => {
    expect(describeExisting('week', null)).toEqual({ label: 'This week', placement: { kind: 'week' } })
  })

  it('labels the inbox, including a null bucket', () => {
    expect(describeExisting('inbox', null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
    expect(describeExisting(null, null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
  })

  it('labels month and quarter with no comparable placement', () => {
    // No PlanPlacement equivalent — a null placement never compares equal, so
    // these always write rather than being mistaken for a no-op.
    expect(describeExisting('month', null)).toEqual({ label: 'Month', placement: null })
    expect(describeExisting('quarter', null)).toEqual({ label: 'Quarter', placement: null })
  })

  it('falls back to Inbox when timed has no date', () => {
    expect(describeExisting('timed', null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
  })
})

describe('placementsEqual', () => {
  it('matches identical placements', () => {
    expect(placementsEqual({ kind: 'date', date: '2026-08-20' }, { kind: 'date', date: '2026-08-20' })).toBe(true)
    expect(placementsEqual({ kind: 'week' }, { kind: 'week' })).toBe(true)
    expect(placementsEqual({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true)
  })

  it('separates different placements', () => {
    expect(placementsEqual({ kind: 'date', date: '2026-08-20' }, { kind: 'date', date: '2026-08-21' })).toBe(false)
    expect(placementsEqual({ kind: 'week' }, { kind: 'inbox' })).toBe(false)
  })

  it('never matches a null placement', () => {
    expect(placementsEqual(null, { kind: 'week' })).toBe(false)
  })
})

describe('validatePlanItems with matches', () => {
  it('attaches a match to the item at its index', () => {
    const items = validatePlanItems(
      {
        items: [
          { title: 'Call roofer', day: '2026-08-18', assignee_id: null, note: null },
          { title: 'Mulch beds', day: 'week', assignee_id: null, note: null },
        ],
        matches: [{ index: 0, task_id: 't-roof', bucket: 'week', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toEqual({
      taskId: 't-roof',
      label: 'This week',
      placement: { kind: 'week' },
    })
    expect(items[1].existing).toBeNull()
  })

  it('leaves existing null when the response carries no matches', () => {
    const items = validatePlanItems(
      { items: [{ title: 'Call roofer', day: 'week', assignee_id: null, note: null }] },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toBeNull()
  })

  it('ignores a match index that no item occupies', () => {
    const items = validatePlanItems(
      {
        items: [{ title: 'Call roofer', day: 'week', assignee_id: null, note: null }],
        matches: [{ index: 7, task_id: 't-roof', bucket: 'week', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toBeNull()
  })

  it('indexes matches against the RAW response, not the filtered output', () => {
    // Item 0 is dropped for having no title, so the surviving item is index 1
    // in the response but index 0 in the output. The match must follow the row.
    const items = validatePlanItems(
      {
        items: [
          { title: '   ', day: 'week', assignee_id: null, note: null },
          { title: 'Call roofer', day: 'week', assignee_id: null, note: null },
        ],
        matches: [{ index: 1, task_id: 't-roof', bucket: 'inbox', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items).toHaveLength(1)
    expect(items[0].existing?.taskId).toBe('t-roof')
  })
})

describe('planItemToUpdateArgs', () => {
  const ctx = { currentWeekStart: new Date(2026, 7, 16), context: 'family' as const }
  const matched: ExistingMatch = { taskId: 't-1', label: 'Inbox', placement: { kind: 'inbox' } }

  it('moves a matched item to a date as an all-day timed task', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'date', date: '2026-08-20' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(localYmd(updates.scheduledFor as Date)).toBe('2026-08-20')
    expect(updates.isAllDay).toBe(true)
    expect(updates.bucket).toBe('timed')
  })

  it('moves a matched item to the week bucket WITH the week stamped, clearing the date', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'week' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(updates.bucket).toBe('week')
    expect(updates.weekStart).toEqual(ctx.currentWeekStart)
    expect('scheduledFor' in updates).toBe(true)
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('moves a matched item to the inbox, clearing the date', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'inbox' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(updates.bucket).toBe('inbox')
    expect('scheduledFor' in updates).toBe(true)
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('carries neither title nor note — a re-place moves the task, it does not rewrite it', () => {
    const updates = planItemToUpdateArgs(
      { title: 'Rewritten wording', placement: { kind: 'week' }, assigneeId: 'm-iris', note: 'new note', existing: matched },
      ctx,
    )
    expect('title' in updates).toBe(false)
    expect('notes' in updates).toBe(false)
    expect('assignedTo' in updates).toBe(false)
  })
})
```

**Also migrate the existing fixtures in this file.** `existing` is a required
field, so every `PlanItem` literal must carry it. Add `existing: null` to the
five literals at `src/lib/planParse.test.ts:78`, `:88`, `:96`, `:103`, and
`:105`, and to the three expected objects in the "accepts well-formed items"
assertion.

No production code constructs a `PlanItem` literal — the parser is the only
producer — so the migration is confined to test fixtures. If `tsc` reports a
`PlanItem` error outside a test file, stop and report it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/planParse.test.ts`
Expected: FAIL — `describeExisting` is not exported.

- [ ] **Step 3: Implement in `src/lib/planParse.ts`**

Extend the imports at the top of the file:

```typescript
import type { Task, TaskBucket, TaskContext } from '@/types/task'
```

Add after the `PlanPlacement` type:

```typescript
/** A parsed line that already exists as a task. `placement` is the existing
 *  task's current position, so the review sheet can spot a move that would be a
 *  no-op; it is null for buckets with no PlanPlacement equivalent. */
export interface ExistingMatch {
  taskId: string
  label: string
  placement: PlanPlacement | null
}
```

Add `existing` to `PlanItem`:

```typescript
export interface PlanItem {
  title: string
  placement: PlanPlacement
  assigneeId: string | null
  note: string | null
  existing: ExistingMatch | null
}
```

Add these functions:

```typescript
/** Render a matched task's current position for display, and as a comparable
 *  placement where one exists. */
export function describeExisting(
  bucket: string | null,
  scheduledFor: string | null,
): { label: string; placement: PlanPlacement | null } {
  if (bucket === 'month') return { label: 'Month', placement: null }
  if (bucket === 'quarter') return { label: 'Quarter', placement: null }
  if (bucket === 'week') return { label: 'This week', placement: { kind: 'week' } }
  if (bucket === 'timed' && scheduledFor) {
    const date = localYmd(new Date(scheduledFor))
    return {
      label: parseLocalYmd(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      placement: { kind: 'date', date },
    }
  }
  return { label: 'Inbox', placement: { kind: 'inbox' } }
}

/** A null placement never compares equal — an uncomparable bucket always writes. */
export function placementsEqual(a: PlanPlacement | null, b: PlanPlacement): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'date' && b.kind === 'date' ? a.date === b.date : true
}

interface RawMatch {
  index: number
  task_id: string
  bucket: string | null
  scheduled_for: string | null
}

function readMatches(raw: unknown): Map<number, RawMatch> {
  const list = (raw as { matches?: unknown } | null)?.matches
  const out = new Map<number, RawMatch>()
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    const m = entry as Partial<RawMatch>
    if (typeof m.index !== 'number' || !Number.isInteger(m.index)) continue
    if (typeof m.task_id !== 'string' || !m.task_id) continue
    if (out.has(m.index)) continue
    out.set(m.index, {
      index: m.index,
      task_id: m.task_id,
      bucket: typeof m.bucket === 'string' ? m.bucket : null,
      scheduled_for: typeof m.scheduled_for === 'string' ? m.scheduled_for : null,
    })
  }
  return out
}
```

Rewrite the loop inside `validatePlanItems` so matches are keyed off the RAW
response index, not the output index:

```typescript
  const matches = readMatches(raw)
  const out: PlanItem[] = []
  for (const [rawIndex, entry] of items.entries()) {
    const e = entry as { title?: unknown; day?: unknown; assignee_id?: unknown; note?: unknown }
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    const day = typeof e.day === 'string' ? e.day : 'inbox'
    const placement: PlanPlacement =
      day === 'week' ? { kind: 'week' }
      : day === 'inbox' ? { kind: 'inbox' }
      : YMD.test(day) && window.has(day) ? { kind: 'date', date: day }
      : { kind: 'week' }
    const match = matches.get(rawIndex)
    out.push({
      title: e.title.trim(),
      placement,
      assigneeId: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null,
      existing: match
        ? { taskId: match.task_id, ...describeExisting(match.bucket, match.scheduled_for) }
        : null,
    })
  }
  return out
```

Add the update mapping at the end of the file:

```typescript
/**
 * A matched item → the `updateTask` patch that re-places the existing task.
 *
 * Only scheduling fields travel. The page decides WHEN, not what the task says
 * — re-placing must never overwrite a title or notes the user has since
 * refined in the app.
 *
 * `updateTask` enforces the bucket/date invariants itself, but the bucket is
 * stated explicitly here so the intent survives independently of that helper.
 */
export function planItemToUpdateArgs(item: PlanItem, ctx: PlanCommitContext): Partial<Task> {
  switch (item.placement.kind) {
    case 'date':
      return {
        scheduledFor: parseLocalYmd(item.placement.date),
        isAllDay: true,
        bucket: 'timed' as TaskBucket,
      }
    case 'week':
      // bucket='week' rows must say WHICH week (placement cascade).
      return { bucket: 'week' as TaskBucket, weekStart: ctx.currentWeekStart, scheduledFor: undefined }
    case 'inbox':
      return { bucket: 'inbox' as TaskBucket, scheduledFor: undefined }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/planParse.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: **no output, exit 0.** `tsconfig.app.json:34` excludes `src/**/*.test.*` and `src/**/*.spec.*`, so tsc cannot see the fixture breakage at all — the missing `existing` field on `PlanReviewSheet.test.tsx`'s `ITEMS` literals surfaces only when vitest compiles that file, which Task 5 fixes. If tsc reports an error in any PRODUCTION file, stop and report it: no production code constructs a `PlanItem` literal, so such an error means something unexpected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planParse.ts src/lib/planParse.test.ts
git commit -m "feat(plan): merge duplicate matches onto parsed items; add the re-place mapping"
```

---

### Task 4: Pass matches through the hook

**Files:**
- Modify: `src/hooks/usePlanFromPaper.ts`

**Interfaces:**
- Consumes: `validatePlanItems` from Task 3 (unchanged signature — it reads
  `matches` off the same `data` object it already receives).
- Produces: nothing new. `items` returned by the hook now carry `existing`.

- [ ] **Step 1: Confirm no code change is needed to the invoke call**

`invokeParse` already passes the whole `data` object to `validatePlanItems`:

```typescript
setItems(validatePlanItems(data, dates, new Set(members.map((m) => m.id))))
```

Since `validatePlanItems` now reads `data.matches` itself, this line needs no
change. Verify it reads exactly as above and make no edit if so.

- [ ] **Step 2: Run the hook's consumers to confirm nothing broke**

Run: `npx vitest run src/lib/planParse.test.ts src/components/capture/PlanReviewSheet.test.tsx`
Expected: `planParse` PASSes; `PlanReviewSheet` may fail on missing `existing` in its fixtures — that is Task 5's job.

- [ ] **Step 3: No commit**

This task is a verification step only. If Step 1 found the line already correct, there is nothing to commit; proceed to Task 5.

---

### Task 5: Flag matched rows in the review sheet

**Files:**
- Modify: `src/components/capture/PlanReviewSheet.tsx`
- Test: `src/components/capture/PlanReviewSheet.test.tsx` (existing file — add to it)

**Interfaces:**
- Consumes: `PlanItem.existing`, `placementsEqual` from Task 3.
- Produces: no new exports. `onCommit` still receives `PlanItem[]`; matched items
  are identifiable by their `existing` field, which Task 6 branches on.

- [ ] **Step 1: Migrate the existing fixtures**

`src/components/capture/PlanReviewSheet.test.tsx:12-15` defines `ITEMS` whose
entries predate the `existing` field, so they no longer satisfy `PlanItem`. Add
`existing: null` to both:

```typescript
const ITEMS: PlanItem[] = [
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100', existing: null },
  { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null, existing: null },
]
```

The file's existing assertion of `add 2 tasks` still holds — two unmatched items
are still two adds.

- [ ] **Step 2: Write the failing tests**

Append to `src/components/capture/PlanReviewSheet.test.tsx`, using the file's
existing `renderSheet(overrides)` helper (it returns `{ onCommit, onClose }`):

```typescript
const matchedItem: PlanItem = {
  title: 'Call roofer',
  placement: { kind: 'date', date: '2026-08-20' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-roof', label: 'This week', placement: { kind: 'week' } },
}
const plainItem: PlanItem = {
  title: 'Pick up dry cleaning',
  placement: { kind: 'date', date: '2026-08-21' },
  assigneeId: null,
  note: null,
  existing: null,
}
const noOpItem: PlanItem = {
  title: 'Mulch beds',
  placement: { kind: 'week' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-mulch', label: 'This week', placement: { kind: 'week' } },
}

describe('PlanReviewSheet duplicate flags', () => {
  it('flags a matched row with where the task is now and where it will go', () => {
    renderSheet({ items: [matchedItem], windowDates: ['2026-08-20'] })
    expect(screen.getByText(/already in Symphony/i)).toBeInTheDocument()
    expect(screen.getByText(/This week/)).toBeInTheDocument()
  })

  it('does not flag an unmatched row', () => {
    renderSheet({ items: [plainItem], windowDates: ['2026-08-21'] })
    expect(screen.queryByText(/already in Symphony/i)).not.toBeInTheDocument()
  })

  it('counts adds and moves separately on the commit button', () => {
    renderSheet({ items: [matchedItem, plainItem], windowDates: ['2026-08-20', '2026-08-21'] })
    expect(screen.getByRole('button', { name: /Add 1, move 1/i })).toBeInTheDocument()
  })

  it('says only Add when nothing matched', () => {
    renderSheet({ items: [plainItem], windowDates: ['2026-08-21'] })
    expect(screen.getByRole('button', { name: /Add 1 task/i })).toBeInTheDocument()
  })

  it('says only Move when everything matched', () => {
    renderSheet({ items: [matchedItem], windowDates: ['2026-08-20'] })
    expect(screen.getByRole('button', { name: /Move 1 task/i })).toBeInTheDocument()
  })

  it('marks a match already in the right place as no change and excludes it from the count', () => {
    renderSheet({ items: [noOpItem, plainItem], windowDates: ['2026-08-21'] })
    expect(screen.getByText(/no change/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add 1 task/i })).toBeInTheDocument()
  })

  it('excludes an unchecked matched row from the commit entirely', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      items: [matchedItem, plainItem],
      windowDates: ['2026-08-20', '2026-08-21'],
    })
    await user.click(screen.getByRole('checkbox', { name: /Call roofer/i }))
    await user.click(screen.getByRole('button', { name: /Add 1 task/i }))
    expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ title: 'Pick up dry cleaning' })])
  })

  it('recomputes the flag when the user changes the target placement', async () => {
    const user = userEvent.setup()
    renderSheet({ items: [noOpItem], windowDates: ['2026-08-20'] })
    expect(screen.getByText(/no change/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('When'), '2026-08-20')
    expect(screen.queryByText(/no change/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Move 1 task/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/capture/PlanReviewSheet.test.tsx`
Expected: FAIL — no "already in Symphony" text, and the commit button reads
"Add 2 tasks" where the new tests expect a move count.

- [ ] **Step 4: Implement the flag and the counts**

In `src/components/capture/PlanReviewSheet.tsx`, extend the import:

```typescript
import { placementsEqual, type PlanItem, type PlanPlacement } from '@/lib/planParse'
```

Replace the `includedCount` memo with counts that separate adds from moves:

```typescript
  /** A matched row already sitting where the page puts it is a no-op — it is
   *  neither an add nor a move, and commit skips its write entirely. */
  const counts = useMemo(() => {
    let adds = 0
    let moves = 0
    for (const r of rows) {
      if (!r.included || !r.title.trim()) continue
      if (!r.existing) adds++
      else if (!placementsEqual(r.existing.placement, r.placement)) moves++
    }
    return { adds, moves, total: adds + moves }
  }, [rows])

  const commitLabel = (() => {
    const { adds, moves } = counts
    const addPart = `Add ${adds} ${adds === 1 ? 'task' : 'tasks'}`
    const movePart = `Move ${moves} ${moves === 1 ? 'task' : 'tasks'}`
    if (adds && moves) return `Add ${adds}, move ${moves}`
    if (moves) return movePart
    return addPart
  })()
```

Add the subline inside the row, directly after the existing `row.note`
paragraph:

```tsx
                  {row.existing && (
                    <p className="text-[13px] text-amber-700">
                      already in Symphony ({row.existing.label})
                      {placementsEqual(row.existing.placement, row.placement)
                        ? ' — no change'
                        : ` — will move to ${targetLabel(row.placement)}`}
                    </p>
                  )}
```

Add the target label helper beside `dateLabel`:

```typescript
function targetLabel(p: PlanPlacement): string {
  if (p.kind === 'week') return 'This week'
  if (p.kind === 'inbox') return 'Inbox'
  return dateLabel(p.date)
}
```

Update the commit button to use the new label and count:

```tsx
            <button
              type="button"
              onClick={commit}
              disabled={committing || counts.total === 0}
              className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
            >
              {committing ? 'Adding…' : commitLabel}
            </button>
```

Note: `commit` itself is unchanged — it still passes every included row to
`onCommit`, no-ops included. Task 6 skips the no-op write at the commit site,
which keeps this component free of write logic.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/capture/PlanReviewSheet.test.tsx`
Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/capture/PlanReviewSheet.tsx src/components/capture/PlanReviewSheet.test.tsx
git commit -m "feat(plan): review sheet flags lines already in Symphony"
```

---

### Task 6: Route matched items to updateTask on commit

**Files:**
- Modify: `src/apps/tasks/HomeViewContainer.tsx:690-704`
- Test: `src/lib/planCommit.test.ts` (create)
- Create: `src/lib/planCommit.ts`

**Interfaces:**
- Consumes: `planItemToAddTaskArgs`, `planItemToUpdateArgs`, `placementsEqual`,
  `PlanCommitContext`, `PlanItem` from Task 3.
- Produces:
  - `interface PlanCommitPlan { adds: PlanAddTaskArgs[]; moves: { taskId: string; updates: Partial<Task> }[]; skipped: number }`
  - `function buildCommitPlan(items: PlanItem[], ctx: PlanCommitContext): PlanCommitPlan`

The split is extracted into `src/lib/planCommit.ts` rather than written inline in
the container: the container is a large file under active change by another
session, and the branching logic is the part that needs tests.

- [ ] **Step 1: Write the failing test**

Create `src/lib/planCommit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildCommitPlan } from './planCommit'
import type { PlanItem } from './planParse'
import { localYmd } from '@/lib/cadence/config'

const ctx = { currentWeekStart: new Date(2026, 7, 16), context: 'family' as const }

const unmatched: PlanItem = {
  title: 'Pick up dry cleaning',
  placement: { kind: 'date', date: '2026-08-21' },
  assigneeId: null,
  note: null,
  existing: null,
}
const matchedMoving: PlanItem = {
  title: 'Call roofer',
  placement: { kind: 'date', date: '2026-08-20' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-roof', label: 'This week', placement: { kind: 'week' } },
}
const matchedNoOp: PlanItem = {
  title: 'Mulch beds',
  placement: { kind: 'week' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-mulch', label: 'This week', placement: { kind: 'week' } },
}

describe('buildCommitPlan', () => {
  it('sends an unmatched item to adds', () => {
    const plan = buildCommitPlan([unmatched], ctx)
    expect(plan.adds).toHaveLength(1)
    expect(plan.adds[0].title).toBe('Pick up dry cleaning')
    expect(plan.moves).toHaveLength(0)
  })

  it('sends a matched item to moves, keyed by the existing task id', () => {
    const plan = buildCommitPlan([matchedMoving], ctx)
    expect(plan.adds).toHaveLength(0)
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0].taskId).toBe('t-roof')
    expect(localYmd(plan.moves[0].updates.scheduledFor as Date)).toBe('2026-08-20')
  })

  it('skips a match that is already where the page puts it', () => {
    const plan = buildCommitPlan([matchedNoOp], ctx)
    expect(plan.adds).toHaveLength(0)
    expect(plan.moves).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })

  it('splits a mixed batch', () => {
    const plan = buildCommitPlan([unmatched, matchedMoving, matchedNoOp], ctx)
    expect(plan.adds).toHaveLength(1)
    expect(plan.moves).toHaveLength(1)
    expect(plan.skipped).toBe(1)
  })

  it('never carries a title into a move — the page moves a task, it does not rename it', () => {
    const renamed: PlanItem = { ...matchedMoving, title: 'Totally different wording' }
    const plan = buildCommitPlan([renamed], ctx)
    expect('title' in plan.moves[0].updates).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/planCommit.test.ts`
Expected: FAIL — cannot resolve `./planCommit`.

- [ ] **Step 3: Create `src/lib/planCommit.ts`**

```typescript
// src/lib/planCommit.ts
//
// Splitting a reviewed plan page into writes. A line the matcher recognised
// re-places the task that already exists; everything else is a new task. A
// match already sitting where the page puts it is neither — skipping it keeps
// the toast honest and avoids a pointless write.

import type { Task } from '@/types/task'
import {
  placementsEqual,
  planItemToAddTaskArgs,
  planItemToUpdateArgs,
  type PlanAddTaskArgs,
  type PlanCommitContext,
  type PlanItem,
} from '@/lib/planParse'

export interface PlanCommitPlan {
  adds: PlanAddTaskArgs[]
  moves: { taskId: string; updates: Partial<Task> }[]
  skipped: number
}

export function buildCommitPlan(items: PlanItem[], ctx: PlanCommitContext): PlanCommitPlan {
  const plan: PlanCommitPlan = { adds: [], moves: [], skipped: 0 }
  for (const item of items) {
    if (!item.existing) {
      plan.adds.push(planItemToAddTaskArgs(item, ctx))
    } else if (placementsEqual(item.existing.placement, item.placement)) {
      plan.skipped++
    } else {
      plan.moves.push({ taskId: item.existing.taskId, updates: planItemToUpdateArgs(item, ctx) })
    }
  }
  return plan
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/planCommit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the container**

In `src/apps/tasks/HomeViewContainer.tsx`, add the import beside the existing
`planItemToAddTaskArgs` import:

```typescript
import { buildCommitPlan } from '@/lib/planCommit';
```

Replace the whole body of `handleCommitPlanItems` (currently lines 690-704) with:

```typescript
  const handleCommitPlanItems = useCallback(async (items: PlanItem[]) => {
    const commitCtx = {
      currentWeekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      context: currentDomain === 'universal' ? null : currentDomain,
    };
    const defaultAssigneeId = getCurrentUserMember()?.id;
    const plan = buildCommitPlan(items, commitCtx);

    for (const args of plan.adds) {
      await addTask(args.title, undefined, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      });
    }

    // A move that is rejected (a shared task this user cannot write) must not
    // abort the rest of the batch — count the failures and say so.
    let failed = 0;
    for (const move of plan.moves) {
      try {
        await updateTask(move.taskId, move.updates);
      } catch (e) {
        failed++;
        console.error('[plan] could not move existing task', move.taskId, e);
      }
    }

    const parts: string[] = [];
    if (plan.adds.length) parts.push(`Added ${plan.adds.length} task${plan.adds.length === 1 ? '' : 's'}`);
    const moved = plan.moves.length - failed;
    if (moved > 0) parts.push(`moved ${moved}`);
    if (plan.skipped) parts.push(`${plan.skipped} already in place`);
    if (parts.length) showToast(`${parts.join(', ')} from your plan`, 'success', 4000);
    if (failed) showToast(`Couldn't move ${failed} task${failed === 1 ? '' : 's'}`, 'error', 5000);
  }, [addTask, updateTask, currentDomain, getCurrentUserMember]);
```

`updateTask` is already destructured from `useSupabaseTasks` at
`src/apps/tasks/HomeViewContainer.tsx:62`, so it needs no new wiring — just add
it to this callback's dependency array as shown. Do not create a second hook
instance.

- [ ] **Step 6: Typecheck and run the full affected suite**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors anywhere.

Run: `npx vitest run src/lib/planParse.test.ts src/lib/planCommit.test.ts src/components/capture/PlanReviewSheet.test.tsx supabase/functions/_shared/planMatch.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planCommit.ts src/lib/planCommit.test.ts src/apps/tasks/HomeViewContainer.tsx
git commit -m "feat(plan): a matched line re-places its task instead of duplicating it"
```

---

### Task 7: Full verification and deploy

**Files:** none modified.

- [ ] **Step 1: Rebase onto the current origin/main**

Another session is actively working in `HomeViewContainer.tsx`. Rebase before
verifying so the suite runs against what will actually ship:

```bash
git fetch origin && git rebase origin/main
```

Resolve any conflict in `HomeViewContainer.tsx` by keeping BOTH sides: their
Today changes and this plan's `handleCommitPlanItems` body.

- [ ] **Step 2: Run the whole unit suite**

Run: `npx vitest run`
Expected: PASS. If a failure looks unrelated to this work, check whether it is a
date-sensitive fixture rotting on the wall clock before assuming a regression.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Deploy the edge function**

```bash
npx supabase functions deploy parse-plan --project-ref mwadppyrqzuzgstmwpuy
```

Expected: deploy succeeds. The client change is useless without it — the old
function returns no `matches` field, and every row renders unflagged.

- [ ] **Step 5: Report before pushing**

Do NOT push to `main` without reporting first. Summarise: suite result,
typecheck result, edge deploy result, and anything left unverified. Real-page
behaviour (a photographed plan against a real backlog) cannot be verified from
here and must be called out as untested.

---

## Verification Notes

What this plan does NOT prove, and must be stated when reporting:

- **No test exercises the real Haiku call.** `matchPlanItems` is tested with an
  injected caller. Whether the model actually honours the same-action bar on
  real backlog data is unverified until a real page is photographed.
- **No test exercises RLS on the candidate fetch.** That the JWT-scoped client
  returns only the caller's rows is an assumption carried from the other edge
  functions using this pattern.
- **The no-op skip and the move path are tested as pure functions**, not against
  a live Supabase write.
