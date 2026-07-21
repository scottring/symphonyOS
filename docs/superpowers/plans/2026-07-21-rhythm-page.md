# Rhythm Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat routines list at `/routines` with the Rhythm page — the family's week rendered as time (Daily Arc with auto-clustering, Week Strip, Sometimes/Seasonal shelves, heuristic "Worth tending" card).

**Architecture:** A pure, fully-tested model layer (`rhythmModel.ts`, `tendHeuristics.ts`) buckets every routine into exactly one zone and clusters loose daily routines by time proximity. Thin presentational components render each zone. `RhythmPage.tsx` assembles them, adds people pills + type-anywhere search, and reuses the existing Tap panels, create handlers, and pause machinery unchanged. Swapped in via `src/components/lazy.ts`; old list component retired.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (Nordic Journal tokens), Vitest + React Testing Library, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-07-21-rhythm-page-design.md`

## Global Constraints

- Work happens in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/rhythm-page` on branch `rhythm-page`. Never commit in the main worktree.
- Before any npm/npx command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- Run tests with `npx vitest run <file>` — plain `npm test` is watch mode and will hang.
- No emoji in shipped UI — lucide-react icons only (`PawPrint`, `Leaf`, `Sparkles`, `Plus`, `Search`, `ChevronRight`, `List`).
- Week starts **Sunday** (columns Sun–Sat).
- Cluster gap threshold: **45 minutes**. "Full" day marker: **≥4** items. "Weekdays-or-more" weekly routines (`days.length >= 5`) count as daily.
- `time_of_day` is `'HH:MM:SS'`; `paused_until` is an ISO timestamp string.
- All existing hooks/panels are reused as-is: `TapRoutinePanel`, `TapStepPanel`, `PauseRoutineModal`, `groupRoutineSteps`, `RoutineBuilderModal`. No schema changes, no new hooks, no edge functions.
- Domain filtering stays host-level in `RoutinesApp` — the page never filters by `context` except in the Tend "missing domain" flow.
- Run `npm run lint` before the final push (CI runs lint; the pre-push hook does not).

---

### Task 1: Rhythm model — bucketing + clustering

**Files:**
- Create: `src/components/routine/rhythm/rhythmModel.ts`
- Test: `src/components/routine/rhythm/rhythmModel.test.ts`

**Interfaces:**
- Consumes: `Routine`, `RoutineWithSteps`, `RecurrencePattern` from `@/types/actionable`; `groupRoutineSteps` from `@/lib/today/routineCollections`.
- Produces (later tasks rely on these exact names):

```ts
export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export const DAY_ORDER: DayKey[]

export interface RhythmCard {
  kind: 'collection' | 'cluster' | 'single'
  id: string                    // collection id, or `cluster-${firstRoutineId}`
  name: string | null           // null for unnamed clusters/singles
  startTime: string | null      // 'HH:MM:SS' of earliest member
  endTime: string | null        // 'HH:MM:SS' of latest member
  routines: Routine[]           // collection steps, cluster members, or [the single]
  suggestedName?: string        // set when kind==='cluster' && routines.length>=3
}

export interface RhythmModel {
  daily: { timed: RhythmCard[]; anytime: Routine[] }
  week: { days: Record<DayKey, Routine[]>; sometime: Routine[] }
  sometimes: Routine[]
  seasonal: Routine[]
  stepCounts: Record<string, number>   // collectionId -> step count
}

export function minutesOf(t: string | null): number | null
export function memberIdsOf(r: Routine): string[]
export function buildRhythmModel(routines: Routine[], opts?: { memberId?: string | null }): RhythmModel
```

- [ ] **Step 1: Write the failing tests**

Create `src/components/routine/rhythm/rhythmModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRhythmModel, minutesOf } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`,
    user_id: 'u1',
    name: `Routine ${seq}`,
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    context: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('minutesOf', () => {
  it('parses HH:MM:SS and rejects null', () => {
    expect(minutesOf('06:30:00')).toBe(390)
    expect(minutesOf(null)).toBeNull()
  })
})

describe('buildRhythmModel bucketing', () => {
  it('puts timed daily routines on the arc and untimed in anytime', () => {
    const m = buildRhythmModel([
      mk({ id: 'a', time_of_day: '06:30:00' }),
      mk({ id: 'b', time_of_day: null }),
    ])
    expect(m.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(['a'])
    expect(m.daily.anytime.map(r => r.id)).toEqual(['b'])
  })

  it('treats weekly with >=5 days as daily, fewer as week-strip', () => {
    const m = buildRhythmModel([
      mk({ id: 'wd', recurrence_pattern: { type: 'weekly', days: ['mon','tue','wed','thu','fri'] }, time_of_day: '17:15:00' }),
      mk({ id: 'w2', recurrence_pattern: { type: 'weekly', days: ['mon','wed'] } }),
    ])
    expect(m.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(['wd'])
    expect(m.week.days.mon.map(r => r.id)).toEqual(['w2'])
    expect(m.week.days.wed.map(r => r.id)).toEqual(['w2'])
  })

  it('puts weekly-without-days into sometime-this-week', () => {
    const m = buildRhythmModel([mk({ id: 'w', recurrence_pattern: { type: 'weekly' } })])
    expect(m.week.sometime.map(r => r.id)).toEqual(['w'])
  })

  it('puts monthly/yearly/specific_days into sometimes', () => {
    const m = buildRhythmModel([
      mk({ id: 'mo', recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
      mk({ id: 'sp', recurrence_pattern: { type: 'specific_days', dates: ['2026-08-01'] } }),
    ])
    expect(m.sometimes.map(r => r.id).sort()).toEqual(['mo', 'sp'])
  })

  it('sends paused (reference) top-level routines to seasonal regardless of recurrence', () => {
    const m = buildRhythmModel([
      mk({ id: 'p', visibility: 'reference', time_of_day: '07:00:00' }),
    ])
    expect(m.seasonal.map(r => r.id)).toEqual(['p'])
    expect(m.daily.timed).toHaveLength(0)
  })

  it('never buckets steps as their own items but counts them per collection', () => {
    const m = buildRhythmModel([
      mk({ id: 'parent', name: 'School AM', time_of_day: '07:00:00' }),
      mk({ id: 's1', parent_routine_id: 'parent' }),
      mk({ id: 's2', parent_routine_id: 'parent' }),
    ])
    const all = [
      ...m.daily.timed.map(c => c.id),
      ...m.daily.anytime.map(r => r.id),
      ...m.week.sometime.map(r => r.id),
      ...m.sometimes.map(r => r.id),
    ]
    expect(all).not.toContain('s1')
    expect(m.stepCounts['parent']).toBe(2)
    const card = m.daily.timed.find(c => c.id === 'parent')
    expect(card?.kind).toBe('collection')
    expect(card?.routines.map(r => r.id)).toEqual(['s1', 's2'])
  })
})

describe('buildRhythmModel clustering', () => {
  it('clusters loose daily routines within 45 minutes, splits on bigger gaps', () => {
    const m = buildRhythmModel([
      mk({ id: 'a', time_of_day: '06:30:00' }),
      mk({ id: 'b', time_of_day: '07:00:00' }),
      mk({ id: 'c', time_of_day: '09:00:00' }),
    ])
    expect(m.daily.timed).toHaveLength(2)
    expect(m.daily.timed[0]).toMatchObject({ kind: 'cluster', startTime: '06:30:00', endTime: '07:00:00' })
    expect(m.daily.timed[1]).toMatchObject({ kind: 'single' })
  })

  it('suggests a name only for clusters of 3+', () => {
    const m = buildRhythmModel([
      mk({ time_of_day: '19:00:00' }),
      mk({ time_of_day: '19:05:00' }),
      mk({ time_of_day: '19:10:00' }),
    ])
    expect(m.daily.timed[0].suggestedName).toBe('Bedtime')
    const m2 = buildRhythmModel([
      mk({ time_of_day: '06:00:00' }),
      mk({ time_of_day: '06:10:00' }),
    ])
    expect(m2.daily.timed[0].suggestedName).toBeUndefined()
  })

  it('never merges a collection into a cluster', () => {
    const m = buildRhythmModel([
      mk({ id: 'coll', time_of_day: '06:45:00' }),
      mk({ id: 'st', parent_routine_id: 'coll' }),
      mk({ id: 'loose', time_of_day: '06:50:00' }),
    ])
    expect(m.daily.timed).toHaveLength(2)
    expect(m.daily.timed.find(c => c.id === 'coll')?.kind).toBe('collection')
  })

  it('sorts arc cards by start time', () => {
    const m = buildRhythmModel([
      mk({ id: 'late', time_of_day: '18:00:00' }),
      mk({ id: 'early', time_of_day: '06:00:00' }),
    ])
    expect(m.daily.timed.map(c => c.routines[0].id)).toEqual(['early', 'late'])
  })
})

describe('buildRhythmModel person filter', () => {
  it('filters by assigned_to_all with legacy assigned_to fallback', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'multi', assigned_to_all: ['iris'], time_of_day: '09:00:00' }),
        mk({ id: 'legacy', assigned_to: 'iris', assigned_to_all: null, time_of_day: '10:30:00' }),
        mk({ id: 'other', assigned_to_all: ['scott'], time_of_day: '11:00:00' }),
        mk({ id: 'nobody', time_of_day: '12:00:00' }),
      ],
      { memberId: 'iris' },
    )
    const ids = m.daily.timed.flatMap(c => c.routines.map(r => r.id))
    expect(ids.sort()).toEqual(['legacy', 'multi'])
  })

  it('keeps a collection when any step matches the member', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'coll', time_of_day: '07:00:00' }),
        mk({ id: 'st', parent_routine_id: 'coll', assigned_to_all: ['kaleb'] }),
      ],
      { memberId: 'kaleb' },
    )
    expect(m.daily.timed.map(c => c.id)).toEqual(['coll'])
  })

  it('shows unassigned routines only under Everyone', () => {
    const all = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })])
    const iris = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })], { memberId: 'iris' })
    expect(all.daily.timed).toHaveLength(1)
    expect(iris.daily.timed).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/rhythm-page
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/components/routine/rhythm/rhythmModel.test.ts
```

Expected: FAIL — cannot resolve `./rhythmModel`.

- [ ] **Step 3: Implement `rhythmModel.ts`**

```ts
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { groupRoutineSteps } from '@/lib/today/routineCollections'

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export interface RhythmCard {
  kind: 'collection' | 'cluster' | 'single'
  id: string
  name: string | null
  startTime: string | null
  endTime: string | null
  routines: Routine[]
  suggestedName?: string
}

export interface RhythmModel {
  daily: { timed: RhythmCard[]; anytime: Routine[] }
  week: { days: Record<DayKey, Routine[]>; sometime: Routine[] }
  sometimes: Routine[]
  seasonal: Routine[]
  stepCounts: Record<string, number>
}

const CLUSTER_GAP_MIN = 45

export function minutesOf(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function memberIdsOf(r: Routine): string[] {
  if (r.assigned_to_all && r.assigned_to_all.length > 0) return r.assigned_to_all
  return r.assigned_to ? [r.assigned_to] : []
}

/** Which zone a recurrence pattern belongs to. Weekly with >=5 days is daily-ish. */
function zoneOf(p: RecurrencePattern): 'daily' | 'week' | 'sometimes' {
  if (p.type === 'daily') return 'daily'
  if (p.type === 'weekly') {
    if (p.days && p.days.length >= 5) return 'daily'
    return 'week'
  }
  return 'sometimes'
}

function suggestName(startMinutes: number): string {
  if (startMinutes < 11 * 60) return 'Morning'
  if (startMinutes < 15 * 60) return 'Midday'
  if (startMinutes < 17.5 * 60) return 'After School'
  if (startMinutes < 19 * 60) return 'Evening'
  return 'Bedtime'
}

export function buildRhythmModel(
  routines: Routine[],
  opts: { memberId?: string | null } = {},
): RhythmModel {
  const { collections, standalone } = groupRoutineSteps(routines)
  const stepCounts: Record<string, number> = {}
  for (const c of collections) stepCounts[c.id] = c.steps.length

  const memberId = opts.memberId ?? null
  const keep = (r: Routine, steps: Routine[] = []): boolean => {
    if (!memberId) return true
    return [r, ...steps].some(x => memberIdsOf(x).includes(memberId))
  }

  const topLevel: { routine: Routine; steps: Routine[] }[] = [
    ...collections.filter(c => keep(c, c.steps)).map(c => ({ routine: c as Routine, steps: c.steps })),
    ...standalone.filter(r => keep(r)).map(r => ({ routine: r, steps: [] as Routine[] })),
  ]

  const emptyDays = (): Record<DayKey, Routine[]> =>
    ({ sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] })

  const model: RhythmModel = {
    daily: { timed: [], anytime: [] },
    week: { days: emptyDays(), sometime: [] },
    sometimes: [],
    seasonal: [],
    stepCounts,
  }

  const looseTimedDaily: Routine[] = []

  for (const { routine, steps } of topLevel) {
    if (routine.visibility === 'reference') {
      model.seasonal.push(routine)
      continue
    }
    const zone = zoneOf(routine.recurrence_pattern)
    if (zone === 'daily') {
      if (steps.length > 0) {
        model.daily.timed.push({
          kind: 'collection',
          id: routine.id,
          name: routine.name,
          startTime: routine.time_of_day,
          endTime: routine.time_of_day,
          routines: steps,
        })
      } else if (routine.time_of_day) {
        looseTimedDaily.push(routine)
      } else {
        model.daily.anytime.push(routine)
      }
    } else if (zone === 'week') {
      const days = (routine.recurrence_pattern.days ?? []) as DayKey[]
      const valid = days.filter(d => DAY_ORDER.includes(d))
      if (valid.length === 0) model.week.sometime.push(routine)
      else for (const d of valid) model.week.days[d].push(routine)
    } else {
      model.sometimes.push(routine)
    }
  }

  // Greedy time clustering of loose timed daily routines.
  looseTimedDaily.sort((a, b) => (minutesOf(a.time_of_day) ?? 0) - (minutesOf(b.time_of_day) ?? 0))
  let current: Routine[] = []
  const flush = () => {
    if (current.length === 0) return
    const start = current[0].time_of_day
    const end = current[current.length - 1].time_of_day
    const card: RhythmCard = {
      kind: current.length === 1 ? 'single' : 'cluster',
      id: current.length === 1 ? current[0].id : `cluster-${current[0].id}`,
      name: current.length === 1 ? current[0].name : null,
      startTime: start,
      endTime: end,
      routines: current,
    }
    if (card.kind === 'cluster' && current.length >= 3) {
      card.suggestedName = suggestName(minutesOf(start) ?? 0)
    }
    model.daily.timed.push(card)
    current = []
  }
  for (const r of looseTimedDaily) {
    if (current.length === 0) { current = [r]; continue }
    const prev = minutesOf(current[current.length - 1].time_of_day) ?? 0
    const cur = minutesOf(r.time_of_day) ?? 0
    if (cur - prev > CLUSTER_GAP_MIN) flush()
    current.length === 0 ? (current = [r]) : current.push(r)
  }
  flush()

  model.daily.timed.sort(
    (a, b) => (minutesOf(a.startTime) ?? 24 * 60) - (minutesOf(b.startTime) ?? 24 * 60),
  )
  return model
}
```

Note: within each day column and shelf, keep insertion order (already time-ordered enough); do NOT add sort dropdowns.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/routine/rhythm/rhythmModel.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/rhythmModel.ts src/components/routine/rhythm/rhythmModel.test.ts
git commit -m "feat(rhythm): pure bucketing + clustering model for the Rhythm page"
```

---

### Task 2: Tend heuristics

**Files:**
- Create: `src/components/routine/rhythm/tendHeuristics.ts`
- Test: `src/components/routine/rhythm/tendHeuristics.test.ts`

**Interfaces:**
- Consumes: `Routine` from `@/types/actionable`.
- Produces:

```ts
export type TendFinding =
  | { kind: 'lookalike'; ids: string[]; names: string[] }
  | { kind: 'missing-domain'; ids: string[] }
  | { kind: 'unfinished-name'; id: string; name: string }

export function findTend(routines: Routine[]): TendFinding[]
```

Order: lookalike groups first, then one missing-domain finding (if any), then unfinished names. Only **top-level, active** routines are examined (steps and paused are exempt — except missing-domain, which covers active top-level only too).

- [ ] **Step 1: Write the failing tests**

Create `src/components/routine/rhythm/tendHeuristics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findTend } from './tendHeuristics'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, raw_input: null,
    show_on_timeline: true, context: 'family',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('findTend lookalikes', () => {
  it('groups the plant-watering trio (substring token match)', () => {
    const findings = findTend([
      mk('Water plants', { id: 'a' }),
      mk('Water houseplants every Sunday', { id: 'b' }),
      mk('Water the plans every week', { id: 'c' }),
      mk('Walk Jax', { id: 'd' }),
    ])
    const look = findings.filter(f => f.kind === 'lookalike')
    expect(look).toHaveLength(1)
    expect(look[0].kind === 'lookalike' && look[0].ids.sort()).toEqual(['a', 'b', 'c'])
  })

  it('pairs dog feed/water overlap but not single-token overlap', () => {
    const findings = findTend([
      mk('Feed and water the dog', { id: 'a' }),
      mk("Fill the dog's water bowl", { id: 'b' }),
      mk('Walk the dog', { id: 'c' }),
    ])
    const look = findings.filter(f => f.kind === 'lookalike')
    expect(look).toHaveLength(1)
    expect(look[0].kind === 'lookalike' && look[0].ids.sort()).toEqual(['a', 'b'])
  })

  it('does not flag ordinary distinct routines', () => {
    const findings = findTend([mk('Walk Jax'), mk('Food shopping'), mk('PT Exercises')])
    expect(findings.filter(f => f.kind === 'lookalike')).toHaveLength(0)
  })
})

describe('findTend missing domain', () => {
  it('collects null-context active top-level routines into one finding', () => {
    const findings = findTend([
      mk('laundry', { id: 'a', context: null }),
      mk('Water plants2', { id: 'b', context: null }),
      mk('Tagged', { context: 'family' }),
      mk('Paused untagged', { context: null, visibility: 'reference' }),
      mk('Step untagged', { context: null, parent_routine_id: 'x' }),
    ])
    const md = findings.find(f => f.kind === 'missing-domain')
    expect(md?.kind === 'missing-domain' && md.ids.sort()).toEqual(['a', 'b'])
  })
})

describe('findTend unfinished names', () => {
  it('flags names ending in a dangling word', () => {
    const findings = findTend([
      mk('Do kitchen Laundry in the', { id: 'a' }),
      mk('Kids clean rooms every', { id: 'b' }),
      mk('Family reading time every', { id: 'c' }),
      mk('Clean kitchen after dinner', { id: 'd' }),
    ])
    const unf = findings.filter(f => f.kind === 'unfinished-name')
    expect(unf.map(f => f.kind === 'unfinished-name' && f.id).sort()).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/routine/rhythm/tendHeuristics.test.ts
```

Expected: FAIL — cannot resolve `./tendHeuristics`.

- [ ] **Step 3: Implement `tendHeuristics.ts`**

```ts
import type { Routine } from '@/types/actionable'

export type TendFinding =
  | { kind: 'lookalike'; ids: string[]; names: string[] }
  | { kind: 'missing-domain'; ids: string[] }
  | { kind: 'unfinished-name'; id: string; name: string }

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'of', 'with',
  'every', 'each', 'my', 'our', 'his', 'her', 'their', 'after', 'before', 'from',
  'day', 'week', 'weekly', 'daily', 'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
])

const DANGLING = new Set(['the', 'a', 'an', 'in', 'to', 'every', 'for', 'with', 'my', 'our', 'and', 'of'])

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

/** Two tokens match when equal or one contains the other (plant ~ houseplant). */
function tokenMatch(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a)
}

function sharedCount(a: string[], b: string[]): number {
  let n = 0
  const used = new Set<number>()
  for (const t of a) {
    const j = b.findIndex((u, i) => !used.has(i) && tokenMatch(t, u))
    if (j >= 0) { used.add(j); n += 1 }
  }
  return n
}

export function findTend(routines: Routine[]): TendFinding[] {
  const eligible = routines.filter(r => !r.parent_routine_id && r.visibility === 'active')

  // Look-alikes: union-find over pairs sharing >=2 significant tokens.
  const toks = eligible.map(r => tokens(r.name))
  const parent = eligible.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      if (sharedCount(toks[i], toks[j]) >= 2) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, number[]>()
  eligible.forEach((_, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), i])
  })

  const findings: TendFinding[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    findings.push({
      kind: 'lookalike',
      ids: members.map(i => eligible[i].id),
      names: members.map(i => eligible[i].name),
    })
  }

  const missing = eligible.filter(r => r.context == null)
  if (missing.length > 0) {
    findings.push({ kind: 'missing-domain', ids: missing.map(r => r.id) })
  }

  for (const r of eligible) {
    const words = r.name.trim().toLowerCase().split(/\s+/)
    const last = words[words.length - 1]
    if (words.length >= 2 && DANGLING.has(last)) {
      findings.push({ kind: 'unfinished-name', id: r.id, name: r.name })
    }
  }
  return findings
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/routine/rhythm/tendHeuristics.test.ts
```

Expected: all PASS. If the plant-trio test fails on "plans"/"plant" (plans → "plan" after singularize; `plant`.includes(`plan`) → true), that's the intended path — debug from actual token output, don't loosen the threshold below 2.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/tendHeuristics.ts src/components/routine/rhythm/tendHeuristics.test.ts
git commit -m "feat(rhythm): heuristic tend findings — lookalikes, missing domain, unfinished names"
```

---

### Task 3: Daily Arc + Week Strip components

**Files:**
- Create: `src/components/routine/rhythm/DailyArc.tsx`
- Create: `src/components/routine/rhythm/WeekStrip.tsx`
- Create: `src/components/routine/rhythm/format.ts`
- Test: `src/components/routine/rhythm/DailyArc.test.tsx`
- Test: `src/components/routine/rhythm/WeekStrip.test.tsx`

**Interfaces:**
- Consumes: `RhythmCard`, `DayKey`, `DAY_ORDER`, `minutesOf` from `./rhythmModel`; `AssigneeAvatar` from `@/components/family/AssigneeAvatar`; `FamilyMember` from `@/types/family`.
- Produces:

```ts
// format.ts
export function formatClock(t: string | null): string | null       // '06:30:00' -> '6:30'
export function formatRange(start: string | null, end: string | null): string | null // '6:30 – 7:00' or single time

// DailyArc.tsx
export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean          // search predicate; card matches if any member matches
  nowMinutes: number                        // injected for testability
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  onNameCluster: (card: RhythmCard, name: string) => void
}
export function DailyArc(props: DailyArcProps): JSX.Element | null

// WeekStrip.tsx
export interface WeekStripProps {
  days: Record<DayKey, Routine[]>
  sometime: Routine[]
  stepCounts: Record<string, number>
  matches: (r: Routine) => boolean
  todayKey: DayKey                          // injected for testability
  onOpenRoutine: (r: Routine) => void
}
export function WeekStrip(props: WeekStripProps): JSX.Element | null
```

- [ ] **Step 1: Write `format.ts`** (no test file — covered via component tests)

```ts
export function formatClock(t: string | null): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}` : `${hour12}`
}

export function formatRange(start: string | null, end: string | null): string | null {
  const s = formatClock(start)
  const e = formatClock(end)
  if (!s) return null
  if (!e || e === s) return s
  return `${s} – ${e}`
}
```

- [ ] **Step 2: Write the failing component tests**

`src/components/routine/rhythm/DailyArc.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DailyArc } from './DailyArc'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const base = {
  familyMembers: [],
  matches: () => true,
  nowMinutes: 12 * 60,
  onOpenCollection: vi.fn(),
  onOpenRoutine: vi.fn(),
  onNameCluster: vi.fn(),
}

describe('DailyArc', () => {
  it('renders cluster cards with time range and members', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '06:30:00', endTime: '07:00:00',
      routines: [mk({ name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ name: 'Feed Jax', time_of_day: '07:00:00' })],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Walk Jax')).toBeInTheDocument()
    expect(screen.getByText('6:30 – 7')).toBeInTheDocument()
  })

  it('shows the name nudge for suggested clusters and submits a name', () => {
    const onNameCluster = vi.fn()
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({}), mk({})],
    }
    render(<DailyArc {...base} onNameCluster={onNameCluster} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /name this rhythm/i }))
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('Bedtime')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameCluster).toHaveBeenCalledWith(card, 'Bedtime')
  })

  it('renders anytime pills and opens the routine on click', () => {
    const onOpenRoutine = vi.fn()
    const pt = mk({ name: 'PT Exercises' })
    render(<DailyArc {...base} onOpenRoutine={onOpenRoutine} cards={[]} anytime={[pt]} />)
    fireEvent.click(screen.getByText('PT Exercises'))
    expect(onOpenRoutine).toHaveBeenCalledWith(pt)
  })

  it('dims non-matching routines when searching', () => {
    const card: RhythmCard = {
      kind: 'single', id: 'a', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'a', name: 'Walk Jax' })],
    }
    render(<DailyArc {...base} matches={() => false} cards={[card]} anytime={[]} />)
    expect(screen.getByTestId('arc-card-a').className).toContain('opacity-30')
  })
})
```

`src/components/routine/rhythm/WeekStrip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekStrip } from './WeekStrip'
import type { DayKey } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'weekly', days: ['sat'] },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const empty: Record<DayKey, Routine[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }
const base = { stepCounts: {}, matches: () => true, todayKey: 'mon' as DayKey, onOpenRoutine: vi.fn(), sometime: [] }

describe('WeekStrip', () => {
  it('marks quiet days, full days, and today', () => {
    const sat = [mk({}), mk({}), mk({}), mk({})]
    render(<WeekStrip {...base} days={{ ...empty, sat }} />)
    expect(screen.getAllByText('quiet').length).toBeGreaterThan(0)
    expect(screen.getByText(/full/)).toBeInTheDocument()
    expect(screen.getByTestId('day-mon').className).toContain('border-')
  })

  it('labels biweekly routines and opens on click', () => {
    const onOpenRoutine = vi.fn()
    const lib = mk({ name: 'Library trip', recurrence_pattern: { type: 'weekly', days: ['thu'], interval: 2 } })
    render(<WeekStrip {...base} onOpenRoutine={onOpenRoutine} days={{ ...empty, thu: [lib] }} />)
    expect(screen.getByText(/every 2 wks/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Library trip'))
    expect(onOpenRoutine).toHaveBeenCalledWith(lib)
  })

  it('renders the sometime-this-week pocket', () => {
    render(<WeekStrip {...base} days={empty} sometime={[mk({ name: 'Clara nails', recurrence_pattern: { type: 'weekly' } })]} />)
    expect(screen.getByText(/sometime this week/i)).toBeInTheDocument()
    expect(screen.getByText('Clara nails')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/components/routine/rhythm/DailyArc.test.tsx src/components/routine/rhythm/WeekStrip.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `DailyArc.tsx`**

```tsx
import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { Sparkles } from 'lucide-react'
import type { RhythmCard } from './rhythmModel'
import { minutesOf } from './rhythmModel'
import { formatRange, formatClock } from './format'

export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  nowMinutes: number
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  onNameCluster: (card: RhythmCard, name: string) => void
}

const ARC_START = 6 * 60   // 6:00
const ARC_END = 21.5 * 60  // 21:30

function pct(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, ARC_START), ARC_END)
  return ((clamped - ARC_START) / (ARC_END - ARC_START)) * 100
}

const RULER_MARKS: { label: string; minutes: number }[] = [
  { label: '6 am', minutes: 6 * 60 },
  { label: '9 am', minutes: 9 * 60 },
  { label: 'noon', minutes: 12 * 60 },
  { label: '4 pm', minutes: 16 * 60 },
  { label: '7 pm', minutes: 19 * 60 },
  { label: '9 pm', minutes: 21 * 60 },
]

function NameNudge({ card, onNameCluster }: { card: RhythmCard; onNameCluster: DailyArcProps['onNameCluster'] }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(card.suggestedName ?? '')
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 w-full text-left flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5
                   text-xs text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        These travel together — name this rhythm?
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={name}
      onChange={e => setName(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && name.trim()) onNameCluster(card, name.trim())
        if (e.key === 'Escape') setEditing(false)
      }}
      className="mt-2 w-full rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm focus:outline-none
                 focus:ring-2 focus:ring-amber-400"
      placeholder="Name this rhythm"
    />
  )
}

export function DailyArc({ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine, onNameCluster }: DailyArcProps) {
  if (cards.length === 0 && anytime.length === 0) return null

  const membersOf = (r: Routine): FamilyMember[] => {
    const ids = r.assigned_to_all?.length ? r.assigned_to_all : r.assigned_to ? [r.assigned_to] : []
    return ids.map(id => familyMembers.find(m => m.id === id)).filter((m): m is FamilyMember => !!m)
  }

  const cardMatches = (c: RhythmCard) =>
    c.routines.some(matches) || (c.name != null && matches({ name: c.name } as Routine))

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Time ruler */}
      <div className="relative h-8 rounded-full border border-[var(--color-border,#eadfcc)] mb-4
                      bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60">
        {RULER_MARKS.map(m => (
          <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2"
                style={{ left: `${pct(m.minutes)}%` }}>
            {m.label}
          </span>
        ))}
        <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600" style={{ left: `${pct(nowMinutes)}%` }} />
        <span className="absolute -top-5 text-[10px] font-bold text-orange-600 -translate-x-1/2"
              style={{ left: `${pct(nowMinutes)}%` }}>
          NOW
        </span>
      </div>

      {/* Rhythm cards */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-start">
        {cards.map(card => (
          <div
            key={card.id}
            data-testid={`arc-card-${card.id}`}
            className={`flex-1 min-w-0 rounded-2xl border bg-white p-4 transition-all
                        ${card.kind === 'cluster' ? 'border-dashed border-amber-300' : 'border-neutral-100 shadow-sm'}
                        ${cardMatches(card) ? '' : 'opacity-30'}`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              {card.kind === 'collection' ? (
                <button
                  onClick={() => onOpenCollection(card.id)}
                  className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors truncate"
                >
                  {card.name}
                </button>
              ) : (
                <span className="font-display font-semibold text-neutral-600 truncate">
                  {card.name ?? 'Unnamed cluster'}
                </span>
              )}
              <span className="text-[11px] text-neutral-400 flex-shrink-0">{formatRange(card.startTime, card.endTime)}</span>
            </div>

            <ul className="flex flex-col gap-1">
              {card.routines.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => onOpenRoutine(r)}
                    className={`w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1
                                hover:bg-neutral-50 transition-colors ${matches(r) ? 'text-neutral-700' : 'opacity-30'}`}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {r.time_of_day && card.kind !== 'single' && (
                        <span className="text-[10px] text-neutral-400">{formatClock(r.time_of_day)}</span>
                      )}
                      <span className="flex -space-x-1.5">
                        {membersOf(r).map(m => (
                          <AssigneeAvatar key={m.id} member={m} size="xs" className="ring-1 ring-white" />
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {card.suggestedName && <NameNudge card={card} onNameCluster={onNameCluster} />}
          </div>
        ))}
      </div>

      {/* Anytime row */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="text-xs italic text-neutral-400">anytime today —</span>
          {anytime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

Note: `AssigneeAvatar` — check its accepted `size` values before using `"xs"`; if only `"sm"` exists, use `"sm"`.

- [ ] **Step 5: Implement `WeekStrip.tsx`**

```tsx
import type { Routine } from '@/types/actionable'
import type { DayKey } from './rhythmModel'
import { DAY_ORDER } from './rhythmModel'

export interface WeekStripProps {
  days: Record<DayKey, Routine[]>
  sometime: Routine[]
  stepCounts: Record<string, number>
  matches: (r: Routine) => boolean
  todayKey: DayKey
  onOpenRoutine: (r: Routine) => void
}

const DAY_LABEL: Record<DayKey, string> = {
  sun: 'SUN', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
}

const FULL_THRESHOLD = 4

function Chip({ r, stepCounts, matches, onOpen }: {
  r: Routine; stepCounts: Record<string, number>; matches: (r: Routine) => boolean; onOpen: (r: Routine) => void
}) {
  const steps = stepCounts[r.id]
  const biweekly = r.recurrence_pattern.type === 'weekly' && r.recurrence_pattern.interval === 2
  return (
    <button
      onClick={() => onOpen(r)}
      className={`w-full text-left rounded-lg bg-emerald-50/60 px-2 py-1.5 text-xs text-neutral-700
                  hover:bg-emerald-100/70 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
    >
      <span className="line-clamp-2">{r.name}</span>
      {(steps || biweekly) && (
        <span className="block text-[10px] text-neutral-400">
          {steps ? `${steps} steps` : ''}{steps && biweekly ? ' · ' : ''}{biweekly ? 'every 2 wks' : ''}
        </span>
      )}
    </button>
  )
}

export function WeekStrip({ days, sometime, stepCounts, matches, todayKey, onOpenRoutine }: WeekStripProps) {
  const total = DAY_ORDER.reduce((n, d) => n + days[d].length, 0)
  if (total === 0 && sometime.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Through the week</h2>
      <div className="grid grid-cols-7 gap-2 overflow-x-auto min-w-0">
        {DAY_ORDER.map(day => {
          const items = days[day]
          const isToday = day === todayKey
          return (
            <div
              key={day}
              data-testid={`day-${day}`}
              className={`rounded-xl p-2 min-w-[92px] ${
                isToday
                  ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                  : 'border border-neutral-100 bg-white'
              }`}
            >
              <div className={`text-[10px] font-bold mb-1.5 ${isToday ? 'text-emerald-800' : 'text-neutral-400'}`}>
                {DAY_LABEL[day]}
                {isToday && ' · today'}
                {items.length >= FULL_THRESHOLD && <span className="text-orange-600"> · full</span>}
              </div>
              {items.length === 0 ? (
                <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map(r => (
                    <Chip key={`${day}-${r.id}`} r={r} stepCounts={stepCounts} matches={matches} onOpen={onOpenRoutine} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {sometime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-xs italic text-neutral-400">sometime this week —</span>
          {sometime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/routine/rhythm/DailyArc.test.tsx src/components/routine/rhythm/WeekStrip.test.tsx
```

Expected: all PASS. (If `AssigneeAvatar` has no `size="xs"`, switch to `size="sm"` and re-run.)

- [ ] **Step 7: Commit**

```bash
git add src/components/routine/rhythm/
git commit -m "feat(rhythm): DailyArc and WeekStrip zone components"
```

---

### Task 4: Sometimes shelf, Seasonal shelf, Tend card

**Files:**
- Create: `src/components/routine/rhythm/SometimesShelf.tsx`
- Create: `src/components/routine/rhythm/SeasonalShelf.tsx`
- Create: `src/components/routine/rhythm/TendCard.tsx`
- Test: `src/components/routine/rhythm/shelves.test.tsx`

**Interfaces:**
- Consumes: `TendFinding` from `./tendHeuristics`; `Routine` from `@/types/actionable`; `Leaf`, `Sparkles` from `lucide-react`.
- Produces:

```ts
export function SometimesShelf(props: {
  routines: Routine[]
  matches: (r: Routine) => boolean
  onOpenRoutine: (r: Routine) => void
}): JSX.Element | null

export function SeasonalShelf(props: {
  routines: Routine[]
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}): JSX.Element | null

export function TendCard(props: {
  findings: TendFinding[]
  routines: Routine[]                                  // to resolve names by id
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
}): JSX.Element | null
```

Behavior pins:
- `SometimesShelf`: pill per routine with a frequency caption — `monthly` → "monthly", `yearly` → "yearly", `specific_days` → "N dates", `since_last` with `interval`+`unit` → "every N unit". Null render when empty.
- `SeasonalShelf`: title is "Waiting for {Month}" using the **earliest non-null `paused_until`**'s month name; "Resting" when all null. Body: "{n} routines are resting — {first 4 names}…". `Wake all` button calls `onWakeAll` once. An expand toggle reveals individual rows (name + wake-one via `onOpenRoutine` opening the panel is enough — individual wake happens in the panel). Null render when empty. Uses `Leaf` icon, not 🍂.
- `TendCard`: shows first 3 findings. Lookalike → names joined with " / ", a "Merge" button that expands an inline survivor picker (radio list of names, confirm button "Keep this one, remove N"). Missing-domain → "N routines have no domain — stamp them?", "Review" expands a stamping strip: one routine at a time (name + Work/Family/Personal buttons), advancing through `ids`; each tap calls `onStampDomain`. Unfinished-name → inline rename input (Enter → `onRename`) + "Let go" button (inline confirm: first click shows "Sure? Remove", second calls `onLetGo`). Null render when no findings.

- [ ] **Step 1: Write the failing tests** — `src/components/routine/rhythm/shelves.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SometimesShelf } from './SometimesShelf'
import { SeasonalShelf } from './SeasonalShelf'
import { TendCard } from './TendCard'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'monthly', day_of_month: 1 },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('SometimesShelf', () => {
  it('renders frequency captions and hides when empty', () => {
    const { container } = render(
      <SometimesShelf matches={() => true} onOpenRoutine={vi.fn()}
        routines={[mk('Pay FFG'), mk('Haircut', { recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' } })]} />
    )
    expect(screen.getByText(/monthly/)).toBeInTheDocument()
    expect(screen.getByText(/every 6 weeks/)).toBeInTheDocument()
    const { container: emptyC } = render(
      <SometimesShelf matches={() => true} onOpenRoutine={vi.fn()} routines={[]} />
    )
    expect(emptyC.firstChild).toBeNull()
    expect(container.firstChild).not.toBeNull()
  })
})

describe('SeasonalShelf', () => {
  it('titles by earliest paused_until month and wakes all', () => {
    const onWakeAll = vi.fn()
    render(
      <SeasonalShelf onWakeAll={onWakeAll} onOpenRoutine={vi.fn()}
        routines={[
          mk('Walk to school', { visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' }),
          mk('FFG pickup', { visibility: 'reference', paused_until: '2026-10-01T00:00:00Z' }),
        ]} />
    )
    expect(screen.getByText(/Waiting for September/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onWakeAll).toHaveBeenCalledOnce()
  })

  it('says Resting when no paused_until dates', () => {
    render(
      <SeasonalShelf onWakeAll={vi.fn()} onOpenRoutine={vi.fn()}
        routines={[mk('Old thing', { visibility: 'reference' })]} />
    )
    expect(screen.getByText(/Resting/)).toBeInTheDocument()
  })
})

describe('TendCard', () => {
  it('merge flow: pick survivor, confirm fires onMerge with losers', () => {
    const onMerge = vi.fn()
    const a = mk('Water plants', { id: 'a' })
    const b = mk('Water houseplants', { id: 'b' })
    render(
      <TendCard routines={[a, b]} onMerge={onMerge} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={vi.fn()}
        findings={[{ kind: 'lookalike', ids: ['a', 'b'], names: ['Water plants', 'Water houseplants'] }]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByLabelText('Water plants'))
    fireEvent.click(screen.getByRole('button', { name: /keep this one/i }))
    expect(onMerge).toHaveBeenCalledWith('a', ['b'])
  })

  it('stamping strip advances through missing-domain ids', () => {
    const onStampDomain = vi.fn()
    const a = mk('laundry', { id: 'a', context: null })
    const b = mk('dishes', { id: 'b', context: null })
    render(
      <TendCard routines={[a, b]} onMerge={vi.fn()} onStampDomain={onStampDomain} onRename={vi.fn()} onLetGo={vi.fn()}
        findings={[{ kind: 'missing-domain', ids: ['a', 'b'] }]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /review/i }))
    expect(screen.getByText('laundry')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /family/i }))
    expect(onStampDomain).toHaveBeenCalledWith('a', 'family')
    expect(screen.getByText('dishes')).toBeInTheDocument()
  })

  it('renders nothing when no findings', () => {
    const { container } = render(
      <TendCard routines={[]} findings={[]} onMerge={vi.fn()} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/routine/rhythm/shelves.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three components**

`SometimesShelf.tsx`:

```tsx
import type { Routine } from '@/types/actionable'

function caption(r: Routine): string {
  const p = r.recurrence_pattern
  if (p.type === 'monthly') return 'monthly'
  if (p.type === 'yearly') return 'yearly'
  if (p.type === 'specific_days') return `${p.dates?.length ?? 0} dates`
  if (p.type === 'since_last' && p.interval && p.unit) return `every ${p.interval} ${p.unit}`
  return 'sometimes'
}

export function SometimesShelf({ routines, matches, onOpenRoutine }: {
  routines: Routine[]
  matches: (r: Routine) => boolean
  onOpenRoutine: (r: Routine) => void
}) {
  if (routines.length === 0) return null
  return (
    <section className="mb-6 rounded-2xl border border-neutral-100 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Sometimes</h2>
      <div className="flex flex-wrap gap-1.5">
        {routines.map(r => (
          <button
            key={r.id}
            onClick={() => onOpenRoutine(r)}
            className={`rounded-full bg-neutral-100/80 px-3 py-1 text-sm text-neutral-700 hover:bg-amber-100
                        transition-colors ${matches(r) ? '' : 'opacity-30'}`}
          >
            {r.name} <span className="text-neutral-400 text-xs">· {caption(r)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
```

`SeasonalShelf.tsx`:

```tsx
import { useState } from 'react'
import { Leaf, ChevronRight } from 'lucide-react'
import type { Routine } from '@/types/actionable'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function SeasonalShelf({ routines, onWakeAll, onOpenRoutine }: {
  routines: Routine[]
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (routines.length === 0) return null

  const dates = routines.map(r => r.paused_until).filter((d): d is string => !!d).sort()
  const title = dates.length > 0 ? `Waiting for ${MONTHS[new Date(dates[0]).getMonth()]}` : 'Resting'
  const preview = routines.slice(0, 4).map(r => r.name).join(', ')

  return (
    <section className="mb-6 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 text-left min-w-0">
          <Leaf className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">{title}</span>
          <ChevronRight className={`w-4 h-4 text-amber-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        <button
          onClick={onWakeAll}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Wake all
        </button>
      </div>
      <p className="mt-1.5 text-sm text-neutral-600">
        {routines.length} routine{routines.length === 1 ? '' : 's'} {routines.length === 1 ? 'is' : 'are'} resting — {preview}
        {routines.length > 4 ? '…' : ''}
      </p>
      {expanded && (
        <ul className="mt-3 flex flex-col gap-1">
          {routines.map(r => (
            <li key={r.id}>
              <button
                onClick={() => onOpenRoutine(r)}
                className="w-full text-left rounded-lg bg-white/70 px-3 py-1.5 text-sm text-neutral-600 hover:bg-white transition-colors"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`TendCard.tsx`:

```tsx
import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { TendFinding } from './tendHeuristics'

const DOMAINS = ['work', 'family', 'personal'] as const

function LookalikeRow({ finding, onMerge }: {
  finding: Extract<TendFinding, { kind: 'lookalike' }>
  onMerge: (survivorId: string, loserIds: string[]) => void
}) {
  const [picking, setPicking] = useState(false)
  const [survivor, setSurvivor] = useState<string | null>(null)
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm min-w-0 truncate">{finding.names.join(' / ')} — same job?</span>
        <button onClick={() => setPicking(v => !v)}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500 transition-colors flex-shrink-0">
          Merge
        </button>
      </div>
      {picking && (
        <div className="mt-2 flex flex-col gap-1">
          {finding.ids.map((id, i) => (
            <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`survivor-${finding.ids[0]}`} aria-label={finding.names[i]}
                     checked={survivor === id} onChange={() => setSurvivor(id)} />
              {finding.names[i]}
            </label>
          ))}
          <button
            disabled={!survivor}
            onClick={() => survivor && onMerge(survivor, finding.ids.filter(id => id !== survivor))}
            className="mt-1 self-start rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold
                       disabled:opacity-40 hover:bg-emerald-500 transition-colors"
          >
            Keep this one, remove {finding.ids.length - 1}
          </button>
        </div>
      )}
    </div>
  )
}

function StampRow({ finding, routines, onStampDomain }: {
  finding: Extract<TendFinding, { kind: 'missing-domain' }>
  routines: Routine[]
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
}) {
  const [reviewing, setReviewing] = useState(false)
  const [index, setIndex] = useState(0)
  const remaining = finding.ids.slice(index)
  const current = routines.find(r => r.id === remaining[0])
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{finding.ids.length} routines have no domain — stamp them?</span>
        {!reviewing && (
          <button onClick={() => setReviewing(true)}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500 transition-colors">
            Review
          </button>
        )}
      </div>
      {reviewing && current && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium min-w-0 truncate">{current.name}</span>
          <span className="flex gap-1 flex-shrink-0">
            {DOMAINS.map(d => (
              <button key={d}
                onClick={() => { onStampDomain(current.id, d); setIndex(i => i + 1) }}
                className="rounded-md bg-emerald-700 px-2 py-1 text-xs capitalize hover:bg-emerald-600 transition-colors">
                {d}
              </button>
            ))}
          </span>
        </div>
      )}
      {reviewing && !current && <p className="mt-2 text-xs text-emerald-300">All stamped.</p>}
    </div>
  )
}

function UnfinishedRow({ finding, onRename, onLetGo }: {
  finding: Extract<TendFinding, { kind: 'unfinished-name' }>
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
}) {
  const [name, setName] = useState(finding.name)
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2 flex items-center gap-2">
      <input value={name} onChange={e => setName(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onRename(finding.id, name.trim()) }}
             className="min-w-0 flex-1 rounded-md bg-emerald-950/50 px-2 py-1 text-sm focus:outline-none
                        focus:ring-1 focus:ring-emerald-400" />
      <button
        onClick={() => (confirming ? onLetGo(finding.id) : setConfirming(true))}
        className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs hover:bg-red-800 transition-colors flex-shrink-0"
      >
        {confirming ? 'Sure? Remove' : 'Let go'}
      </button>
    </div>
  )
}

export function TendCard({ findings, routines, onMerge, onStampDomain, onRename, onLetGo }: {
  findings: TendFinding[]
  routines: Routine[]
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
}) {
  if (findings.length === 0) return null
  const shown = findings.slice(0, 3)
  return (
    <section className="mb-6 rounded-2xl bg-[#33413a] p-4 text-emerald-50">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-display font-semibold">Worth tending</h2>
        <span className="rounded-full bg-emerald-800/70 px-2.5 py-0.5 text-[11px]">
          {findings.length} suggestion{findings.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map((f, i) => {
          if (f.kind === 'lookalike') return <LookalikeRow key={`l${i}`} finding={f} onMerge={onMerge} />
          if (f.kind === 'missing-domain') return <StampRow key={`m${i}`} finding={f} routines={routines} onStampDomain={onStampDomain} />
          return <UnfinishedRow key={`u${i}`} finding={f} onRename={onRename} onLetGo={onLetGo} />
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/routine/rhythm/shelves.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/
git commit -m "feat(rhythm): Sometimes/Seasonal shelves and Worth-tending card"
```

---

### Task 5: RhythmPage assembly + swap-in

**Files:**
- Create: `src/components/routine/RhythmPage.tsx`
- Modify: `src/components/lazy.ts:14-16` (point `RoutinesList` at `RhythmPage`)
- Delete: `src/components/routine/RoutinesListRedesign.tsx`, `src/components/routine/RoutinesListRedesign.test.tsx`
- Test: `src/components/routine/RhythmPage.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4; `TapRoutinePanel`/`TapStepPanel` from `@/components/surface/`; `PauseRoutineModal`; `groupRoutineSteps`; `PAGE_COLUMN` from `@/components/layout/pageLayout`; `AssigneeAvatar`.
- Produces: `export function RhythmPage(props: RhythmPageProps)` where `RhythmPageProps` is the **same prop contract as `RoutinesListProps`** in the old `RoutinesListRedesign.tsx` (copy the interface verbatim — `routines`, `loading`, `contacts`, `familyMembers`, `onCreateRoutine`, `onUpdateRoutine`, `onAddStep`, `onAddSteps`, `onReorderSteps`, `onPromoteStep`, `onDeleteStep`, `onDelete`, `onCreateCollection`, `onGroupIntoCollection`, `onBuildWithAI`). `RoutinesApp` needs **zero changes**.

Assembly behavior:
- **Masthead:** `font-display` title "Routines", subtitle `How your family runs — {weekday}, {month} {day}`; keep `Build with AI` + `New routine` buttons (drop `New step` and `Select` — cluster naming replaces grouping; a loose routine is created via New routine without steps).
- **People pills:** `Everyone` + one pill per `familyMembers` (sorted by `display_order`). State `memberId: string | null`. Passed to `buildRhythmModel`.
- **Search:** state `query`; global `keydown` listener active only when no `input`/`textarea`/`[contenteditable]` has focus and no panel is open; printable keys append, Backspace deletes, Escape clears. Masthead shows a search input bound to the same state (`Search` icon). `matches(r) = query === '' || r.name.toLowerCase().includes(q) || (stepNames of r's collection include q)`.
- **Zones:** `DailyArc` (with `nowMinutes` from `new Date()`), `WeekStrip` (`todayKey` from `new Date().getDay()` → `DAY_ORDER[i]`), `SometimesShelf`, `SeasonalShelf`, `TendCard` (from `findTend(routines)`).
- **Panels:** copy the `open` state machine + `TapRoutinePanel`/`TapStepPanel` overlay wiring from the old `RoutinesListRedesign.tsx` lines 199–218 and 799–845 verbatim (it already handles routine/standalone-step/step kinds).
- **Handlers:**
  - `onNameCluster(card, name)` → `onGroupIntoCollection(name, card.routines.map(r => r.id))`
  - Wake all → for each seasonal routine: `onUpdateRoutine(id, { visibility: 'active', paused_until: null })`
  - Merge → for each loser: `onDelete(loserId)` (survivor untouched)
  - Stamp → `onUpdateRoutine(id, { context })`
  - Rename → `onUpdateRoutine(id, { name })`; Let go → `onDelete(id)`
- **Empty state:** keep the old empty-state card (amber icon block) but with `RefreshCw` lucide icon and copy "No routines yet — capture your first routine and Symphony will start painting your week." CTA calls `onCreateCollection('New routine')` then opens the panel (same as old code).
- **Loading:** `loading && routines.length === 0` → centered "Loading your week…".

- [ ] **Step 1: Write the failing tests** — `src/components/routine/RhythmPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RhythmPage } from './RhythmPage'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: 'family',
    created_at: '', updated_at: '', ...over,
  }
}

const noop = { onCreateRoutine: vi.fn(), onAddStep: vi.fn(), onReorderSteps: vi.fn(), onPromoteStep: vi.fn() }

describe('RhythmPage', () => {
  it('renders all zones from a mixed routine set', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { time_of_day: '06:30:00' }),
          mk('PT Exercises'),
          mk('Food shopping', { recurrence_pattern: { type: 'weekly', days: ['sun'] } }),
          mk('Pay FFG', { recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
          mk('Walk to school', { visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' }),
        ]} />
    )
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeInTheDocument()
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.getByText('Through the week')).toBeInTheDocument()
    expect(screen.getByText('Sometimes')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for September/)).toBeInTheDocument()
  })

  it('type-anywhere search dims non-matching routines', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
          mk('Wash dishes', { id: 'dish', time_of_day: '20:00:00' }),
        ]} />
    )
    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'x' })
    expect(screen.getByTestId('arc-card-dish').className).toContain('opacity-30')
    expect(screen.getByTestId('arc-card-jax').className).not.toContain('opacity-30')
  })

  it('wake-all updates every seasonal routine', async () => {
    const onUpdateRoutine = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine}
        routines={[
          mk('A', { id: 'a', visibility: 'reference' }),
          mk('B', { id: 'b', visibility: 'reference' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onUpdateRoutine).toHaveBeenCalledWith('a', { visibility: 'active', paused_until: null })
    expect(onUpdateRoutine).toHaveBeenCalledWith('b', { visibility: 'active', paused_until: null })
  })

  it('person pill filters the arc', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        familyMembers={[{ id: 'iris', user_id: 'u1', name: 'Iris', initials: 'I', color: '#888', avatar_url: null, is_full_user: true, display_order: 1, created_at: '' } as never]}
        routines={[
          mk('Iris run', { id: 'run', time_of_day: '09:00:00', assigned_to_all: ['iris'] }),
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Iris' }))
    expect(screen.queryByTestId('arc-card-jax')).not.toBeInTheDocument()
    expect(screen.getByTestId('arc-card-run')).toBeInTheDocument()
  })

  it('naming a cluster calls onGroupIntoCollection with member ids', () => {
    const onGroupIntoCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onGroupIntoCollection={onGroupIntoCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /name this rhythm/i }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Bedtime', ['a', 'b', 'c'])
  })
})
```

(Import `render` from `@/test/test-utils` instead of `@testing-library/react` if the plain render trips on missing providers — check how `RoutinesListRedesign.test.tsx` did it before deleting, and mirror that. Note `TapRoutinePanel` uses `useRoutineStats`, which may need the test-utils providers; the panel only mounts on click, so plain render likely suffices.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/routine/RhythmPage.test.tsx
```

Expected: FAIL — `RhythmPage` not found.

- [ ] **Step 3: Implement `RhythmPage.tsx`**

Skeleton (the `open`-panel block is copied verbatim from `RoutinesListRedesign.tsx` — same state shape, same `TapRoutinePanel`/`TapStepPanel` props):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Sparkles, RefreshCw } from 'lucide-react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import type { Routine } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'
import { buildRhythmModel, DAY_ORDER, type RhythmCard } from './rhythm/rhythmModel'
import { findTend } from './rhythm/tendHeuristics'
import { DailyArc } from './rhythm/DailyArc'
import { WeekStrip } from './rhythm/WeekStrip'
import { SometimesShelf } from './rhythm/SometimesShelf'
import { SeasonalShelf } from './rhythm/SeasonalShelf'
import { TendCard } from './rhythm/TendCard'

interface RhythmPageProps {
  routines: Routine[]
  loading?: boolean
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onCreateRoutine: () => void
  onUpdateRoutine: (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void
  onAddStep: (collectionId: string, name: string) => void
  onAddSteps?: (collectionId: string, steps: { name: string; detail?: string }[]) => void | Promise<unknown>
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  onPromoteStep: (stepId: string) => void
  onDeleteStep?: (stepId: string) => void
  onDelete?: (id: string) => void
  onCreateCollection?: (name: string) => Promise<Routine | null> | void
  onGroupIntoCollection?: (name: string, routineIds: string[]) => void
  onBuildWithAI?: () => void
}

export function RhythmPage(props: RhythmPageProps) {
  const {
    routines, loading = false, familyMembers = [],
    onUpdateRoutine, onDelete, onGroupIntoCollection, onBuildWithAI, onCreateCollection,
  } = props

  const [memberId, setMemberId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<{ kind: 'routine' | 'standalone-step' | 'step'; id: string } | null>(null)

  const model = useMemo(() => buildRhythmModel(routines, { memberId }), [routines, memberId])
  const findings = useMemo(() => findTend(routines), [routines])
  const { collections } = groupRoutineSteps(routines)

  // Type-anywhere search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input,textarea,[contenteditable="true"]')) return
      if (open) return
      if (e.key === 'Escape') { setQuery(''); return }
      if (e.key === 'Backspace') { setQuery(q => q.slice(0, -1)); return }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) setQuery(q => q + e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (r: Routine): boolean => {
    if (!q) return true
    if (r.name.toLowerCase().includes(q)) return true
    const coll = collections.find(c => c.id === r.id)
    return coll?.steps.some(s => s.name.toLowerCase().includes(q)) ?? false
  }

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayKey = DAY_ORDER[now.getDay()]
  const subtitle = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const handleNameCluster = (card: RhythmCard, name: string) => {
    onGroupIntoCollection?.(name, card.routines.map(r => r.id))
  }
  const handleWakeAll = () => {
    for (const r of model.seasonal) onUpdateRoutine(r.id, { visibility: 'active', paused_until: null })
  }
  const handleMerge = (_survivorId: string, loserIds: string[]) => {
    for (const id of loserIds) onDelete?.(id)
  }

  // --- open-panel resolution: copied verbatim from RoutinesListRedesign ---
  const cs = collections
  const openRoutineItem =
    open?.kind === 'routine' || open?.kind === 'standalone-step'
      ? (cs.find(c => c.id === open.id)
         ?? (() => {
              const r = routines.find(x => x.id === open.id && !x.parent_routine_id)
              return r ? { ...r, steps: [] as Routine[] } : undefined
            })())
      : undefined
  const openWithSteps = open?.kind === 'routine'
  const openStep = open?.kind === 'step' ? cs.flatMap(c => c.steps).find(s => s.id === open.id) : undefined
  const parentOfOpenStep = openStep ? cs.find(c => c.steps.some(s => s.id === openStep.id)) : undefined

  const openRoutine = (r: Routine) =>
    setOpen({ kind: model.stepCounts[r.id] ? 'routine' : 'standalone-step', id: r.id })

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      <div className={`relative ${PAGE_COLUMN}`}>
        {/* Masthead */}
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">Routines</h1>
            <p className="mt-1 text-sm text-neutral-500">How your family runs — {subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type anywhere to find"
                className="w-40 bg-transparent text-sm focus:outline-none placeholder:text-neutral-400"
              />
            </div>
            {onBuildWithAI && (
              <button onClick={onBuildWithAI}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5
                           font-medium text-neutral-700 shadow-sm hover:border-amber-300 transition-colors">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Build with AI
              </button>
            )}
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 active:bg-amber-700 transition-colors">
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
        </div>

        {/* People pills */}
        {familyMembers.length > 0 && (
          <div className="mb-6 flex items-center gap-1.5 flex-wrap">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Whose week</span>
            <button onClick={() => setMemberId(null)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                memberId === null ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
              }`}>
              Everyone
            </button>
            {[...familyMembers].sort((a, b) => a.display_order - b.display_order).map(m => (
              <button key={m.id} onClick={() => setMemberId(memberId === m.id ? null : m.id)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  memberId === m.id ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
                }`}>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {loading && routines.length === 0 && (
          <p className="py-16 text-center text-neutral-400">Loading your week…</p>
        )}

        {!loading && routines.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100">
              <RefreshCw className="h-10 w-10 text-amber-600" />
            </div>
            <h2 className="font-display mb-2 text-xl font-semibold text-neutral-700">No routines yet</h2>
            <p className="mx-auto mb-6 max-w-sm text-neutral-500">
              Capture your first routine and Symphony will start painting your week.
            </p>
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 transition-colors">
              <Plus className="h-5 w-5" />
              Create your first routine
            </button>
          </div>
        )}

        <DailyArc
          cards={model.daily.timed}
          anytime={model.daily.anytime}
          familyMembers={familyMembers}
          matches={matches}
          nowMinutes={nowMinutes}
          onOpenCollection={id => setOpen({ kind: 'routine', id })}
          onOpenRoutine={openRoutine}
          onNameCluster={handleNameCluster}
        />

        <WeekStrip
          days={model.week.days}
          sometime={model.week.sometime}
          stepCounts={model.stepCounts}
          matches={matches}
          todayKey={todayKey}
          onOpenRoutine={openRoutine}
        />

        <SometimesShelf routines={model.sometimes} matches={matches} onOpenRoutine={openRoutine} />

        <SeasonalShelf routines={model.seasonal} onWakeAll={handleWakeAll} onOpenRoutine={openRoutine} />

        <TendCard
          findings={findings}
          routines={routines}
          onMerge={handleMerge}
          onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
          onRename={(id, name) => onUpdateRoutine(id, { name })}
          onLetGo={id => onDelete?.(id)}
        />
      </div>

      {/* Panel overlay — copied verbatim from RoutinesListRedesign.tsx lines 799-845 */}
      {(openRoutineItem || openStep) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(null)}>
          <div onClick={e => e.stopPropagation()}>
            {openRoutineItem && (
              <TapRoutinePanel
                key={openRoutineItem.id}
                routine={openRoutineItem}
                familyMembers={familyMembers}
                onClose={() => setOpen(null)}
                onRename={name => onUpdateRoutine(openRoutineItem.id, { name })}
                onContextChange={context => onUpdateRoutine(openRoutineItem.id, { context: context ?? null })}
                onVisibilityChange={visibility => onUpdateRoutine(openRoutineItem.id, { visibility })}
                onAssignChange={memberIds => onUpdateRoutine(openRoutineItem.id, { assigned_to_all: memberIds })}
                onScheduleChange={(pattern, timeOfDay) =>
                  onUpdateRoutine(openRoutineItem.id, { recurrence_pattern: pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => onUpdateRoutine(openRoutineItem.id, { description })}
                onDelete={onDelete ? () => { onDelete(openRoutineItem.id); setOpen(null) } : undefined}
                onAddSteps={props.onAddSteps ? steps => props.onAddSteps!(openRoutineItem.id, steps) : undefined}
                {...(openWithSteps ? {
                  steps: openRoutineItem.steps,
                  onSelectStep: (s: Routine) => setOpen({ kind: 'step', id: s.id }),
                  onAddStep: (name: string) => props.onAddStep(openRoutineItem.id, name),
                  onReorderSteps: props.onReorderSteps,
                } : {})}
              />
            )}
            {openStep && parentOfOpenStep && (
              <TapStepPanel
                key={openStep.id}
                step={openStep}
                parentName={parentOfOpenStep.name}
                onClose={() => setOpen({ kind: 'routine', id: parentOfOpenStep.id })}
                onRename={name => onUpdateRoutine(openStep.id, { name })}
                onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
                onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
                onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}
                onPromote={() => { props.onPromoteStep(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) }}
                onDelete={props.onDeleteStep ? () => { props.onDeleteStep!(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) } : undefined}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/routine/RhythmPage.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Swap in via lazy.ts, retire the old component**

In `src/components/lazy.ts` replace lines 14-16 with:

```ts
// Routine views — the Rhythm page (time-rendered week)
export const RoutinesList = lazy(() =>
  import('./routine/RhythmPage').then(m => ({ default: m.RhythmPage }))
)
```

Then verify nothing else imports the old component, and delete it:

```bash
grep -rn "RoutinesListRedesign" src/ --include="*.ts*" | grep -v "routine/RoutinesListRedesign"
# Expected: no output (only lazy.ts referenced it, now updated)
git rm src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
```

If the grep finds other importers, STOP and update them to `RhythmPage` first.

- [ ] **Step 6: Full test run + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all suites PASS, no type errors. `PauseRoutineModal` is no longer imported anywhere on this page — if `tsc` flags it as unused elsewhere that's fine (it's still used by other surfaces; do NOT delete it).

- [ ] **Step 7: Commit**

```bash
git add -A src/components/lazy.ts src/components/routine/
git commit -m "feat(rhythm): assemble Rhythm page, swap into /routines, retire flat list"
```

---

### Task 6: Verification, lint, build, ship as preview

- [ ] **Step 1: Lint + production build**

```bash
npm run lint
npm run build
```

Expected: lint clean (CI runs it; pre-push doesn't), build succeeds (pre-push tsc ≠ Vercel build).

- [ ] **Step 2: Visual smoke test in the dev app**

```bash
cp ../../.env .env 2>/dev/null || cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env .env
npm run dev
```

(Worktrees without `.env` render a blank screen — copy it first.) Open `http://localhost:5173/routines` logged in as Scott. Verify against the spec checklist:
- All 58 top-level routines appear somewhere (Arc / Week / Sometimes / Seasonal) — count them
- Morning cluster (Walk Jax 6:30, Feed Jax 7:00) renders as one card; bedtime cascade clusters with a "name this rhythm?" nudge
- Week Strip: Sunday shows food shopping/planning; empty days say "quiet"
- "Waiting for September" shelf lists the paused school-year routines
- Worth tending shows the plant-watering lookalikes and the missing-domain count
- Typing "jax" anywhere dims everything except the Jax routines; Escape clears
- Person pill filters; tapping any chip opens the Tap panel; renaming works

- [ ] **Step 3: Rebase and push the branch (preview deploy, NOT main)**

```bash
git fetch origin && git rebase origin/main
npx vitest run && npm run build
git push origin rhythm-page
```

Expected: branch pushes clean; Vercel builds a preview deployment. **Do not push to main** — Scott reviews the preview first (pushes to main auto-deploy to prod).

- [ ] **Step 4: Report** — hand Scott the preview URL and the walkthrough checklist from Step 2.

---

## Self-Review Notes

- **Spec coverage:** identity/masthead (T5), zone mapping (T1), clustering + nudge + group-into-collection (T1/T3/T5), people pivot (T1/T5), type-anywhere search (T5), tend heuristics + merge/stamp/rename flows (T2/T4), seasonal shelf + wake-all (T4/T5), panel reuse (T5), lazy swap + retirement (T5), mobile stacking via flex-col/overflow-x (T3), lucide-only icons (T3/T4/T5), tests per spec (T1–T5). Sort/Group dropdowns and Select mode intentionally removed (spec).
- **Out of scope confirmed:** AI tend pass, drag-to-retime, load stats, wall adaptation.
- **Type consistency:** `RhythmCard`/`RhythmModel`/`DayKey`/`findTend`/`TendFinding` names match across Tasks 1–5; `RhythmPageProps` mirrors old `RoutinesListProps` so `RoutinesApp` is untouched.
