# Symphony v2 Talk First (Change Card + Week) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Symphony proposes multi-item changes as one change card (previewed dashed on the page, one Approve, one Undo), and the Week page becomes a picture planned by talking.

**Architecture:** The agent gets a non-writing tool, `symphony_propose_changes`, that streams a validated `change_set` event. The client holds one pending set in `CanvasActivityContext`. `ChangeCard` (in the docked bar) shows it, and Week draws its ops as dashed rows. Approve applies the set through the app's own task writers (`updateTask` / `addTask`, which already run placement and privacy rules), in order. Any failure reverses the steps already applied, and success yields one Undo through `activity.run`. A second tool, `symphony_read_week`, gives the planning loop the whole week in one call. A final PR removes the old Week machinery.

**Tech Stack:** React 19, TypeScript strict, Vite 7, Tailwind v4, Vitest + Testing Library, Supabase (Deno edge function `symphony-agent`).

**Spec:** `docs/superpowers/specs/2026-10-14-symphony-v2-talk-first-design.md` (approved mockup: https://claude.ai/artifact/WC78LdmFCEAh8hA8ooMw24)

## Global Constraints

- Work only in the worktree `.claude/worktrees/v2-talk-first` (branch `claude/v2-talk-first`), never in the main checkout.
- Three PRs, in order: PR 1 = Tasks 1–8, PR 2 = Tasks 9–13, PR 3 = Tasks 14–18. Each is rebased on a freshly fetched `origin/main` before opening.
- Pushing to `main` deploys production. Never merge or deploy without Scott's explicit OK. Edge-function deploys (`supabase functions deploy symphony-agent`) also need his OK.
- Change-set ops, v1: `place`, `unplace`, `add`, `someday`, `assign`. **No delete op.** At most **40 ops** per set.
- The agent **never writes during a planning conversation**. A request touching more than one item ends in `symphony_propose_changes`. A single-item request is still written directly, as today.
- Card copy: kind labels `MOVE` / `ADD` / `LATER` / `WHO`; button `Approve all N`; the dashed-preview note `Nothing is saved until you approve.`; failure `Couldn't save. Nothing was changed. Try again.`; stale `“<title>” changed since I proposed this. Ask me for a fresh list.`
- Dashed preview style: a 1.5px dashed `#1b6a64` border on `#eef6f3` (the Symphony proposal colours in the mockup).
- Design language: scenery / paper journal (`src/index.css`). Crimson Pro display, DM Sans body. No new fonts.
- Never use a service-role client in app code. Agent reads use the RLS-scoped `db` client already passed to `runTool`.
- Tests: `npx vitest run <path>` for a unit file, `npm test -- --run` for all, `npm run lint`, `npm run build`.

## Review Focus

1. **A task changed after Symphony proposed** (someone ticked it on the wall, or Iris moved it). Approve must refuse the whole set with the stale message and write nothing. Pinned in Task 5.
2. **Approve fails halfway** (network drops on op 3 of 6). Ops 1–2 must be reversed and the card must say nothing changed. Pinned in Task 5.
3. **A new proposal arrives while one is pending.** The new set replaces the old one, and Approve applies only the new one. Pinned in Task 6.
4. **The model names a task the person can't see** (another person's private task, or an invented id). The server tool returns an error to the model and streams no set. Pinned in Task 2.
5. **Undo after Approve when a proposed task was then edited by hand.** Undo writes the before-values back, which would overwrite the hand edit. v1 accepts this, as the existing receipt Undo already does, but Undo must be gone once the receipt is dismissed or replaced. Pinned in Task 6.

---

# PR 1: the change card

### Task 1: Server-side change-set validation

**Files:**
- Create: `supabase/functions/symphony-agent/changeSet.ts`
- Test: `supabase/functions/symphony-agent/changeSet.test.ts`

**Interfaces:**
- Produces:
  - `type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'`
  - `interface ChangeOp { key: string; op: ChangeOpKind; taskId?: string; title: string; date?: string; time?: string; assignee?: string; assigneeName?: string; goalId?: string; seen?: string }`
  - `interface ChangeSet { key: string; title: string; ops: ChangeOp[] }`
  - `changeSetFromInput(input: Record<string, unknown>, key: string): { set: ChangeSet } | { error: string }`, which validates shape only. Task ops carry `title: ''` until Task 2 resolves them.
  - `resolveRefs(set: ChangeSet, tasks: { id: string; title: string; updated_at: string; completed: boolean }[], members: { id: string; name: string }[]): { set: ChangeSet } | { error: string }`
  - `PROPOSE_CHANGES_TOOL` (Anthropic tool schema object)

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/symphony-agent/changeSet.test.ts
import { describe, expect, it } from 'vitest'
import { changeSetFromInput, resolveRefs } from './changeSet'

const A = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'
const B = '4f1c2a9e-7b3d-4c11-9a0e-2f6b8d1e3c55'
const M = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

describe('changeSetFromInput', () => {
  it('keeps valid ops and gives each a stable key', () => {
    const r = changeSetFromInput({ title: '3 changes to your week', ops: [
      { op: 'place', task_id: A, date: '2026-10-15', time: '09:00' },
      { op: 'add', title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' },
      { op: 'someday', task_id: B },
    ] }, 'tu1')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.key).toBe('tu1')
    expect(r.set.title).toBe('3 changes to your week')
    expect(r.set.ops.map((o) => [o.key, o.op])).toEqual([['tu1:0', 'place'], ['tu1:1', 'add'], ['tu1:2', 'someday']])
    expect(r.set.ops[0]).toMatchObject({ taskId: A, date: '2026-10-15', time: '09:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' })
  })

  it('refuses bad ops instead of guessing', () => {
    expect('error' in changeSetFromInput({ ops: [] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'delete', task_id: A }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: 'nope', date: '2026-10-15' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-02-30' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-10-15', time: '25:00' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'add', title: '  ' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'assign', task_id: A }] }, 'k')).toBe(true)
    const many = Array.from({ length: 41 }, () => ({ op: 'someday', task_id: A }))
    expect('error' in changeSetFromInput({ ops: many }, 'k')).toBe(true)
  })

  it('defaults the title to the count', () => {
    const r = changeSetFromInput({ ops: [{ op: 'someday', task_id: A }, { op: 'unplace', task_id: B }] }, 'k')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.title).toBe('2 changes')
  })
})

describe('resolveRefs', () => {
  const base = changeSetFromInput({ ops: [
    { op: 'place', task_id: A, date: '2026-10-15' },
    { op: 'assign', task_id: B, assignee: M },
  ] }, 'k')
  if ('error' in base) throw new Error(base.error)

  it('fills titles, what Symphony saw, and names', () => {
    const r = resolveRefs(base.set,
      [{ id: A, title: 'Reply to Christian', updated_at: '2026-10-14T07:00:00.123456+00:00', completed: false },
       { id: B, title: 'Kids clean rooms', updated_at: '2026-10-13T20:00:00+00:00', completed: false }],
      [{ id: M, name: 'Ella' }])
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[0]).toMatchObject({ title: 'Reply to Christian', seen: '2026-10-14T07:00:00.123456+00:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Kids clean rooms', assigneeName: 'Ella' })
  })

  it('refuses a task the person cannot see, a finished task, or an unknown person', () => {
    expect('error' in resolveRefs(base.set, [{ id: B, title: 'x', updated_at: 'x', completed: false }], [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: true }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: false }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [])).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/symphony-agent/changeSet.test.ts`
Expected: FAIL, "Failed to resolve import ./changeSet".

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/symphony-agent/changeSet.ts
//
// The change card's server half (spec 2026-10-14). Symphony PROPOSES a set of
// changes; nothing here writes. The client previews the set dashed on the
// page and applies it on one Approve, with one Undo.
//
// v1 ops are task-only and never delete: dropping something is Someday.

export type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'

export interface ChangeOp {
  key: string
  op: ChangeOpKind
  taskId?: string
  /** The task's title (resolved server-side), or the new task's title for add. */
  title: string
  /** YYYY-MM-DD */
  date?: string
  /** HH:MM, 24-hour */
  time?: string
  assignee?: string
  assigneeName?: string
  goalId?: string
  /** The task's updated_at when Symphony read it; Approve refuses if it moved. */
  seen?: string
}

export interface ChangeSet { key: string; title: string; ops: ChangeOp[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = new Set<ChangeOpKind>(['place', 'unplace', 'add', 'someday', 'assign'])
const MAX_OPS = 40

const realDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}
const realTime = (v: unknown): string | null =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null

export function changeSetFromInput(input: Record<string, unknown>, key: string): { set: ChangeSet } | { error: string } {
  const raw = Array.isArray(input.ops) ? input.ops : null
  if (!raw || !raw.length) return { error: 'Provide at least one op' }
  if (raw.length > MAX_OPS) return { error: `Propose at most ${MAX_OPS} changes at a time` }
  const ops: ChangeOp[] = []
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i] as Record<string, unknown> | null
    if (!o || typeof o !== 'object') return { error: `Op ${i + 1} is not an object` }
    const op = o.op as ChangeOpKind
    if (!KINDS.has(op)) return { error: `Op ${i + 1}: unknown op "${String(o.op)}" (use place, unplace, add, someday or assign)` }
    const base: ChangeOp = { key: `${key}:${i}`, op, title: '' }
    if (op !== 'add') {
      if (typeof o.task_id !== 'string' || !UUID_RE.test(o.task_id)) return { error: `Op ${i + 1}: task_id must be an existing task id` }
      base.taskId = o.task_id
    }
    if (op === 'place' || (op === 'add' && o.date !== undefined)) {
      const date = realDate(o.date)
      if (!date) return { error: `Op ${i + 1}: date must be a real YYYY-MM-DD date` }
      base.date = date
    }
    if (o.time !== undefined && (op === 'place' || op === 'add')) {
      const time = realTime(o.time)
      if (!time) return { error: `Op ${i + 1}: time must be HH:MM (24-hour)` }
      base.time = time
    }
    if (op === 'add') {
      const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
      if (!title) return { error: `Op ${i + 1}: add needs a title` }
      base.title = title
      if (typeof o.goal_id === 'string' && UUID_RE.test(o.goal_id)) base.goalId = o.goal_id
    }
    if (op === 'assign' || (op === 'add' && o.assignee !== undefined)) {
      if (typeof o.assignee !== 'string' || !UUID_RE.test(o.assignee)) return { error: `Op ${i + 1}: assignee must be a household member id` }
      base.assignee = o.assignee
    }
    ops.push(base)
  }
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 120)
    : ops.length === 1 ? '1 change' : `${ops.length} changes`
  return { set: { key, title, ops } }
}

export function resolveRefs(
  set: ChangeSet,
  tasks: { id: string; title: string; updated_at: string; completed: boolean }[],
  members: { id: string; name: string }[],
): { set: ChangeSet } | { error: string } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const names = new Map(members.map((m) => [m.id, m.name]))
  const ops: ChangeOp[] = []
  for (const op of set.ops) {
    const next = { ...op }
    if (op.taskId) {
      const t = byId.get(op.taskId)
      if (!t) return { error: `No task ${op.taskId} that this person can change. Read the tasks again and use their ids.` }
      if (t.completed) return { error: `"${t.title}" is already done; leave it out` }
      next.title = t.title
      next.seen = t.updated_at
    }
    if (op.assignee) {
      const name = names.get(op.assignee)
      if (!name) return { error: `No household member ${op.assignee}. Use symphony_list_household_members.` }
      next.assigneeName = name
    }
    ops.push(next)
  }
  return { set: { ...set, ops } }
}

export const PROPOSE_CHANGES_TOOL = {
  name: 'symphony_propose_changes',
  description: 'Propose ONE list of changes to the person\'s tasks, shown as a change card and as dashed rows on the page. Nothing is saved until they press Approve. Use this whenever a request changes MORE THAN ONE task, and always at the end of a planning conversation. Never call write tools for the same changes. Ops: place (give an existing task a day, optionally a time), unplace (take its day away), add (a new task, optionally on a day/time), someday (set it aside; there is no delete), assign (one household member). If the person asks to change the list, call this again with the whole revised list.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short heading, e.g. "6 changes to your week"' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['place', 'unplace', 'add', 'someday', 'assign'] },
            task_id: { type: 'string', description: 'Existing task id (all ops except add)' },
            title: { type: 'string', description: 'New task title (add only)' },
            date: { type: 'string', description: 'YYYY-MM-DD (place; optional for add)' },
            time: { type: 'string', description: 'HH:MM 24-hour (optional, place/add)' },
            assignee: { type: 'string', description: 'Household member id (assign; optional for add)' },
            goal_id: { type: 'string', description: 'Month goal the new task serves (add only, optional)' },
          },
          required: ['op'],
        },
      },
    },
    required: ['ops'],
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run supabase/functions/symphony-agent/changeSet.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/symphony-agent/changeSet.ts supabase/functions/symphony-agent/changeSet.test.ts
git commit -m "Change card: server-side change-set validation"
```

---

### Task 2: Register the propose-changes tool in the agent

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts` (import at line 4; `TOOLS` at line 124; the "Doing versus suggesting" prompt block around lines 106–112; the tool-dispatch branch next to `PROPOSE_TOOL.name` around line 1529)
- Modify: `supabase/functions/symphony-agent/canvasEvents.ts` (no change to `CANVAS_WRITE_TOOLS`. The new tool is NOT a write tool; confirm it isn't added there.)
- Test: `supabase/functions/symphony-agent/changeSet.test.ts` (add the prompt guard test)

**Interfaces:**
- Consumes: `changeSetFromInput`, `resolveRefs`, `PROPOSE_CHANGES_TOOL` from Task 1.
- Produces: the SSE event `{ type: 'change_set', set: ChangeSet }`.

- [ ] **Step 1: Write the failing test** (append to `changeSet.test.ts`)

```ts
import { readFileSync } from 'node:fs'

describe('agent wiring', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('offers the tool and streams one change_set', () => {
    expect(src).toMatch(/PROPOSE_CHANGES_TOOL,/)
    expect(src).toMatch(/send\(\{ type: 'change_set', set: resolved\.set \}\)/)
  })
  it('tells the model to propose, not write, when several items change', () => {
    expect(src).toContain('MORE THAN ONE task')
    expect(src).toContain('symphony_propose_changes')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/symphony-agent/changeSet.test.ts -t "agent wiring"`
Expected: FAIL (`PROPOSE_CHANGES_TOOL,` not found)

- [ ] **Step 3: Wire it**

At the import on line 4, add:

```ts
import { PROPOSE_CHANGES_TOOL, changeSetFromInput, resolveRefs } from './changeSet.ts'
```

In `const TOOLS = [`, add a line directly after `PROPOSE_TOOL,`:

```ts
  PROPOSE_CHANGES_TOOL,
```

In the "Doing versus suggesting:" prompt block, add these lines as the FIRST bullets under that heading:

```
- When a request changes MORE THAN ONE task (move these three, plan the rest of my week, sort my inbox), do not write: read what you need, then call symphony_propose_changes ONCE with the whole list. The person sees one change card and approves it with one tap. If they ask for a change to the list, call it again with the full revised list.
- A change to ONE task is still done directly with the write tools, as below.
- symphony_propose_changes has no delete. To drop something, use someday.
```

In the dispatch chain, add a branch immediately BEFORE `} else if (block.name === PROPOSE_TOOL.name) {`:

```ts
              } else if (block.name === PROPOSE_CHANGES_TOOL.name) {
                // A change card: validated and resolved through the person's own
                // RLS-scoped reads, streamed to the page, never written here.
                const parsed = changeSetFromInput(block.input ?? {}, String(block.id ?? crypto.randomUUID()))
                if ('error' in parsed) result = JSON.stringify({ error: parsed.error })
                else {
                  const taskIds = [...new Set(parsed.set.ops.flatMap((o) => o.taskId ? [o.taskId] : []))]
                  const memberIds = [...new Set(parsed.set.ops.flatMap((o) => o.assignee ? [o.assignee] : []))]
                  const { data: taskRows, error: taskErr } = taskIds.length
                    ? await db.from('tasks').select('id, title, updated_at, completed').in('id', taskIds)
                    : { data: [], error: null }
                  const { data: memberRows, error: memberErr } = memberIds.length
                    ? await db.from('family_members').select('id, name').in('id', memberIds)
                    : { data: [], error: null }
                  const resolved = taskErr || memberErr
                    ? { error: 'Could not read the tasks to check this list. Try again.' }
                    : resolveRefs(parsed.set, taskRows ?? [], memberRows ?? [])
                  if ('error' in resolved) result = JSON.stringify({ error: resolved.error })
                  else {
                    send({ type: 'change_set', set: resolved.set })
                    result = JSON.stringify({ shown: resolved.set.ops.length, saved: false, note: 'Shown as a change card. Nothing is saved until the person approves. Reply in one short sentence; do not repeat the list.' })
                  }
                }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run supabase/functions/symphony-agent/`
Expected: PASS (all agent unit files)

- [ ] **Step 5: Type-check the function**

Run: `deno check supabase/functions/symphony-agent/index.ts`
Expected: no errors. If `deno` isn't installed, run `npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck supabase/functions/symphony-agent/changeSet.ts` and note in the PR that the full Deno check was skipped.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/symphony-agent/index.ts supabase/functions/symphony-agent/changeSet.test.ts
git commit -m "Agent: symphony_propose_changes streams one change card; several items are proposed, not written"
```

---

### Task 3: The client receives change sets

**Files:**
- Create: `src/lib/canvas/changeCard.ts` (types only in this task)
- Modify: `src/lib/agentStream.ts` (`AgentStreamEvent` union at line 23; `StreamHandlers` around line 96; the event loop around line 190)
- Modify: `src/hooks/useSymphonyAssistant.ts` (`AssistantTurnObserver` at line 32; the handlers object around line 232)
- Test: `src/lib/agentStream.test.ts`

**Interfaces:**
- Produces (`src/lib/canvas/changeCard.ts`):

```ts
export type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'
export interface ChangeOp { key: string; op: ChangeOpKind; taskId?: string; title: string; date?: string; time?: string; assignee?: string; assigneeName?: string; goalId?: string; seen?: string }
export interface ChangeSet { key: string; title: string; ops: ChangeOp[] }
```

- Produces: `StreamHandlers.onChangeSet?: (set: ChangeSet) => void` and `AssistantTurnObserver.changeSet?: (set: ChangeSet) => void`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/agentStream.test.ts`)

```ts
  it('passes a change_set event through intact', () => {
    const set = { key: 'tu1', title: '2 changes', ops: [{ key: 'tu1:0', op: 'someday', taskId: 'a', title: 'Paper mail' }] }
    const { events } = parseSSEChunk(`data: ${JSON.stringify({ type: 'change_set', set })}\n\n`)
    expect(events).toEqual([{ type: 'change_set', set }])
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/agentStream.test.ts`
Expected: FAIL on the type check only if `parseSSEChunk` filters by known types. If it passes already (the parser is type-agnostic), that's fine: continue, because Step 3 adds the typed handler that the build depends on.

- [ ] **Step 3: Implement**

Create `src/lib/canvas/changeCard.ts` with the header comment and the three types above:

```ts
// src/lib/canvas/changeCard.ts
//
// The change card (spec 2026-10-14): one list of changes Symphony proposes,
// previewed dashed on the page, applied on one Approve with one Undo. These
// types mirror supabase/functions/symphony-agent/changeSet.ts.

export type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'

export interface ChangeOp {
  key: string
  op: ChangeOpKind
  taskId?: string
  title: string
  /** YYYY-MM-DD */
  date?: string
  /** HH:MM, 24-hour */
  time?: string
  assignee?: string
  assigneeName?: string
  goalId?: string
  /** The task's updated_at when Symphony read it. */
  seen?: string
}

export interface ChangeSet { key: string; title: string; ops: ChangeOp[] }
```

In `src/lib/agentStream.ts`:
- `import type { ChangeSet } from '@/lib/canvas/changeCard'`
- add `| { type: 'change_set'; set: ChangeSet }` to `AgentStreamEvent`
- add `onChangeSet?: (set: ChangeSet) => void` to `StreamHandlers`, next to `onProposal`
- in the loop, after the `proposal` line: `else if (ev.type === 'change_set') { if (ev.set && Array.isArray(ev.set.ops)) handlers.onChangeSet?.(ev.set) }`

In `src/hooks/useSymphonyAssistant.ts`:
- `import type { ChangeSet } from '@/lib/canvas/changeCard'`
- add `changeSet?: (set: ChangeSet) => void` to `AssistantTurnObserver`
- next to `onProposal: (items) => turnObserver?.proposal?.(items),` add `onChangeSet: (set) => turnObserver?.changeSet?.(set),`

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/lib/agentStream.test.ts src/hooks/useSymphonyAssistant.test.ts && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/changeCard.ts src/lib/agentStream.ts src/lib/agentStream.test.ts src/hooks/useSymphonyAssistant.ts
git commit -m "Change card: the client receives change_set events"
```

---

### Task 4: Card wording and the write for each op

**Files:**
- Modify: `src/lib/canvas/changeCard.ts`
- Test: `src/lib/canvas/changeCard.test.ts`

**Interfaces:**
- Consumes: `lineDropUpdates` (`src/lib/planning/v2/planV2.ts:183`), `timingRemoval` (`src/lib/planning/planActions.ts:84`), `localYmd` (`src/lib/cadence/config`).
- Produces:
  - `opRow(op: ChangeOp, today: Date): { kind: 'MOVE' | 'ADD' | 'LATER' | 'WHO'; title: string; where: string }`
  - `opWrite(op: ChangeOp, task: Task): { updates: Partial<Task>; previous: Partial<Task> }` (task ops only)
  - `opWhen(op: ChangeOp): Date | undefined`, the local Date for `date` + `time`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/changeCard.test.ts
import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { opRow, opWhen, opWrite, type ChangeOp } from './changeCard'

const today = new Date(2026, 9, 14, 8, 0) // Wed Oct 14
const op = (x: Partial<ChangeOp>): ChangeOp => ({ key: 'k', op: 'place', title: 'Reply to Christian', ...x })
const task = (x: Partial<Task>) => ({ id: 'a', title: 'T', completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 9, 14), ...x }) as Task

describe('opRow', () => {
  it('says where each change lands, in the card’s words', () => {
    expect(opRow(op({ date: '2026-10-14', time: '09:00' }), today)).toEqual({ kind: 'MOVE', title: 'Reply to Christian', where: '→ Today 9:00' })
    expect(opRow(op({ date: '2026-10-15', time: '13:30' }), today).where).toBe('→ Thu 1:30')
    expect(opRow(op({ date: '2026-10-16' }), today).where).toBe('→ Fri')
    expect(opRow(op({ op: 'unplace' }), today)).toMatchObject({ kind: 'MOVE', where: '→ No day yet' })
    expect(opRow(op({ op: 'add', title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' }), today)).toEqual({ kind: 'ADD', title: 'Hold for WSWMD', where: 'Today 1:00' })
    expect(opRow(op({ op: 'add', title: 'Call the bank' }), today).where).toBe('No day yet')
    expect(opRow(op({ op: 'someday' }), today)).toMatchObject({ kind: 'LATER', where: '→ Someday' })
    expect(opRow(op({ op: 'assign', assigneeName: 'Ella' }), today)).toMatchObject({ kind: 'WHO', where: '→ Ella' })
  })
})

describe('opWhen', () => {
  it('is local time, midnight without a time', () => {
    expect(opWhen(op({ date: '2026-10-15', time: '09:30' }))).toEqual(new Date(2026, 9, 15, 9, 30))
    expect(opWhen(op({ date: '2026-10-15' }))).toEqual(new Date(2026, 9, 15))
    expect(opWhen(op({ op: 'someday' }))).toBeUndefined()
  })
})

describe('opWrite', () => {
  it('a timed place is a timed task; a day place is the Week drop write', () => {
    const t = task({ bucket: 'week', scheduledFor: undefined })
    expect(opWrite(op({ date: '2026-10-15', time: '09:00' }), t).updates).toEqual({ scheduledFor: new Date(2026, 9, 15, 9, 0), isAllDay: false, bucket: 'timed' })
    expect(opWrite(op({ date: '2026-10-15' }), t).updates).toEqual({ isAllDay: true, scheduledFor: new Date(2026, 9, 15), bucket: 'timed' })
  })
  it('previous holds exactly what the write changes, so Undo restores it', () => {
    const t = task({ bucket: 'week', scheduledFor: undefined, isAllDay: undefined })
    expect(opWrite(op({ date: '2026-10-15' }), t).previous).toEqual({ isAllDay: undefined, scheduledFor: undefined, bucket: 'week' })
  })
  it('someday and assign', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 9, 14), isAllDay: true, assignedTo: 'm1', assignedToAll: ['m1'] })
    expect(opWrite(op({ op: 'someday' }), t).updates).toEqual({ bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    expect(opWrite(op({ op: 'assign', assignee: 'm2' }), t)).toEqual({ updates: { assignedTo: 'm2', assignedToAll: ['m2'] }, previous: { assignedTo: 'm1', assignedToAll: ['m1'] } })
  })
  it('unplace uses the planner’s own removal and its previous', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 9, 14), isAllDay: true })
    const w = opWrite(op({ op: 'unplace' }), t)
    expect(w.updates.scheduledFor).toBeUndefined()
    expect(w.previous.scheduledFor).toEqual(new Date(2026, 9, 14))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/canvas/changeCard.test.ts`
Expected: FAIL, `opRow` is not exported.

- [ ] **Step 3: Implement** (append to `src/lib/canvas/changeCard.ts`)

```ts
import type { Task } from '@/types/task'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { timingRemoval } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'

/** The local moment an op names: its date at its time, or at midnight. */
export function opWhen(op: ChangeOp): Date | undefined {
  if (!op.date) return undefined
  const [y, m, d] = op.date.split('-').map(Number)
  const [h, min] = op.time ? op.time.split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, h, min)
}

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}`
}

function dayWords(op: ChangeOp, today: Date): string {
  const when = opWhen(op)!
  const day = localYmd(when) === localYmd(today) ? 'Today' : when.toLocaleDateString('en-US', { weekday: 'short' })
  return op.time ? `${day} ${clock(op.time)}` : day
}

/** One card row: what kind of change, to what, and where it lands. */
export function opRow(op: ChangeOp, today: Date): { kind: 'MOVE' | 'ADD' | 'LATER' | 'WHO'; title: string; where: string } {
  switch (op.op) {
    case 'place': return { kind: 'MOVE', title: op.title, where: `→ ${dayWords(op, today)}` }
    case 'unplace': return { kind: 'MOVE', title: op.title, where: '→ No day yet' }
    case 'add': return { kind: 'ADD', title: op.title, where: op.date ? dayWords(op, today) : 'No day yet' }
    case 'someday': return { kind: 'LATER', title: op.title, where: '→ Someday' }
    case 'assign': return { kind: 'WHO', title: op.title, where: `→ ${op.assigneeName ?? 'someone'}` }
  }
}

/** The write for a task op, and what it changes, for Undo. The same writes
 *  Week's own gestures send (drop on a day, back to still to place, Someday). */
export function opWrite(op: ChangeOp, task: Task): { updates: Partial<Task>; previous: Partial<Task> } {
  const before = (updates: Partial<Task>) => ({
    updates,
    previous: Object.fromEntries(Object.keys(updates).map((k) => [k, task[k as keyof Task]])) as Partial<Task>,
  })
  switch (op.op) {
    case 'place': {
      const when = opWhen(op)!
      return before(op.time
        ? { scheduledFor: when, isAllDay: false, bucket: 'timed' }
        : lineDropUpdates(task, { kind: 'day', at: when }))
    }
    case 'unplace': return timingRemoval(task, 'day')
    case 'someday': return before({ bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    case 'assign': return before({ assignedTo: op.assignee, assignedToAll: op.assignee ? [op.assignee] : [] })
    case 'add': throw new Error('add has no existing task to write')
  }
}
```

Move the three `import` lines to the top of the file, under the header comment.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/canvas/changeCard.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/changeCard.ts src/lib/canvas/changeCard.test.ts
git commit -m "Change card: card wording and the write for each op"
```

---

### Task 5: Apply a set all-or-nothing, with one Undo

**Files:**
- Create: `src/lib/canvas/applyChangeSet.ts`
- Test: `src/lib/canvas/applyChangeSet.test.ts`

**Interfaces:**
- Consumes: `ChangeSet`, `opWrite`, `opWhen` (Task 4).
- Produces:

```ts
export interface ApplyDeps {
  tasks: Task[]
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean | void>
  addTask: (title: string, scheduledFor: Date | undefined, options: { isAllDay?: boolean; bucket?: TaskBucket; weekStart?: Date; assignedTo?: string; assignedToAll?: string[]; sourceId?: string }) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
  /** This week's start, for an add with no day. */
  weekStart: Date
}
export type ApplyResult =
  | { ok: true; ids: string[]; undo: () => Promise<boolean> }
  | { ok: false; reason: 'stale'; title: string }
  | { ok: false; reason: 'failed' }
export function applyChangeSet(set: ChangeSet, deps: ApplyDeps): Promise<ApplyResult>
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/applyChangeSet.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/types/task'
import { applyChangeSet, type ApplyDeps } from './applyChangeSet'
import type { ChangeSet } from './changeCard'

const seen = '2026-10-14T07:00:00.123456+00:00'
const task = (id: string, x: Partial<Task> = {}) => ({ id, title: id, completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(Date.parse(seen)), bucket: 'week', ...x }) as Task
const set: ChangeSet = { key: 's', title: '3 changes', ops: [
  { key: 's:0', op: 'place', taskId: 'a', title: 'a', date: '2026-10-15', seen },
  { key: 's:1', op: 'someday', taskId: 'b', title: 'b', seen },
  { key: 's:2', op: 'add', title: 'Hold', date: '2026-10-14', time: '13:00' },
] }
const deps = (over: Partial<ApplyDeps> = {}): ApplyDeps => ({
  tasks: [task('a'), task('b')],
  updateTask: vi.fn(async () => true),
  addTask: vi.fn(async () => 'new1'),
  deleteTask: vi.fn(async () => {}),
  weekStart: new Date(2026, 9, 10),
  ...over,
})

describe('applyChangeSet', () => {
  it('applies every op in order and returns their ids', async () => {
    const d = deps()
    const r = await applyChangeSet(set, d)
    expect(r).toMatchObject({ ok: true, ids: ['a', 'b', 'new1'] })
    expect(d.updateTask).toHaveBeenNthCalledWith(1, 'a', { isAllDay: true, scheduledFor: new Date(2026, 9, 15), bucket: 'timed' })
    expect(d.updateTask).toHaveBeenNthCalledWith(2, 'b', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    expect(d.addTask).toHaveBeenCalledWith('Hold', new Date(2026, 9, 14, 13, 0), { isAllDay: false, bucket: 'timed' })
  })

  it('Undo reverses everything, newest first', async () => {
    const d = deps()
    const r = await applyChangeSet(set, d)
    if (!r.ok) throw new Error('expected ok')
    vi.mocked(d.updateTask).mockClear()
    expect(await r.undo()).toBe(true)
    expect(d.deleteTask).toHaveBeenCalledWith('new1')
    expect(vi.mocked(d.updateTask).mock.calls.map((c) => c[0])).toEqual(['b', 'a'])
    expect(d.updateTask).toHaveBeenCalledWith('b', { bucket: 'week', scheduledFor: undefined, isAllDay: undefined })
  })

  it('refuses the whole set, writing nothing, when a task moved since Symphony read it', async () => {
    const d = deps({ tasks: [task('a', { updatedAt: new Date(Date.parse(seen) + 60_000) }), task('b')] })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'stale', title: 'a' })
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('treats a task that has gone as stale', async () => {
    const d = deps({ tasks: [task('b')] })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'stale', title: 'a' })
  })

  it('a failure part way reverses what already saved', async () => {
    const updateTask = vi.fn(async (id: string) => id !== 'b')
    const d = deps({ updateTask })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed' })
    // a saved, b failed, so a is put back; the add never ran.
    expect(updateTask.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a'])
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('a thrown write is a failure too', async () => {
    const d = deps({ addTask: vi.fn(async () => { throw new Error('offline') }) })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed' })
    expect(vi.mocked(d.updateTask).mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'b', 'a'])
  })

  it('an add with no day lands on this week', async () => {
    const d = deps()
    await applyChangeSet({ key: 'x', title: '1 change', ops: [{ key: 'x:0', op: 'add', title: 'Call the bank', assignee: 'm1' }] }, d)
    expect(d.addTask).toHaveBeenCalledWith('Call the bank', undefined, { bucket: 'week', weekStart: new Date(2026, 9, 10), assignedTo: 'm1', assignedToAll: ['m1'] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/canvas/applyChangeSet.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/canvas/applyChangeSet.ts
//
// Approve on the change card: every op through the app's own task writers
// (so placement and privacy rules are the ones every gesture uses), in order.
// All or nothing: a set made from a state that has since changed is refused
// before anything is written, and a failure part way puts back what already
// saved. One Undo reverses the lot, newest first.

import type { Task, TaskBucket } from '@/types/task'
import { opWhen, opWrite, type ChangeSet } from './changeCard'

export interface ApplyDeps {
  tasks: Task[]
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean | void>
  addTask: (title: string, scheduledFor: Date | undefined, options: { isAllDay?: boolean; bucket?: TaskBucket; weekStart?: Date; assignedTo?: string; assignedToAll?: string[]; sourceId?: string }) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
  weekStart: Date
}

export type ApplyResult =
  | { ok: true; ids: string[]; undo: () => Promise<boolean> }
  | { ok: false; reason: 'stale'; title: string }
  | { ok: false; reason: 'failed' }

/** Postgres keeps microseconds; the client's Date keeps milliseconds. */
const movedSince = (task: Task, seen: string) => task.updatedAt.getTime() > Math.floor(Date.parse(seen)) + 1

export async function applyChangeSet(set: ChangeSet, deps: ApplyDeps): Promise<ApplyResult> {
  const byId = new Map(deps.tasks.map((t) => [t.id, t]))
  for (const op of set.ops) {
    if (!op.taskId) continue
    const t = byId.get(op.taskId)
    if (!t || (op.seen && movedSince(t, op.seen))) return { ok: false, reason: 'stale', title: op.title }
  }

  const undos: Array<() => Promise<unknown>> = []
  const ids: string[] = []
  const rollback = async () => {
    for (const u of [...undos].reverse()) { try { await u() } catch { /* best effort: keep reversing the rest */ } }
  }
  try {
    for (const op of set.ops) {
      if (op.op === 'add') {
        const when = opWhen(op)
        const who = op.assignee ? { assignedTo: op.assignee, assignedToAll: [op.assignee] } : {}
        const options = when
          ? { isAllDay: !op.time, bucket: 'timed' as const, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
          : { bucket: 'week' as const, weekStart: deps.weekStart, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
        const id = await deps.addTask(op.title, when, options)
        if (!id) { await rollback(); return { ok: false, reason: 'failed' } }
        ids.push(id)
        undos.push(() => deps.deleteTask(id))
        continue
      }
      const task = byId.get(op.taskId!)!
      const { updates, previous } = opWrite(op, task)
      const saved = await deps.updateTask(task.id, updates)
      if (saved === false) { await rollback(); return { ok: false, reason: 'failed' } }
      ids.push(task.id)
      undos.push(() => deps.updateTask(task.id, previous))
    }
  } catch {
    await rollback()
    return { ok: false, reason: 'failed' }
  }

  return {
    ok: true, ids,
    undo: async () => {
      let ok = true
      for (const u of [...undos].reverse()) { try { if ((await u()) === false) ok = false } catch { ok = false } }
      return ok
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/canvas/applyChangeSet.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/applyChangeSet.ts src/lib/canvas/applyChangeSet.test.ts
git commit -m "Change card: apply all-or-nothing with one Undo"
```

---

### Task 6: Hold the pending set in CanvasActivityContext

**Files:**
- Modify: `src/contexts/CanvasActivityContext.tsx`
- Test: `src/contexts/CanvasActivityContext.test.tsx`

**Interfaces:**
- Consumes: `ChangeSet` (Task 3), `ApplyResult` (Task 5).
- Produces, on `CanvasActivity`:

```ts
changeSet: PendingChangeSet | null
setChangeSet: (set: ChangeSet) => void
dismissChangeSet: () => void
approveChangeSet: () => Promise<boolean>
```

with `export interface PendingChangeSet extends ChangeSet { state: 'proposed' | 'saving' | 'failed'; message?: string; replaced?: boolean }`. A new provider prop: `applyChanges?: (set: ChangeSet) => Promise<ApplyResult>`.

- [ ] **Step 1: Write the failing test** (append to the existing test file; reuse its render-helper pattern. Read the top of `CanvasActivityContext.test.tsx` first and mirror how it mounts the provider and reads `useCanvasActivity()`.)

```tsx
describe('change sets', () => {
  const set = (key: string) => ({ key, title: '2 changes', ops: [
    { key: `${key}:0`, op: 'someday' as const, taskId: 'a', title: 'Paper mail' },
    { key: `${key}:1`, op: 'unplace' as const, taskId: 'b', title: 'Call the bank' },
  ] })

  it('holds one set; a newer one replaces it and says so', () => {
    const { activity } = mountActivity({})
    act(() => activity().setChangeSet(set('s1')))
    act(() => activity().setChangeSet(set('s2')))
    expect(activity().changeSet).toMatchObject({ key: 's2', state: 'proposed', replaced: true })
  })

  it('Approve applies once, clears the card and offers one Undo', async () => {
    const undo = vi.fn(async () => true)
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a', 'b'], undo }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(activity().changeSet).toBeNull()
    expect(activity().receipt).toMatchObject({ state: 'saved', request: '2 changes', undoable: true })
    await act(async () => { await activity().undo() })
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('a stale set stays on the card with the reason, and nothing is undoable', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'stale' as const, title: 'Paper mail' }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'failed', message: '“Paper mail” changed since I proposed this. Ask me for a fresh list.' })
    expect(activity().receipt?.undoable).toBe(false)
  })

  it('a failed apply says nothing changed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'failed' as const }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'failed', message: "Couldn't save. Nothing was changed. Try again." })
  })

  it('Undo is gone once the receipt is dismissed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a'], undo: vi.fn(async () => true) }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    act(() => activity().dismiss())
    expect(activity().receipt).toBeNull()
  })
})
```

If the file has no `mountActivity` helper, add one at the top of this `describe`:

```tsx
function mountActivity(extra: { applyChanges?: CanvasActivityProviderProps['applyChanges'] }) {
  let latest: CanvasActivity | null = null
  const Probe = () => { latest = useCanvasActivity(); return null }
  render(<CanvasActivityProvider snapshot={{ tasks: [], goals: [], routines: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={vi.fn()} {...extra}><Probe /></CanvasActivityProvider>)
  return { activity: () => latest! }
}
```

Check `Snapshot`'s actual shape in `src/lib/canvas/changeSet.ts` and match it. Export `ProviderProps` as `CanvasActivityProviderProps`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/contexts/CanvasActivityContext.test.tsx -t "change sets"`
Expected: FAIL, `setChangeSet` is not a function.

- [ ] **Step 3: Implement** in `src/contexts/CanvasActivityContext.tsx`

Add the imports:

```ts
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { ApplyResult } from '@/lib/canvas/applyChangeSet'
```

Add the type and extend the interface:

```ts
export interface PendingChangeSet extends ChangeSet {
  state: 'proposed' | 'saving' | 'failed'
  message?: string
  /** A newer proposal took the place of one still waiting. */
  replaced?: boolean
}
```

On `CanvasActivity`, add the four members listed under Interfaces. Rename `interface ProviderProps` to `export interface CanvasActivityProviderProps` (update its one use) and add:

```ts
  /** Approve on the change card (the shell wires the task writers). */
  applyChanges?: (set: ChangeSet) => Promise<ApplyResult>
```

In the provider, after the `proposals` callbacks:

```ts
  const [changeSet, setPending] = useState<PendingChangeSet | null>(null)
  const setChangeSet = useCallback((set: ChangeSet) => {
    setPending((prev) => ({ ...set, state: 'proposed', replaced: !!prev && prev.key !== set.key && prev.state !== 'saving' }))
  }, [])
  const dismissChangeSet = useCallback(() => setPending(null), [])
  const approveChangeSet = useCallback(async () => {
    const set = changeSet
    if (!set || set.state === 'saving' || !applyChanges) return false
    setPending({ ...set, state: 'saving', message: undefined })
    const opts: CommandOptions = { ids: [] }
    let failure: string | null = null
    const ok = await run(set.title, async () => {
      const r = await applyChanges(set)
      if (!r.ok) {
        failure = r.reason === 'stale'
          ? `“${r.title}” changed since I proposed this. Ask me for a fresh list.`
          : "Couldn't save. Nothing was changed. Try again."
        return false
      }
      opts.ids = r.ids
      opts.undo = r.undo
      return true
    }, opts)
    setPending(ok ? null : { ...set, state: 'failed', message: failure ?? "Couldn't save. Nothing was changed. Try again." })
    return ok
  }, [changeSet, applyChanges, run])
```

`run` reads `options.ids` and `options.undo` after the command resolves, so filling `opts` inside the command works (WeekViewV2's `addAction` relies on the same thing). Add `applyChanges` to the destructured provider props, and add `changeSet, setChangeSet, dismissChangeSet, approveChangeSet` to the `useMemo` value and its dependency list. In `NOOP_ACTIVITY` add `changeSet: null, setChangeSet: () => {}, dismissChangeSet: () => {}, approveChangeSet: async () => false,`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/contexts/CanvasActivityContext.test.tsx && npx tsc -b`
Expected: PASS (existing + 5 new), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/CanvasActivityContext.tsx src/contexts/CanvasActivityContext.test.tsx
git commit -m "Change card: the shell holds one pending set; Approve applies it with one Undo"
```

---

### Task 7: The ChangeCard in the conversation bar, wired in the shell

**Files:**
- Create: `src/components/canvas/ChangeCard.tsx`
- Test: `src/components/canvas/ChangeCard.test.tsx`
- Modify: `src/components/canvas/ConversationStrip.tsx` (render the card above the receipt)
- Modify: `src/shell/ShellLayout.tsx` (`turnObserver` around line 204; `useSupabaseTasks()` destructure at line 195; `<CanvasActivityProvider` at line 364)
- Modify: `src/index.css` (card styles, next to the existing `.canvas-proposals-line` rules)

**Interfaces:**
- Consumes: `useCanvasActivity().changeSet / approveChangeSet / dismissChangeSet` (Task 6), `opRow` (Task 4), `applyChangeSet` (Task 5).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/canvas/ChangeCard.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChangeCard } from './ChangeCard'
import type { PendingChangeSet } from '@/contexts/CanvasActivityContext'

const pending = (x: Partial<PendingChangeSet> = {}): PendingChangeSet => ({
  key: 's', title: '2 changes to your week', state: 'proposed', ops: [
    { key: 's:0', op: 'place', taskId: 'a', title: 'Reply to Christian', date: '2026-10-14', time: '09:00' },
    { key: 's:1', op: 'someday', taskId: 'b', title: 'Paper mail' },
  ], ...x,
})

describe('ChangeCard', () => {
  const today = new Date(2026, 9, 14, 8)
  it('lists every change with its kind and where it lands', () => {
    render(<ChangeCard set={pending()} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('region', { name: '2 changes to your week' })).toBeInTheDocument()
    expect(screen.getByText('Reply to Christian')).toBeInTheDocument()
    expect(screen.getByText('→ Today 9:00')).toBeInTheDocument()
    expect(screen.getByText('LATER')).toBeInTheDocument()
    expect(screen.getByText('Nothing is saved until you approve.')).toBeInTheDocument()
  })
  it('one Approve for all of them; Dismiss drops the card', () => {
    const onApprove = vi.fn(), onDismiss = vi.fn()
    render(<ChangeCard set={pending()} today={today} onApprove={onApprove} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve all 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it('while saving, Approve is disabled; a failure shows its reason', () => {
    const { rerender } = render(<ChangeCard set={pending({ state: 'saving' })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    rerender(<ChangeCard set={pending({ state: 'failed', message: "Couldn't save. Nothing was changed. Try again." })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Nothing was changed. Try again.")
  })
  it('says when it replaced an earlier list', () => {
    render(<ChangeCard set={pending({ replaced: true })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('This replaces the earlier list.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/canvas/ChangeCard.test.tsx`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/canvas/ChangeCard.tsx
//
// Symphony's proposal as one card (spec 2026-10-14; mockup frame "After 2"):
// every change in one list, one Approve, Undo afterwards in the receipt.
// Corrections are made by talking ("say what to change"), not per-row toggles.

import { X } from 'lucide-react'
import type { PendingChangeSet } from '@/contexts/CanvasActivityContext'
import { opRow } from '@/lib/canvas/changeCard'

interface Props {
  set: PendingChangeSet
  today: Date
  onApprove: () => void
  onDismiss: () => void
}

export function ChangeCard({ set, today, onApprove, onDismiss }: Props) {
  const saving = set.state === 'saving'
  const titleId = `change-card-${set.key}`
  return (
    <section className="change-card" role="region" aria-labelledby={titleId}>
      <header className="change-card-head">
        <h2 id={titleId} className="change-card-title">{set.title}</h2>
        <button type="button" className="canvas-icon" onClick={onDismiss} aria-label="Dismiss" disabled={saving}><X size={14} aria-hidden="true" /></button>
      </header>
      {set.replaced && <p className="change-card-note">This replaces the earlier list.</p>}
      <ul className="change-card-rows">
        {set.ops.map((op) => {
          const row = opRow(op, today)
          return (
            <li key={op.key} className="change-card-row">
              <span className="change-card-kind">{row.kind}</span>
              <span className="change-card-what">{row.title}</span>
              <span className="change-card-where">{row.where}</span>
            </li>
          )
        })}
      </ul>
      {set.state === 'failed' && set.message && <p className="change-card-error" role="alert">{set.message}</p>}
      <footer className="change-card-foot">
        <button type="button" className="change-card-approve" onClick={onApprove} disabled={saving}>
          {saving ? 'Saving…' : `Approve all ${set.ops.length}`}
        </button>
        <span className="change-card-note">Nothing is saved until you approve.</span>
        <span className="change-card-note">Or say what to change.</span>
      </footer>
    </section>
  )
}
```

- [ ] **Step 4: Render it in the bar**

In `ConversationStrip.tsx`:
- `import { ChangeCard } from './ChangeCard'`
- destructure `changeSet, approveChangeSet, dismissChangeSet` from `useCanvasActivity()`
- change the `receiptOnly` early-return guard to `if (receiptOnly && !shown && pending === 0 && !changeSet) return null`
- immediately after `{messages && <DockedTranscript … />}` render:

```tsx
      {changeSet && <ChangeCard set={changeSet} today={new Date()} onApprove={() => void approveChangeSet()} onDismiss={dismissChangeSet} />}
```

- [ ] **Step 5: Wire the shell**

In `ShellLayout.tsx`:
- `const { tasks, refetch, deleteTask, updateTask, addTask } = useSupabaseTasks();`
- in `turnObserver` add `changeSet: (set) => canvasRef.current?.setChangeSet(set),`
- add, near the other canvas callbacks:

```tsx
  const applyChanges = useCallback((set: ChangeSet) => applyChangeSet(set, {
    tasks, updateTask, deleteTask,
    addTask: (title, when, options) => addTask(title, undefined, undefined, when, options),
    weekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
  }), [tasks, updateTask, deleteTask, addTask]);
```

- imports: `import { applyChangeSet } from '@/lib/canvas/applyChangeSet'`, `import type { ChangeSet } from '@/lib/canvas/changeCard'`, `import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'` (skip any already imported)
- pass `applyChanges={applyChanges}` to `<CanvasActivityProvider …>`.

- [ ] **Step 6: Styles** (add to `src/index.css` beside `.canvas-proposals-line`)

```css
.change-card { margin: 0 0 10px; padding: 10px 16px 12px; border: 1.5px dashed #1b6a64; border-radius: 12px; background: #f6faf8; }
.change-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.change-card-title { margin: 0; font-family: 'Crimson Pro', serif; font-weight: 400; font-size: 20px; }
.change-card-rows { list-style: none; margin: 4px 0 0; padding: 0; max-height: 40vh; overflow-y: auto; }
.change-card-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid #e7ece9; font-size: 14px; }
.change-card-row:last-child { border-bottom: 0; }
.change-card-kind { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: #1b6a64; }
.change-card-where { font-size: 13px; color: #4a4f4d; white-space: nowrap; }
.change-card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 10px; }
.change-card-approve { font: inherit; font-size: 15px; font-weight: 600; min-height: 44px; padding: 0 20px; border: 0; border-radius: 9px; background: #1b6a64; color: #fff; }
.change-card-approve:disabled { opacity: .6; }
.change-card-note { font-size: 13px; color: #4a4f4d; }
.change-card-error { margin: 8px 0 0; font-size: 13px; color: #9b3412; }
.dark .change-card { background: #182b29; border-color: #6cc4b9; }
.dark .change-card-kind { color: #6cc4b9; }
.dark .change-card-approve { background: #6cc4b9; color: #0e1b1a; }
.dark .change-card-where, .dark .change-card-note { color: #a5aca9; }
```

- [ ] **Step 7: Run the tests, lint and build**

Run: `npx vitest run src/components/canvas/ src/contexts/ src/lib/canvas/ && npm run lint && npm run build`
Expected: all PASS, lint clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/ChangeCard.tsx src/components/canvas/ChangeCard.test.tsx src/components/canvas/ConversationStrip.tsx src/shell/ShellLayout.tsx src/index.css
git commit -m "Change card: one card in the conversation bar, Approve all, Undo after"
```

---

### Task 8: PR 1 verification and pull request

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `npm test -- --run && npm run lint && npm run build`
Expected: green. If an unrelated suite fails (for example a connector whose dependency isn't installed), record its name and the error in the PR body, and don't fix it here.

- [ ] **Step 2: Know what is and isn't proven.** The unit tests prove the server validation, the card, apply/rollback/Undo, and the context. The end-to-end path (a live agent turn producing a card) can only be checked after `symphony-agent` is deployed, which needs Scott's OK, so say exactly that in the PR body. Do not deploy the function to production to test it.

- [ ] **Step 3: Rebase and push the branch, open a draft PR**

```bash
git fetch origin && git rebase origin/main
npm test -- --run && npm run build
git push -u origin claude/v2-talk-first
gh pr create --draft --title "Change card: Symphony proposes several changes as one card, Approve all, one Undo" --body "$(cat <<'EOF'
Spec: docs/superpowers/specs/2026-10-14-symphony-v2-talk-first-design.md · Mockup: https://claude.ai/artifact/WC78LdmFCEAh8hA8ooMw24

- New agent tool `symphony_propose_changes` (no writes): place / unplace / add / someday / assign, at most 40, no delete. Several items are proposed, one item is still written directly.
- The card sits in the conversation bar: every change, Approve all N, Undo in the receipt. Approve uses the app's own task writers; a stale set is refused before writing, a failure part way puts back what saved.
- Week is unchanged in this PR.

Not done here: deploying `symphony-agent` (needs Scott's OK), the Week preview (PR 2).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01J7XfMqh7HNxdRWJVGPcD8h
EOF
)"
```

- [ ] **Step 4: Ask Scott** to approve deploying `symphony-agent` and merging. After both: in the live app, on Week, type "move Paper mail and Confirm VW Credit statement to Friday". Expected: one card with 2 MOVE rows, then Approve, both on Friday, then Undo, both back.

---

# PR 2: Week as the picture

Start PR 2 on a new branch from the merged main: `git fetch origin && git switch -c claude/v2-week-picture origin/main` inside this worktree (after PR 1 merges), or stack it on `claude/v2-talk-first` if PR 1 is still open, and say so in the PR.

### Task 9: `symphony_read_week`, the whole week in one read

**Files:**
- Create: `supabase/functions/symphony-agent/readWeek.ts`
- Test: `supabase/functions/symphony-agent/readWeek.test.ts`
- Modify: `supabase/functions/symphony-agent/index.ts` (`TOOLS`; `runTool` switch; the prompt)

**Interfaces:**
- Produces:
  - `local(iso: string): { date: string; time: string }`, the household-local (APP_TZ, America/New_York) date and HH:MM of a stored timestamp
  - `weekWindow(start: string): { start: string; end: string; lastStart: string }` (YYYY-MM-DD; `end` exclusive = start + 7; `lastStart` = start − 7)
  - `shapeWeek(input: { start: string; today: string; tasks: TaskRow[]; events: EventRow[]; routines: RoutineRow[]; talks: { id: string; body: string }[] }): WeekRead`
  - `READ_WEEK_TOOL`
  - with `TaskRow = { id: string; title: string; scheduled_for: string | null; is_all_day: boolean | null; bucket: string | null; week_start: string | null; completed: boolean; assigned_to: string | null; updated_at: string }`, `EventRow = { id: string; title: string; start_time: string; end_time: string; all_day: boolean | null }`, `RoutineRow = { id: string; name: string; recurrence_pattern: unknown; time_of_day: string | null; parent_routine_id: string | null }`
  - `WeekRead = { start: string; today: string; days: { date: string; events: { id: string; title: string; time: string | null }[]; tasks: { id: string; title: string; time: string | null; done: boolean; seen: string }[] }[]; noDay: { id: string; title: string; seen: string }[]; lastWeekUnfinished: { id: string; title: string; was: string; seen: string }[]; inbox: { id: string; title: string; seen: string }[]; routines: { id: string; name: string; time: string | null; pattern: unknown }[]; talkAbouts: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/symphony-agent/readWeek.test.ts
import { describe, expect, it } from 'vitest'
import { shapeWeek, weekWindow } from './readWeek'

const t = (x: Record<string, unknown>) => ({ id: 'x', title: 'X', scheduled_for: null, is_all_day: null, bucket: 'inbox', week_start: null, completed: false, assigned_to: null, updated_at: 'u', ...x })

describe('weekWindow', () => {
  it('a Saturday week runs seven days; last week is the seven before', () => {
    expect(weekWindow('2026-10-10')).toEqual({ start: '2026-10-10', end: '2026-10-17', lastStart: '2026-10-03' })
  })
})

describe('shapeWeek', () => {
  const read = shapeWeek({
    start: '2026-10-10', today: '2026-10-14',
    tasks: [
      t({ id: 'a', title: 'Reply to Christian', scheduled_for: '2026-10-14T04:00:00+00:00', is_all_day: true, bucket: 'timed' }),
      t({ id: 'b', title: 'Submit AF&PA', bucket: 'week', week_start: '2026-10-10' }),
      t({ id: 'c', title: 'Pull PPVIS numbers', scheduled_for: '2026-10-08T04:00:00+00:00', is_all_day: true, bucket: 'timed' }),
      t({ id: 'd', title: 'Washing machine', bucket: 'inbox' }),
      t({ id: 'e', title: 'Old done', scheduled_for: '2026-10-07T04:00:00+00:00', bucket: 'timed', completed: true }),
      t({ id: 'f', title: 'Boxing prep', scheduled_for: '2026-10-13T13:00:00+00:00', is_all_day: false, bucket: 'timed' }),
      t({ id: 'g', title: 'Late call', scheduled_for: '2026-10-15T01:30:00+00:00', is_all_day: false, bucket: 'timed' }),
    ],
    events: [{ id: 'ev', title: 'CEPI food-contact meeting', start_time: '2026-10-14T00:00:00+00:00', end_time: '2026-10-15T00:00:00+00:00', all_day: true }],
    routines: [{ id: 'r', name: 'Out the door', recurrence_pattern: { days: ['mon'] }, time_of_day: '07:20:00', parent_routine_id: null }],
    talks: [{ id: 's', body: 'Summer camp' }],
  })
  it('lays the week out by day, with times', () => {
    expect(read.days).toHaveLength(7)
    const wed = read.days.find((d) => d.date === '2026-10-14')!
    expect(wed.events).toEqual([{ id: 'ev', title: 'CEPI food-contact meeting', time: null }])
    expect(wed.tasks[0]).toEqual({ id: 'a', title: 'Reply to Christian', time: null, done: false, seen: 'u' })
    expect(read.days.find((d) => d.date === '2026-10-13')!.tasks[0].time).toBe('09:00')
  })
  it('a late-evening task stays on its local day', () => {
    const wed = read.days.find((d) => d.date === '2026-10-14')!
    expect(wed.tasks.map((x) => [x.id, x.time])).toContainEqual(['g', '21:30'])
  })
  it('names what has no day, what last week left, the inbox, routines and talk-abouts', () => {
    expect(read.noDay.map((x) => x.id)).toEqual(['b'])
    expect(read.lastWeekUnfinished).toEqual([{ id: 'c', title: 'Pull PPVIS numbers', was: '2026-10-08', seen: 'u' }])
    expect(read.inbox.map((x) => x.id)).toEqual(['d'])
    expect(read.routines).toEqual([{ id: 'r', name: 'Out the door', time: '07:20', pattern: { days: ['mon'] } }])
    expect(read.talkAbouts).toEqual(['Summer camp'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/symphony-agent/readWeek.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/symphony-agent/readWeek.ts
//
// The planning loop's first step (spec 2026-10-14): Symphony reads the whole
// week before it says or asks anything. One call, shaped for the model.
//
// Times are stored as UTC timestamps; days and clock times here are the
// household's (APP_TZ), or a late-evening task lands on the wrong day.

import { APP_TZ } from './schedule.ts'

export type TaskRow = { id: string; title: string; scheduled_for: string | null; is_all_day: boolean | null; bucket: string | null; week_start: string | null; completed: boolean; assigned_to: string | null; updated_at: string }
export type EventRow = { id: string; title: string; start_time: string; end_time: string; all_day: boolean | null }
export type RoutineRow = { id: string; name: string; recurrence_pattern: unknown; time_of_day: string | null; parent_routine_id: string | null }

export interface WeekRead {
  start: string
  today: string
  days: { date: string; events: { id: string; title: string; time: string | null }[]; tasks: { id: string; title: string; time: string | null; done: boolean; seen: string }[] }[]
  noDay: { id: string; title: string; seen: string }[]
  lastWeekUnfinished: { id: string; title: string; was: string; seen: string }[]
  inbox: { id: string; title: string; seen: string }[]
  routines: { id: string; name: string; time: string | null; pattern: unknown }[]
  talkAbouts: string[]
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekWindow(start: string) {
  return { start, end: addDays(start, 7), lastStart: addDays(start, -7) }
}

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** The household's local date and HH:MM for a stored timestamp. */
export function local(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
const ymd = (iso: string | null) => (iso ? local(iso).date : null)
const hhmm = (iso: string, allDay: boolean | null) => (allDay ? null : local(iso).time)
/** An all-day calendar event's dates are calendar dates, not instants. */
const eventDay = (iso: string, allDay: boolean | null) => (allDay ? iso.slice(0, 10) : local(iso).date)

export function shapeWeek(input: { start: string; today: string; tasks: TaskRow[]; events: EventRow[]; routines: RoutineRow[]; talks: { id: string; body: string }[] }): WeekRead {
  const { start, today } = input
  const { lastStart } = weekWindow(start)
  const open = input.tasks.filter((t) => !t.completed)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      events: input.events.filter((e) => { const s = eventDay(e.start_time, e.all_day), en = eventDay(e.end_time, e.all_day); return s <= date && (en > date || s === date) })
        .map((e) => ({ id: e.id, title: e.title, time: hhmm(e.start_time, e.all_day) })),
      tasks: input.tasks.filter((t) => ymd(t.scheduled_for) === date)
        .map((t) => ({ id: t.id, title: t.title, time: t.scheduled_for ? hhmm(t.scheduled_for, t.is_all_day) : null, done: t.completed, seen: t.updated_at })),
    }
  })
  return {
    start, today, days,
    noDay: open.filter((t) => t.bucket === 'week' && !t.scheduled_for && (t.week_start ?? start) === start).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    lastWeekUnfinished: open.filter((t) => { const d = ymd(t.scheduled_for); return !!d && d >= lastStart && d < start })
      .map((t) => ({ id: t.id, title: t.title, was: ymd(t.scheduled_for)!, seen: t.updated_at })),
    inbox: open.filter((t) => t.bucket === 'inbox' && !t.scheduled_for).slice(0, 30).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    routines: input.routines.filter((r) => !r.parent_routine_id).map((r) => ({ id: r.id, name: r.name, time: r.time_of_day ? r.time_of_day.slice(0, 5) : null, pattern: r.recurrence_pattern })),
    talkAbouts: input.talks.map((s) => s.body),
  }
}

export const READ_WEEK_TOOL = {
  name: 'symphony_read_week',
  description: 'Read the whole week in one call before planning it: each day\'s calendar events and dated tasks, tasks chosen for the week with no day yet, last week\'s unfinished tasks, the inbox, routines, and open things-to-talk-about. Use it FIRST when asked to plan the week or the rest of the week. Task ids here are the ids symphony_propose_changes takes.',
  input_schema: { type: 'object', properties: { start: { type: 'string', description: 'YYYY-MM-DD first day of the week (omit for this week)' } } },
}
```

In `index.ts`:
- `import { READ_WEEK_TOOL, local, shapeWeek, weekWindow } from './readWeek.ts'`
- add `READ_WEEK_TOOL,` after `PROPOSE_CHANGES_TOOL,` in `TOOLS`
- add a `runTool` case before `case 'symphony_list_tasks':`

```ts
      case 'symphony_read_week': {
        // This week by default: the household's week start lives in the app's
        // cadence config, which the client sends in workspaceContext when it can.
        const today = local(new Date().toISOString()).date
        const start = typeof input.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.start)
          ? input.start
          : (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return d.toISOString().slice(0, 10) })()
        const { end, lastStart } = weekWindow(start)
        const shift = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
        const cols = 'id, title, scheduled_for, is_all_day, bucket, week_start, completed, assigned_to, updated_at'
        const [dated, week, inbox, events, routines, talks] = await Promise.all([
          // A day wider each side: stored times are UTC; shapeWeek files them by local day.
          db.from('tasks').select(cols).gte('scheduled_for', `${shift(lastStart, -1)}T00:00:00Z`).lt('scheduled_for', `${shift(end, 1)}T00:00:00Z`).limit(300),
          db.from('tasks').select(cols).eq('bucket', 'week').eq('completed', false).is('scheduled_for', null).limit(100),
          db.from('tasks').select(cols).eq('bucket', 'inbox').eq('completed', false).is('scheduled_for', null).order('created_at', { ascending: false }).limit(30),
          db.from('calendar_events').select('id, title, start_time, end_time, all_day').lt('start_time', `${shift(end, 1)}T00:00:00Z`).gte('end_time', `${shift(start, -1)}T00:00:00Z`).order('start_time').limit(200),
          db.from('routines').select('id, name, recurrence_pattern, time_of_day, parent_routine_id').limit(200),
          db.from('scratchpad_notes').select('id, body').eq('kind', 'talk').eq('status', 'open').limit(20),
        ])
        const failed = [dated, week, inbox, events, routines, talks].find((r) => r.error)
        if (failed?.error) throw failed.error
        return JSON.stringify(shapeWeek({ start, today, tasks: [...(dated.data ?? []), ...(week.data ?? []), ...(inbox.data ?? [])], events: events.data ?? [], routines: routines.data ?? [], talks: talks.data ?? [] }))
      }
```

The default start above assumes a **Saturday** week (`(day + 1) % 7` days back), which is this household's setting (`2026-09-29-saturday-weeks.md`). The prompt instructs the model to pass `start` from the page context whenever it has one, which covers other households.

Add the planning bullets to the "Doing versus suggesting:" prompt block:

```
- Planning the week (or the rest of it): (1) call symphony_read_week first, passing the week's start from the page when you have it; (2) describe the week back in two or three plain sentences, including what looks muddled; (3) ask ONLY about gaps and conflicts, one or two questions at a time, never a questionnaire; check the calendar and email before asking anything they could answer; (4) when the person has answered, call symphony_propose_changes once with the whole list; (5) write nothing yourself. Month, season and year goals are reference only; mention one only when something clearly serves it. Never invent goals.
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run supabase/functions/symphony-agent/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/symphony-agent/readWeek.ts supabase/functions/symphony-agent/readWeek.test.ts supabase/functions/symphony-agent/index.ts
git commit -m "Agent: symphony_read_week reads the whole week before planning it"
```

---

### Task 10: Dashed preview on Week

**Files:**
- Create: `src/components/canvas/week/changePreview.ts`
- Test: `src/components/canvas/week/changePreview.test.ts`
- Modify: `src/components/canvas/week/WeekCanvas.tsx` (`CanvasDayItem` at line 56; `dayRow` around line 400)
- Modify: `src/components/home/week/WeekViewV2.tsx` (where `canvasDays` and `shelf` reach `<WeekCanvas` around line 1225)
- Modify: `src/components/canvas/week/WeekCanvas.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `ChangeSet`, `opWhen` (Tasks 3–4); `useCanvasActivity().changeSet` (Task 6).
- Produces:
  - `CanvasDayItem.proposed?: boolean`
  - `changePreview(set: ChangeSet | null, tasks: Task[]): { byDay: Map<string, CanvasDayItem[]>; leaving: Set<string> }`, where `leaving` holds the task ids the set moves off their current spot (day or No day yet), and `byDay` is keyed `YYYY-MM-DD`
  - `withPreview(days: CanvasDay[], shelf: ShelfGroup[], preview): { days: CanvasDay[]; shelf: ShelfGroup[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/canvas/week/changePreview.test.ts
import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { changePreview, withPreview } from './changePreview'
import type { CanvasDay } from './WeekCanvas'

const task = (id: string, x: Partial<Task> = {}) => ({ id, title: id, completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(), ...x }) as Task
const set = { key: 's', title: '3 changes', ops: [
  { key: 's:0', op: 'place' as const, taskId: 'a', title: 'Reply to Christian', date: '2026-10-14', time: '09:00' },
  { key: 's:1', op: 'add' as const, title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' },
  { key: 's:2', op: 'someday' as const, taskId: 'b', title: 'Washing machine' },
] }

describe('changePreview', () => {
  it('draws placed and added items on their day, dashed, and lifts what moves', () => {
    const p = changePreview(set, [task('a'), task('b', { scheduledFor: new Date(2026, 9, 15), isAllDay: true })])
    const wed = p.byDay.get('2026-10-14')!
    expect(wed.map((i) => [i.title, i.proposed, i.time])).toEqual([
      ['Reply to Christian', true, new Date(2026, 9, 14, 9, 0)],
      ['Hold for WSWMD', true, new Date(2026, 9, 14, 13, 0)],
    ])
    expect([...p.leaving]).toEqual(['a', 'b'])
  })
  it('nothing pending, nothing drawn', () => {
    const p = changePreview(null, [])
    expect(p.byDay.size).toBe(0)
    expect(p.leaving.size).toBe(0)
  })
})

describe('withPreview', () => {
  it('adds the dashed rows to their day and removes moved rows from where they were', () => {
    const day = (key: string, items: CanvasDay['items']): CanvasDay => ({ date: new Date(`${key}T00:00:00`), key, events: [], items })
    const days = [day('2026-10-14', []), day('2026-10-15', [{ id: 'task-b', kind: 'task', title: 'b', completed: false, task: task('b') }])]
    const shelf = [{ key: 'none', milestone: null, rows: [{ task: task('a'), meta: null }], done: [] }]
    const p = changePreview(set, [task('a'), task('b')])
    const out = withPreview(days, shelf as never, p)
    expect(out.days[0].items.map((i) => i.title)).toEqual(['Reply to Christian', 'Hold for WSWMD'])
    expect(out.days[1].items).toEqual([])
    expect(out.shelf[0].rows).toEqual([])
  })
})
```

Before writing `withPreview`, read the real `ShelfGroup` shape in `src/components/canvas/week/weekShelf.ts`. If its row field isn't `rows: { task: Task; … }[]`, adjust the fixture and the filter to match. Keep the behaviour: rows whose task is in `leaving` disappear.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/canvas/week/changePreview.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
// src/components/canvas/week/changePreview.ts
//
// The change card, previewed on the week (mockup frame "After 2"): what a
// pending set would place appears dashed on its day; what it moves leaves the
// spot it is in now. Nothing here writes.

import type { Task } from '@/types/task'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import { opWhen } from '@/lib/canvas/changeCard'
import { localYmd } from '@/lib/cadence/config'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'
import type { ShelfGroup } from './weekShelf'

export interface ChangePreview { byDay: Map<string, CanvasDayItem[]>; leaving: Set<string> }

export function changePreview(set: ChangeSet | null, tasks: Task[]): ChangePreview {
  const byDay = new Map<string, CanvasDayItem[]>()
  const leaving = new Set<string>()
  if (!set) return { byDay, leaving }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const op of set.ops) {
    if (op.taskId && op.op !== 'assign') leaving.add(op.taskId)
    if ((op.op === 'place' || op.op === 'add') && op.date) {
      const when = opWhen(op)!
      const item: CanvasDayItem = {
        id: `proposed-${op.key}`, kind: 'task', title: op.title, completed: false, proposed: true,
        ...(op.time ? { time: when } : {}),
        ...(op.taskId && byId.get(op.taskId) ? { task: byId.get(op.taskId) } : {}),
      }
      const key = localYmd(when)
      byDay.set(key, [...(byDay.get(key) ?? []), item])
    }
  }
  return { byDay, leaving }
}

export function withPreview(days: CanvasDay[], shelf: ShelfGroup[], p: ChangePreview): { days: CanvasDay[]; shelf: ShelfGroup[] } {
  if (!p.byDay.size && !p.leaving.size) return { days, shelf }
  return {
    days: days.map((d) => ({
      ...d,
      items: [...d.items.filter((it) => !(it.task && p.leaving.has(it.task.id))), ...(p.byDay.get(d.key) ?? [])],
    })),
    shelf: shelf.map((g) => ({ ...g, rows: g.rows.filter((r) => !p.leaving.has(r.task.id)) })),
  }
}
```

In `WeekCanvas.tsx`, add to `CanvasDayItem`:

```ts
  /** Drawn from a pending change card: dashed, not yet saved, not interactive. */
  proposed?: boolean
```

At the top of `dayRow`, before `const key = …`:

```tsx
    if (it.proposed) {
      return (
        <li key={`${day.key}:${it.id}`} className="cw-row wc-dayrow is-proposed" data-testid="proposed-row">
          {it.time && <span className="cw-meta">{formatTimeCompact(it.time)}</span>}
          <span className="cw-title">{it.title}</span>
          <span className="sr-only"> (proposed, not saved yet)</span>
        </li>
      )
    }
```

Read `CompactWeekRow`'s markup in `CompactWeekList.tsx` first and use its real class names for the time and title spans, so a proposed row lines up with saved rows.

In `WeekViewV2.tsx`, just before `<WeekCanvas …>` is built:

```tsx
  const { changeSet } = activity
  const preview = useMemo(() => changePreview(changeSet, tasks), [changeSet, tasks])
  const shown = useMemo(() => withPreview(canvasDays.days, shelf, preview), [canvasDays.days, shelf, preview])
```

Then pass `days={shown.days}` and `shelf={shown.shelf}` instead of `canvasDays.days` and `shelf`. Hooks must stay above any early return. Place the two `useMemo`s next to the existing `canvasDays` `useMemo` (around line 1066), not inside JSX.

Styles:

```css
.wc-dayrow.is-proposed { border: 1.5px dashed #1b6a64; background: #eef6f3; border-radius: 6px; padding: 4px 7px; margin: 2px -7px; color: #123f3b; display: flex; gap: 8px; list-style: none; }
.dark .wc-dayrow.is-proposed { border-color: #6cc4b9; background: #182b29; color: #d7efe9; }
```

Add to `WeekCanvas.test.tsx`:

```tsx
  it('draws a proposed row dashed and inert', () => {
    const d = days()
    d[4].items.push({ id: 'proposed-s:0', kind: 'task', title: 'Reply to Christian', completed: false, proposed: true, time: new Date(2026, 9, 7, 9, 0) })
    const w = writers()
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={w} />)
    const row = screen.getByTestId('proposed-row')
    expect(row).toHaveTextContent('Reply to Christian')
    expect(row).toHaveTextContent('proposed, not saved yet')
    fireEvent.click(row)
    expect(w.open).not.toHaveBeenCalled()
  })
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/canvas/week/ src/components/home/week/ && npx tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/week/changePreview.ts src/components/canvas/week/changePreview.test.ts src/components/canvas/week/WeekCanvas.tsx src/components/canvas/week/WeekCanvas.test.tsx src/components/home/week/WeekViewV2.tsx src/index.css
git commit -m "Week: a pending change card shows dashed on its days"
```

---

### Task 11: The week in one sentence

**Files:**
- Create: `src/components/canvas/week/weekSentence.ts`
- Test: `src/components/canvas/week/weekSentence.test.ts`
- Modify: `src/components/canvas/week/WeekCanvas.tsx` (replace the `wc-tray-aside` span, around line 528)

**Interfaces:**
- Produces: `weekSentence(days: CanvasDay[], todayKey: string): string | null`

Rules decide the wording (v2 rule: rules decide, the model only assists). In order, joined with spaces, at most three parts:
1. Today with an event: `Today: <first event title>.`
2. Days ahead (after today, Mon–Fri only) with no events and no open items: one → `<Weekday> is wide open.`; two → `<A> and <B> are wide open.`; three or more → `<N> days ahead are wide open.`
3. The fullest day ahead, if it has 4 or more events plus open items and isn't today: `<Weekday> is the full one.`
4. Nothing to say → `null` (the subline then shows only the No day yet line).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/canvas/week/weekSentence.test.ts
import { describe, expect, it } from 'vitest'
import { weekSentence } from './weekSentence'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'

const item = (title: string, kind: CanvasDayItem['kind'] = 'task'): CanvasDayItem => ({ id: title, kind, title, completed: false })
const day = (key: string, events: string[] = [], items: string[] = []): CanvasDay =>
  ({ date: new Date(`${key}T00:00:00`), key, events: events.map((e) => item(e, 'event')), items: items.map((i) => item(i)) })

describe('weekSentence', () => {
  it('today’s event, the open days, the full day', () => {
    const days = [
      day('2026-10-14', ['CEPI food-contact meeting'], ['Reply to Christian']),
      day('2026-10-15'),
      day('2026-10-16', ['Grampappa', 'Dentist'], ['PPVIS', 'VW Credit']),
    ]
    expect(weekSentence(days, '2026-10-14')).toBe('Today: CEPI food-contact meeting. Thursday is wide open. Friday is the full one.')
  })
  it('two and many open days; weekends never count as open', () => {
    expect(weekSentence([day('2026-10-14'), day('2026-10-15'), day('2026-10-16'), day('2026-10-17')], '2026-10-14')).toBe('Thursday and Friday are wide open.')
    expect(weekSentence([day('2026-10-12'), day('2026-10-13'), day('2026-10-14'), day('2026-10-15'), day('2026-10-16')], '2026-10-11')).toBe('5 days ahead are wide open.')
  })
  it('nothing to say is null', () => {
    expect(weekSentence([day('2026-10-14', [], ['x'])], '2026-10-14')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/canvas/week/weekSentence.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
// src/components/canvas/week/weekSentence.ts
//
// One plain sentence under the week's title (mockup "After 1"). Rules decide
// what it says (wall philosophy rule 5); nothing here is generated.

import type { CanvasDay } from './WeekCanvas'

const weekday = (d: CanvasDay) => d.date.toLocaleDateString('en-US', { weekday: 'long' })
const isWeekday = (d: CanvasDay) => d.date.getDay() >= 1 && d.date.getDay() <= 5
const openItems = (d: CanvasDay) => d.items.filter((i) => !i.completed && !i.proposed).length

export function weekSentence(days: CanvasDay[], todayKey: string): string | null {
  const parts: string[] = []
  const today = days.find((d) => d.key === todayKey)
  if (today?.events.length) parts.push(`Today: ${today.events[0].title}.`)
  const ahead = days.filter((d) => d.key > todayKey)
  const open = ahead.filter((d) => isWeekday(d) && !d.events.length && openItems(d) === 0)
  if (open.length === 1) parts.push(`${weekday(open[0])} is wide open.`)
  else if (open.length === 2) parts.push(`${weekday(open[0])} and ${weekday(open[1])} are wide open.`)
  else if (open.length > 2) parts.push(`${open.length} days ahead are wide open.`)
  const load = (d: CanvasDay) => d.events.length + openItems(d)
  const full = [...ahead].sort((a, b) => load(b) - load(a))[0]
  if (full && load(full) >= 4) parts.push(`${weekday(full)} is the full one.`)
  return parts.length ? parts.slice(0, 3).join(' ') : null
}
```

In `WeekCanvas.tsx`, import `weekSentence` and replace

```tsx
      <span className="wc-tray-aside">Inbox, last week and {monthName}’s goals come up when you plan.</span>
```

with

```tsx
      {sentence && <span className="wc-tray-aside wc-week-sentence">{sentence}</span>}
```

and compute `const sentence = isCurrent ? weekSentence(days, todayKey) : null` just above `shelfLine`. Update any `WeekCanvas.test.tsx` assertion that looked for "come up when you plan" so it now expects the sentence or its absence.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/canvas/week/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/week/weekSentence.ts src/components/canvas/week/weekSentence.test.ts src/components/canvas/week/WeekCanvas.tsx src/components/canvas/week/WeekCanvas.test.tsx
git commit -m "Week: one plain sentence about the week under its title"
```

---

### Task 12: "Plan the rest of my week" in the bar

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx`
- Test: `src/components/home/week/WeekViewV2.test.tsx` (or the existing Week page test; find it with `ls src/components/home/week/*.test.tsx`)

**Interfaces:**
- Consumes: `useConversationWalk` (`src/components/canvas/conversationWalk.ts`).
- Produces: a walk `{ label: 'Plan the week' | 'Plan the rest of my week', message }` while the current week is shown.

- [ ] **Step 1: Write the failing test**

```tsx
  it('offers "Plan the rest of my week" in the bar on the current week', () => {
    const setWalk = vi.fn()
    renderWeek({ wrapper: ({ children }) => <ConversationWalkContext.Provider value={setWalk}>{children}</ConversationWalkContext.Provider> })
    expect(setWalk).toHaveBeenCalledWith({ label: 'Plan the rest of my week', message: 'Plan the rest of my week.' })
  })
```

Use the existing test file's render helper (named `renderWeek` here; match the real one) and freeze the clock to a mid-week day with `vi.setSystemTime(new Date(2026, 9, 14, 9))`. Add a second case with the clock on the week's first day (Saturday, `new Date(2026, 9, 10, 9)`) that expects `{ label: 'Plan the week', message: 'Plan the week.' }`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/home/week/`
Expected: FAIL, `setWalk` was not called.

- [ ] **Step 3: Implement** in `WeekViewV2.tsx` (with the other hooks, above any early return)

```tsx
  const isThisWeek = weekIsCurrentFor(weekAnchor)
  const firstDay = localYmd(new Date()) === localYmd(weekAnchor)
  useConversationWalk(isThisWeek
    ? (firstDay ? { label: 'Plan the week', message: 'Plan the week.' } : { label: 'Plan the rest of my week', message: 'Plan the rest of my week.' })
    : null)
```

Import `useConversationWalk` from `@/components/canvas/conversationWalk`. `weekIsCurrentFor` and `localYmd` are already used in this file. Confirm with `grep -n "weekIsCurrentFor\|localYmd" src/components/home/week/WeekViewV2.tsx`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/home/week/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx src/components/home/week/*.test.tsx
git commit -m "Week: Plan the rest of my week sits in the conversation bar"
```

---

### Task 13: PR 2 verification and pull request

- [ ] **Step 1:** `npm test -- --run && npm run lint && npm run build`. Expected: green.
- [ ] **Step 2: Browser check (local build, Scott's account, desktop 1440×900 and phone 390×844).** Start `npm run dev`. Sign in the way Scott approves for this session, never with a stored password. Open `/week`, then confirm that:
  - the sentence shows under the title;
  - the bar shows **Plan the rest of my week**;
  - after Scott approves deploying `symphony-agent`, tapping it produces a read-back, questions, and a card whose rows appear dashed on the right days;
  - Approve puts them on the week, and Undo takes them back.

  Take screenshots of each step.
- [ ] **Step 3: Privacy check.** Repeat with Iris's account, or with `symphonytest4444` as the second household member if Iris's isn't available. Confirm that a proposal can't name Scott's private Work/Personal tasks (the server returns the "No task … that this person can change" error), and that the dashed preview shows only rows the viewer can see.
- [ ] **Step 4:** Rebase, push, and open a draft PR as in Task 8, titled `Week: plan the rest of the week by talking, previewed dashed`. Put the screenshots in the PR. Ask Scott before merging or deploying.

---

# PR 3: retire the Week machinery

Branch: `claude/v2-week-retire` from main after PR 2 merges. Each task deletes code **and** the tests that covered only that code. Keep tests that cover drag, tick and open.

### Task 14: "No day yet" replaces the still-to-place tray

**Files:**
- Modify: `src/components/canvas/week/WeekCanvas.tsx` (`shelfOpen` state at line 173; `shelfLine` around lines 510–530; the `<section id="wc-shelf">` block around line 374; `shelfRow` around line 281)
- Modify: `src/components/canvas/week/WeekCanvas.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write the failing test**

```tsx
  it('things with no day sit in one quiet line, draggable onto a day; no tray', () => {
    show()
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
    const line = screen.getByRole('list', { name: 'No day yet' })
    expect(within(line).getByText('Book the cabin')).toBeInTheDocument()
    expect(within(line).getByText('Call the bank')).toBeInTheDocument()
    const chip = within(line).getByText('Book the cabin').closest('[draggable="true"]')
    expect(chip).not.toBeNull()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/canvas/week/WeekCanvas.test.tsx -t "quiet line"`
Expected: FAIL, there's no list named "No day yet".

- [ ] **Step 3: Implement**
  - Delete the `shelfOpen` state, the Show/Hide button and the whole `<section id="wc-shelf">` tray block, including its composer and goal groups.
  - Keep the shelf **drop target** (`shelfDrop`): dropping a day's task back still unplaces it. Attach `{...shelfDrop}` to the new line instead.
  - Replace `shelfLine` with:

```tsx
  const unplaced = shelf.flatMap((g) => g.rows.map((r) => r.task))
  const shelfLine = (
    <span className="wc-tray">
      {unplaced.length > 0 && (
        <span className="wc-noday" {...shelfDrop}>
          <span className="wc-noday-label">No day yet</span>
          <ul className="wc-noday-chips" aria-label="No day yet">
            {unplaced.map((t) => (
              <li key={t.id} draggable={!phone} className="wc-noday-chip"
                onDragStart={(ev) => startDrag(ev, { kind: 'task', id: t.id, date: localYmd(weekStart), title: t.title }, { kind: 'task', id: t.id })}
                onDragEnd={endDrag}>
                <button type="button" className="wc-noday-open" onClick={() => writers.open(`task-${t.id}`)}>{t.title}</button>
              </li>
            ))}
          </ul>
        </span>
      )}
      {sentence && <span className="wc-tray-aside wc-week-sentence">{sentence}</span>}
    </span>
  )
```

  Check the id format `writers.open` expects for a task (the `CanvasDayItem.id` comment says `'task-…'`), and match it.
  - Delete the now-unused helpers (`shelfRow`, the composer state, `overGoal`, `linked` / `quiet` / `unlinked`) and any imports lint reports as unused.
  - Styles:

```css
.wc-noday { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.wc-noday-label { font-size: 13px; color: #6a6f6d; }
.wc-noday-chips { display: contents; list-style: none; margin: 0; padding: 0; }
.wc-noday-chip { display: inline-flex; border: 1px dashed #b9b9b3; border-radius: 999px; background: #fff; }
.wc-noday-open { font: inherit; font-size: 13px; padding: 5px 11px; min-height: 32px; background: none; border: 0; color: inherit; }
.dark .wc-noday-chip { background: transparent; border-color: #4a5352; }
```

  - Delete the tests that open the tray, use its composer, or drag between goal groups. Keep and adapt the tests that drop a day's task back (`unplaceTask`) so they drop onto the No day yet line.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/canvas/week/ && npm run lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/canvas/week/ src/index.css
git commit -m "Week: No day yet replaces the still-to-place tray"
```

### Task 15: Rows lose the ⋯ menu; tap opens the item

**Files:**
- Modify: `src/components/canvas/week/WeekCanvas.tsx` (`dayRow`; `moreButton` at line 272; `taskMenuItems`, `taskPanel`, `pick` and their state: `menu`, `panel`, `picker`)
- Modify: `src/components/canvas/week/WeekCanvas.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('a day row has no ⋯ menu: tick, drag and tap-to-open only', () => {
    const w = writers()
    show(w)
    const row = screen.getByText('Pick up the keys').closest('li')!
    expect(within(row).queryByRole('button', { name: /more/i })).toBeNull()
    fireEvent.click(within(row).getByText('Pick up the keys'))
    expect(w.open).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL, the more button exists.
- [ ] **Step 3: Implement.** In `dayRow`, drop the `trailing={moreButton(…)}` prop, the `pick(…)` child and the `taskPanel(…)` child. Delete `moreButton`, `taskMenuItems`, `taskPanel`, `pick`, the `menu` / `panel` / `picker` state, and the `MoveUnderMenu` / `ContextPicker` / `PeoplePicker` / `CanvasMenu` / `GiveItADay` imports if they're now unused. Phone keeps its day-chip control only if `GiveItADay` is still used by the phone layout (check with `grep -n "GiveItADay" src/components/canvas/week/WeekCanvas.tsx`). Remove the now-unused writers from `WeekCanvasWriters` (`assign`, `setArea`, `moveUnderOptions`, `moveUnder`, `putOnWeek`, and `milestoneDone` if nothing else calls it), and remove their implementations in `WeekViewV2.tsx` (`canvasWriters`, around lines 1116–1200). Delete the tests that exercised those menus.
- [ ] **Step 4: Run** `npx vitest run src/components/canvas/week/ src/components/home/week/ && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Week: rows drop the ⋯ menu; tap opens the item"`

### Task 16: Days/Hours and Hours mode go

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx` (`WeekModeSwitch` at lines 183–195; `mode` / `showSchedule` at line 506; the `<WeekGrid` block at lines 1292–1377; `weekTools` at line 1235)
- Modify: whichever parent passes `mode` / `onModeChange` (find with `grep -rn "onModeChange" src --include=*.tsx`)
- Delete (only if nothing else imports it): `src/components/home/week/WeekGrid.tsx` and its tests. Check with `grep -rn "from './WeekGrid'\|/WeekGrid'" src`. Today or other pages may import `dayKey` or `FIRST_HOUR`; if so, keep the file and delete only the Week usage.

- [ ] **Step 1: Write the failing test** (Week page test)

```tsx
  it('has no Days/Hours switch', () => {
    renderWeek()
    expect(screen.queryByRole('radio', { name: 'Hours' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Days' })).toBeNull()
  })
```

- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement.** Remove `WeekModeSwitch`, the `mode` prop and state, the `showSchedule` branch with its `<WeekGrid>`, `SlotQuickCreatePopover` and `RoutinePlacePopover` usages, `gridCreate`, and the `weekTools` mode switch. Delete any helpers lint reports as unused.
- [ ] **Step 4: Run** `npx vitest run src/components/home/ && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Week: one view; Days/Hours and Hours mode retired"`

### Task 17: The eight-step session goes

**Files:**
- Modify: `src/components/plan/v2/WeekV2.tsx` (`WEEK_STEPS` at line 78; `WeekStepMain` import at line 52; `planLabel: 'Plan the week'` at line 342; the session render around line 512)
- Modify: `src/components/home/week/WeekPlanHost.tsx` (`openSession`)
- Delete: `src/components/plan/v2/WeekStepScreen.tsx`, `src/components/plan/v2/WeekStepPanels.tsx` and their tests, after `grep -rn "WeekStepScreen\|WeekStepPanels" src` shows no other users
- Modify: the guide text for Week (`grep -rn "Plan the week" src/lib src/components --include=*.ts*`) so "What is this page?" no longer describes eight steps

- [ ] **Step 1: Write the failing test** (WeekV2 test)

```tsx
  it('has no Plan the week session button; planning starts in the conversation bar', () => {
    renderWeekV2()
    expect(screen.queryByRole('button', { name: 'Plan the week' })).toBeNull()
    expect(screen.queryByText(/Step \d of 8/)).toBeNull()
  })
```

- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement.** Remove `WEEK_STEPS`, the session state and render, and the `planLabel` button. Make the "week ends today" banner (around line 543) say `Plan the week ahead while it’s fresh: tap Plan the week below.` and drop its session button. Remove `openSession` from `WeekPlanHost` and its callers. Delete the two step files and their tests. Update the Week page guide copy.
- [ ] **Step 4: Run** `npm test -- --run && npm run lint && npm run build`. Expected: green.
- [ ] **Step 5: Commit** `git commit -am "Week: the eight-step session is retired; planning is a conversation"`

### Task 18: PR 3 verification and pull request

- [ ] **Step 1:** Run the full suite, lint and build.
- [ ] **Step 2: Browser check.** On desktop and phone width, with Scott's account: confirm that ticking, dragging a row to another day, dragging a No day yet chip onto a day, dropping a day's task back onto the line, and tapping a row to open its panel all still work. Take a screenshot of each.
- [ ] **Step 3:** Rebase, push, and open a draft PR titled `Week: retire the tray, the ⋯ menu, Hours and the eight steps`. In the body, list what was removed and say that the removal can wait a week of real use. Ask Scott before merging or deploying.

---

# PR 4: the page follows the conversation

Added 2026-10-14 at Scott's request ("the idea was an adaptive canvas that updates in real time to conversations"). Two pieces: **Symphony points** (a teal halo on the days and tasks it is talking about) and **the week rebuilds as you answer** (the change set is proposed early and revised after each answer, so dashed rows appear live). Layout rearrangement is a later stage with its own mockup.

Branch: `claude/v2-live-canvas`, stacked on `claude/v2-week-retire`.

### Task 19: `symphony_point`, the agent points at days and tasks

**Files:**
- Create: `supabase/functions/symphony-agent/pointing.ts`
- Test: `supabase/functions/symphony-agent/pointing.test.ts`
- Modify: `supabase/functions/symphony-agent/index.ts` (import; `TOOLS` after `READ_WEEK_TOOL,`; dispatch branch before the `PROPOSE_CHANGES_TOOL` branch; prompt)

**Interfaces:**
- Produces: `pointAt(input: Record<string, unknown>): { dates: string[]; taskIds: string[] } | { error: string }`, `POINT_TOOL`, and the SSE event `{ type: 'point', dates: string[], taskIds: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/symphony-agent/pointing.test.ts
import { describe, expect, it } from 'vitest'
import { pointAt } from './pointing'

const A = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'

describe('pointAt', () => {
  it('keeps real dates and task ids', () => {
    expect(pointAt({ dates: ['2026-10-18', '2026-10-19'], task_ids: [A] })).toEqual({ dates: ['2026-10-18', '2026-10-19'], taskIds: [A] })
  })
  it('drops bad values; nothing left is an error', () => {
    expect(pointAt({ dates: ['2026-02-30', 'Sunday'], task_ids: ['nope'] })).toEqual({ error: 'Point at real YYYY-MM-DD dates or task ids' })
    expect(pointAt({})).toEqual({ error: 'Point at real YYYY-MM-DD dates or task ids' })
  })
  it('clearing is allowed: an explicit empty point', () => {
    expect(pointAt({ clear: true })).toEqual({ dates: [], taskIds: [] })
  })
  it('caps at 7 dates and 12 tasks', () => {
    const r = pointAt({ dates: Array.from({ length: 10 }, (_, i) => `2026-10-${String(10 + i).padStart(2, '0')}`), task_ids: Array.from({ length: 20 }, () => A) })
    if ('error' in r) throw new Error(r.error)
    expect(r.dates).toHaveLength(7)
    expect(r.taskIds).toHaveLength(1) // de-duplicated
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/symphony-agent/pointing.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// supabase/functions/symphony-agent/pointing.ts
//
// The page follows the conversation (Scott, 2026-10-14): while Symphony talks
// about days or tasks, the page lights them up. Pointing changes no data.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const realDate = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

export function pointAt(input: Record<string, unknown>): { dates: string[]; taskIds: string[] } | { error: string } {
  if (input.clear === true) return { dates: [], taskIds: [] }
  const dates = [...new Set((Array.isArray(input.dates) ? input.dates : []).map(realDate).filter((d): d is string => !!d))].slice(0, 7)
  const taskIds = [...new Set((Array.isArray(input.task_ids) ? input.task_ids : []).filter((t): t is string => typeof t === 'string' && UUID_RE.test(t)))].slice(0, 12)
  if (!dates.length && !taskIds.length) return { error: 'Point at real YYYY-MM-DD dates or task ids' }
  return { dates, taskIds }
}

export const POINT_TOOL = {
  name: 'symphony_point',
  description: 'Light up the days and/or tasks you are talking about on the page the person is looking at, so the page follows the conversation. Call it right before you ask about or describe specific days or tasks ("Baseball and the dentist are both Sunday at 10:30"). Changes no data. The highlight stays until you point again or the next turn starts; pass clear: true to remove it.',
  input_schema: {
    type: 'object',
    properties: {
      dates: { type: 'array', items: { type: 'string' }, description: 'YYYY-MM-DD days to light up (at most 7)' },
      task_ids: { type: 'array', items: { type: 'string' }, description: 'Task ids to light up (at most 12), e.g. from symphony_read_week' },
      clear: { type: 'boolean' },
    },
  },
}
```

In `index.ts`:
- `import { POINT_TOOL, pointAt } from './pointing.ts'`
- `POINT_TOOL,` after `READ_WEEK_TOOL,` in `TOOLS`
- dispatch branch, placed immediately before `} else if (block.name === PROPOSE_CHANGES_TOOL.name) {`:

```ts
              } else if (block.name === POINT_TOOL.name) {
                // The page follows the conversation; nothing is written.
                const pointed = pointAt(block.input ?? {})
                if ('error' in pointed) result = JSON.stringify({ error: pointed.error })
                else {
                  send({ type: 'point', dates: pointed.dates, taskIds: pointed.taskIds })
                  result = JSON.stringify({ shown: true, note: 'Lit up on the page. Do not describe the highlight; just talk.' })
                }
```

- add to the planning bullet in the prompt (after "(2) describe the week back…"): `Whenever you describe or ask about specific days or tasks, call symphony_point with them first so the page lights them up.`

- [ ] **Step 4: Run the tests** — `npx vitest run supabase/functions/symphony-agent/ && deno check supabase/functions/symphony-agent/index.ts`. Expected: PASS, clean.

- [ ] **Step 5: Commit** — `git commit -m "Agent: symphony_point lights up the days and tasks it is talking about"`

### Task 20: The client holds what Symphony is pointing at

**Files:**
- Modify: `src/lib/agentStream.ts` (event union, `StreamHandlers.onPoint`, loop), `src/lib/agentTurn.ts` (handler type + passthrough, as Task 3 did for `onChangeSet`), `src/hooks/useSymphonyAssistant.ts` (`AssistantTurnObserver.point`, handler), `src/shell/ShellLayout.tsx` (`turnObserver.point`), `src/contexts/CanvasActivityContext.tsx`
- Test: `src/lib/agentStream.test.ts`, `src/contexts/CanvasActivityContext.test.tsx`

**Interfaces:**
- Produces on `CanvasActivity`: `pointing: { dates: Set<string>; taskIds: Set<string> } | null` and `setPointing(p: { dates: string[]; taskIds: string[] }): void`. `turnStarted` clears `pointing`. An empty point (`clear`) sets `null`.

- [ ] **Step 1: Write the failing tests**

```ts
  // agentStream.test.ts
  it('passes a point event through intact', () => {
    const { events } = parseSSEChunk('data: {"type":"point","dates":["2026-10-18"],"taskIds":[]}\n\n')
    expect(events).toEqual([{ type: 'point', dates: ['2026-10-18'], taskIds: [] }])
  })
```

```tsx
  // CanvasActivityContext.test.tsx — reuse the file's Probe/mount pattern
  describe('pointing', () => {
    it('holds what Symphony points at, clears on an empty point and on the next turn', () => {
      const { activity } = mountActivity({})
      act(() => activity().setPointing({ dates: ['2026-10-18'], taskIds: ['a'] }))
      expect(activity().pointing?.dates.has('2026-10-18')).toBe(true)
      expect(activity().pointing?.taskIds.has('a')).toBe(true)
      act(() => activity().setPointing({ dates: [], taskIds: [] }))
      expect(activity().pointing).toBeNull()
      act(() => activity().setPointing({ dates: ['2026-10-19'], taskIds: [] }))
      act(() => activity().turnStarted('Thursday', false))
      expect(activity().pointing).toBeNull()
    })
  })
```

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Implement**
  - `agentStream.ts`: `| { type: 'point'; dates: string[]; taskIds: string[] }`; `onPoint?: (p: { dates: string[]; taskIds: string[] }) => void`; loop: `else if (ev.type === 'point') handlers.onPoint?.({ dates: Array.isArray(ev.dates) ? ev.dates : [], taskIds: Array.isArray(ev.taskIds) ? ev.taskIds : [] })`
  - `agentTurn.ts`: `onPoint?` on the handler type and `onPoint: handlers.onPoint` in the passthrough (without it the event never arrives — see Task 3).
  - `useSymphonyAssistant.ts`: `point?: (p: { dates: string[]; taskIds: string[] }) => void` on the observer; `onPoint: (p) => turnObserver?.point?.(p),`
  - `ShellLayout.tsx` `turnObserver`: `point: (p) => canvasRef.current?.setPointing(p),`
  - `CanvasActivityContext.tsx`: state `const [pointing, setPointingState] = useState<{ dates: Set<string>; taskIds: Set<string> } | null>(null)`; `const setPointing = useCallback((p: { dates: string[]; taskIds: string[] }) => setPointingState(p.dates.length || p.taskIds.length ? { dates: new Set(p.dates), taskIds: new Set(p.taskIds) } : null), [])`; in `turnStarted` add `setPointingState(null)`; expose both in the value + memo deps; NOOP: `pointing: null, setPointing: () => {}`.

- [ ] **Step 4: Run** `npx vitest run src/lib/agentStream.test.ts src/contexts/CanvasActivityContext.test.tsx && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Pointing: the shell holds what Symphony is talking about"`

### Task 21: Week lights up what Symphony points at

**Files:**
- Modify: `src/components/canvas/week/WeekCanvas.tsx` (new prop `pointing`; `dayColumn` ~line 251; `dayRow`; the No day yet chips; the phone day chips)
- Modify: `src/components/home/week/WeekViewV2.tsx` (pass `activity.pointing`)
- Modify: `src/styles/canvas.css`
- Test: `src/components/canvas/week/WeekCanvas.test.tsx`

**Interfaces:**
- Consumes: `CanvasActivity.pointing` (Task 20).
- Produces: `WeekCanvasProps.pointing?: { dates: Set<string>; taskIds: Set<string> } | null`

- [ ] **Step 1: Write the failing test**

```tsx
  it('lights up the days and rows Symphony is talking about', () => {
    const d = days()
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()}
      pointing={{ dates: new Set([d[4].key]), taskIds: new Set(['p']) }} />)
    expect(screen.getByTestId(`journal-day-${d[4].key}`)).toHaveClass('is-pointed')
    expect(screen.getByTestId(`journal-day-${d[3].key}`)).not.toHaveClass('is-pointed')
    expect(screen.getByText('Pick up the keys').closest('li')).toHaveClass('is-pointed')
  })
```

(Wrap in `MemoryRouter` the way the file's other tests do, if needed. `placed` — "Pick up the keys", id `p` — sits on `dayOf(4)` in the fixture.)

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement**
  - Add the prop; `const pointedDay = (key: string) => !!pointing?.dates.has(key)`; `const pointedTask = (id?: string) => !!id && !!pointing?.taskIds.has(id)`.
  - `dayColumn`: append `${pointedDay(day.key) ? ' is-pointed' : ''}` to the section's class list.
  - `dayRow`: append ` is-pointed` to the row's `className` when `pointedTask(it.task?.id)`; proposed rows too when their `task` id is pointed.
  - No day yet chips: append ` is-pointed` when `pointedTask(t.id)`.
  - Phone: the day-chip strip (`SAT 10 … FRI 16`) gets ` is-pointed` on pointed days, and when exactly one date is pointed and it is in this week, the phone selects that day (so the card shown is the one being discussed).
  - `WeekViewV2`: pass `pointing={activity.pointing}` to `<WeekCanvas>`.
  - Styles (`canvas.css`), the Symphony halo:

```css
.wc-day.is-pointed { box-shadow: 0 0 0 2px #1b6a64, 0 0 0 6px #ddece8; border-radius: 10px; transition: box-shadow 280ms ease-out; }
.wc-dayrow.is-pointed, .wc-noday-chip.is-pointed { box-shadow: 0 0 0 2px #1b6a64; background: #ddece8; border-radius: 6px; transition: box-shadow 200ms ease-out, background 200ms ease-out; }
.dark .wc-day.is-pointed { box-shadow: 0 0 0 2px #6cc4b9, 0 0 0 6px #1c3634; }
.dark .wc-dayrow.is-pointed, .dark .wc-noday-chip.is-pointed { box-shadow: 0 0 0 2px #6cc4b9; background: #1c3634; }
@media (prefers-reduced-motion: reduce) { .wc-day.is-pointed, .wc-dayrow.is-pointed, .wc-noday-chip.is-pointed { transition: none; } }
```

  (Check the phone day-chip class name in the phone branch and add the same 2px teal ring there.)

- [ ] **Step 4: Run** `npx vitest run src/components/canvas/week/ src/components/home/week/ && npx tsc -b && npm run lint`. Expected: PASS, 0 errors.

- [ ] **Step 5: Commit** — `git commit -m "Week: the days and tasks Symphony is talking about light up"`

### Task 22: The week rebuilds as you answer

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts` (the planning bullet and the `symphony_propose_changes` tool-result note)
- Modify: `supabase/functions/symphony-agent/changeSet.ts` (`PROPOSE_CHANGES_TOOL.description`)
- Modify: `src/components/canvas/ChangeCard.tsx` (+ test)
- Test: `supabase/functions/symphony-agent/changeSet.test.ts` (prompt guard)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

```ts
  // changeSet.test.ts, in 'agent wiring'
  it('proposes early and revises after each answer while planning', () => {
    expect(src).toContain('as soon as one answer settles a change')
    expect(PROPOSE_CHANGES_TOOL.description).toContain('call it again with the whole list so far')
  })
```

```tsx
  // ChangeCard.test.tsx — a revised list updates in place, without a "replaces" banner
  it('a revised list updates in place without a banner', () => {
    render(<ChangeCard set={pending({ replaced: true })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByText('This replaces the earlier list.')).toBeNull()
  })
```

Delete the old ChangeCard test `'says when it replaced an earlier list'`.

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Implement**
  - Planning bullet in `index.ts`: replace "(4) when the person has answered, call symphony_propose_changes once with the whole list;" with: `(4) as soon as one answer settles a change, call symphony_propose_changes with the whole list so far (title like "2 changes so far"), and call it again with the whole revised list after each later answer, so the page rebuilds as you talk; the person approves whenever they are ready;`
  - Task 2's bullet "call symphony_propose_changes ONCE with the whole list" → `call symphony_propose_changes with the whole list (while planning, call it again with the whole list so far after each answer)`.
  - `PROPOSE_CHANGES_TOOL.description`: replace "If the person asks to change the list, call this again with the whole revised list." with "Each call replaces the list on the page: while planning, call it again with the whole list so far after each answer, and whenever the person asks for a change."
  - The tool-result note after a successful `change_set`: `'Shown as a change card and dashed on the page. Nothing is saved until the person approves. Do not read the list back; ask your next question or say it is ready to approve.'`
  - `ChangeCard.tsx`: remove the `{set.replaced && …}` line. (The context keeps the flag; nothing else reads it.)

- [ ] **Step 4: Run** `npx vitest run supabase/functions/symphony-agent/ src/components/canvas/ && deno check supabase/functions/symphony-agent/index.ts`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Planning: the change list is proposed early and revised after each answer"`

### Task 24: A preview build can talk to a test copy of the agent

Added 2026-10-14 (Scott chose test path A): the live app must keep using `symphony-agent` while a preview build of this branch talks to a separately deployed `symphony-agent-v2`.

**Files:** Modify `src/lib/agentStream.ts` (the fetch URL at ~line 150); Test: `src/lib/agentStream.test.ts`.

**Interfaces:** Produces `agentFunctionName(): string` — `import.meta.env.VITE_AGENT_FUNCTION` when it is a non-empty string of `[a-z0-9-]+`, else `'symphony-agent'`.

- [ ] **Step 1: Write the failing test**

```ts
import { agentFunctionName } from './agentStream'
describe('agentFunctionName', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('is symphony-agent unless a preview build names another', () => {
    expect(agentFunctionName()).toBe('symphony-agent')
    vi.stubEnv('VITE_AGENT_FUNCTION', 'symphony-agent-v2')
    expect(agentFunctionName()).toBe('symphony-agent-v2')
    vi.stubEnv('VITE_AGENT_FUNCTION', '../evil')
    expect(agentFunctionName()).toBe('symphony-agent')
  })
})
```

- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement** — export `agentFunctionName()` as specified and use it in the fetch URL: `` `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${agentFunctionName()}` ``.
- [ ] **Step 4: Run** `npx vitest run src/lib/agentStream.test.ts && npx tsc -b`.
- [ ] **Step 5: Commit** — `git commit -m "Agent stream: a preview build may name a test copy of the agent"`

The deploy steps (controller, not an implementer): copy `supabase/functions/symphony-agent` to an untracked `supabase/functions/symphony-agent-v2`, `supabase functions deploy symphony-agent-v2 --project-ref mwadppyrqzuzgstmwpuy`, set `VITE_AGENT_FUNCTION=symphony-agent-v2` for Vercel Preview on branch `claude/v2-live-canvas` only, push, and give Scott the preview link with the three-situation checklist.

### Task 23: PR 4 verification and pull request

- [ ] Full suite, lint, build (Node 22).
- [ ] Local browser check of the halo at desktop and phone width by setting pointing through a test-only path is NOT added; instead rely on Task 21's tests, and note that the live pointing turn needs `symphony-agent` deployed (Scott's OK).
- [ ] Push `claude/v2-live-canvas`, open a draft PR stacked on `claude/v2-week-retire`, titled `Week follows the conversation: Symphony points, the week rebuilds as you answer`.

---

## Not in this plan

- Layout that rearranges around the conversation (the day being discussed opens up; the rest steps back) — its own mockup first.
- Stage 3 (Routines), stage 4 (Today) and stage 5 (Month/Season/Year/Inbox). Each gets its own mockup, spec and plan.
- The change card on the wall (voice).
- Calendar writes from a change set.
