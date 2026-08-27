# Routine Visibility Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 15 divergent "should this routine show?" checks across 18 files with one pure `resolveRoutine()`, adopted one surface at a time, so that every behavior change is named by a test rather than discovered on the wall.

**Architecture:** A pure 8-rung ladder in `src/lib/routineUtils.ts` returns `{ shows, reason, owners }`. Each surface's routine pipeline — currently spread across four or five files — collapses into a single call at that surface's entry point. Before a surface migrates, a characterization test records exactly which routines it renders today; the migration must keep that test green or explicitly rewrite it, so no visibility change lands silently.

**Tech Stack:** TypeScript (strict), Vitest, React 19. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-routine-visibility-resolver-design.md`

## Global Constraints

- **Node 22.14.0.** Check `node -v` first. If wrong: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **`npm test` is WATCH mode.** Always run `npx vitest run <path>`.
- **`npx tsc --noEmit` at the repo root is a no-op.** Use `npx tsc --noEmit -p tsconfig.app.json`.
- **First-time worktree setup:** `cd connectors && npm install` (a separate package the root vitest config reaches into; without it the pre-push hook blocks every push to `main`).
- **Read-side only.** No schema migration. `assigned_to`, `assigned_to_all`, and `default_assignee` all stay.
- **No emojis in code or UI.** Use `lucide-react` icons.
- **Work in a feature worktree, never the main worktree.** Push with `git push origin HEAD:main` after each task; pushes to `main` auto-deploy to production.
- **The wall runs on a Raspberry Pi at 1024x768.** Any wall-visible change is verified at that viewport.

---

### Task 1: The resolver and its conformance corpus

The pure function and the table that specifies it. Nothing calls it yet — this task changes zero behavior.

**Files:**
- Modify: `src/lib/routineUtils.ts` (append; existing exports untouched)
- Create: `src/lib/routineVisibility.fixtures.ts`
- Create: `src/lib/routineUtils.resolveRoutine.test.ts`
- Modify: `docs/superpowers/specs/2026-08-25-routine-visibility-resolver-design.md`

**Interfaces:**
- Consumes: `matchesRecurrenceForDate`, `isEverydayRoutine` (both already in `routineUtils.ts`); `PlanningDomain` from `@/lib/today/domainFilter`; `AssigneeFilter` from `@/lib/today/types`; `Routine` from `@/types/actionable`.
- Produces:
  - `type RoutineHideReason = 'shows' | 'resting' | 'not-today' | 'off' | 'other-domain' | 'not-theirs' | 'in-collection' | 'everyday'`
  - `interface RoutinePrefs { hideRoutines: boolean; domain: PlanningDomain }`
  - `interface ResolveRoutineCtx { date: Date; member?: AssigneeFilter; prefs: RoutinePrefs; lastCompletedAt?: Date | null }`
  - `interface RoutineResolution { shows: boolean; reason: RoutineHideReason; owners: string[] }`
  - `function routineOwners(routine: Routine): string[]`
  - `function isPinnedToTimeline(routine: Routine): boolean`
  - `function resolveRoutine(routine: Routine, ctx: ResolveRoutineCtx): RoutineResolution`
  - `const VISIBILITY_CORPUS: CorpusRow[]` and `interface CorpusRow` from the fixtures file

**Two deliberate refinements to the spec, made in this task's commit:**

1. `ResolveRoutineCtx` carries `lastCompletedAt`. Rung 2 calls `matchesRecurrenceForDate`, which needs it for `since_last` routines. The spec's signature omitted it.
2. `member` is `AssigneeFilter` (`string | readonly string[] | null | undefined`), not `string`. Every real surface uses the multi-select filter, and the pseudo-id `'unassigned'` has to keep working.

- [ ] **Step 1: Write the failing test**

Create `src/lib/routineVisibility.fixtures.ts`:

```ts
// The conformance corpus. One table, two jobs: it specifies resolveRoutine
// (Task 1), and it is the input every per-surface characterization test
// replays (Tasks 4-8). Rows use createMockRoutine so fixtures carry RAW DB
// column values and cannot drift from the schema.
import { createMockRoutine } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'
import type { ResolveRoutineCtx, RoutineHideReason } from '@/lib/routineUtils'

/** Monday 2026-08-24. Fixed so the corpus never rots on the wall clock. */
export const CORPUS_DATE = new Date(2026, 7, 24, 9, 0, 0)
/** Saturday, for weekday-only routines. */
export const CORPUS_WEEKEND = new Date(2026, 7, 29, 9, 0, 0)

export interface CorpusRow {
  /** Why this row exists — shown in the test name. */
  label: string
  routine: Routine
  ctx: ResolveRoutineCtx
  expected: RoutineHideReason
}

const DEFAULT_PREFS = { hideRoutines: false, domain: 'universal' as const }
const base = (o: Partial<Routine> = {}) => createMockRoutine({ context: 'family', ...o })
const ctx = (o: Partial<ResolveRoutineCtx> = {}): ResolveRoutineCtx => ({
  date: CORPUS_DATE,
  prefs: DEFAULT_PREFS,
  ...o,
})

export const VISIBILITY_CORPUS: CorpusRow[] = [
  // --- rung 8: shows ---
  { label: 'plain active daily routine', routine: base(), ctx: ctx(), expected: 'shows' },
  {
    label: 'weekly routine on a matching day',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ctx: ctx(),
    expected: 'shows',
  },

  // --- rung 1: resting ---
  { label: 'paused routine', routine: base({ visibility: 'reference' }), ctx: ctx(), expected: 'resting' },
  {
    label: 'resting beats not-today — rung 1 wins',
    routine: base({ visibility: 'reference', recurrence_pattern: { type: 'weekly', days: ['tue'] } }),
    ctx: ctx(),
    expected: 'resting',
  },

  // --- rung 2: not-today ---
  {
    label: 'weekly routine on a non-matching day',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] } }),
    ctx: ctx(),
    expected: 'not-today',
  },
  {
    label: 'weekday routine on a Saturday',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }),
    ctx: ctx({ date: CORPUS_WEEKEND }),
    expected: 'not-today',
  },
  {
    label: 'since_last, never completed, is due',
    routine: base({ recurrence_pattern: { type: 'since_last', interval: 2, unit: 'weeks' } }),
    ctx: ctx({ lastCompletedAt: null }),
    expected: 'shows',
  },
  {
    label: 'since_last completed yesterday is not due',
    routine: base({ recurrence_pattern: { type: 'since_last', interval: 2, unit: 'weeks' } }),
    ctx: ctx({ lastCompletedAt: new Date(2026, 7, 23) }),
    expected: 'not-today',
  },

  // --- rung 3: off ---
  { label: 'show_on_timeline false', routine: base({ show_on_timeline: false }), ctx: ctx(), expected: 'off' },
  {
    label: 'off beats other-domain — rung 3 wins',
    routine: base({ show_on_timeline: false, context: 'work' }),
    ctx: ctx({ prefs: { hideRoutines: false, domain: 'family' } }),
    expected: 'off',
  },

  // --- rung 4: other-domain ---
  {
    label: 'work routine under the family lens',
    routine: base({ context: 'work' }),
    ctx: ctx({ prefs: { hideRoutines: false, domain: 'family' } }),
    expected: 'other-domain',
  },
  {
    label: 'untagged routine under a specific lens — exact match only',
    routine: base({ context: null }),
    ctx: ctx({ prefs: { hideRoutines: false, domain: 'family' } }),
    expected: 'other-domain',
  },
  {
    label: 'untagged routine under universal',
    routine: base({ context: null }),
    ctx: ctx(),
    expected: 'shows',
  },

  // --- rung 5: not-theirs ---
  {
    label: 'assigned to someone else',
    routine: base({ assigned_to: 'iris' }),
    ctx: ctx({ member: 'scott' }),
    expected: 'not-theirs',
  },
  {
    label: 'assigned_to_all includes the selected member',
    routine: base({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] }),
    ctx: ctx({ member: 'iris' }),
    expected: 'shows',
  },
  {
    label: 'multi-select union — either selected person matches',
    routine: base({ assigned_to: 'iris' }),
    ctx: ctx({ member: ['scott', 'iris'] }),
    expected: 'shows',
  },
  {
    label: 'no member selected matches everyone',
    routine: base({ assigned_to: 'iris' }),
    ctx: ctx({ member: null }),
    expected: 'shows',
  },
  {
    label: "'unassigned' matches only an ownerless routine",
    routine: base({ assigned_to: null, assigned_to_all: null }),
    ctx: ctx({ member: 'unassigned' }),
    expected: 'shows',
  },
  {
    label: "'unassigned' rejects an owned routine",
    routine: base({ assigned_to: 'iris' }),
    ctx: ctx({ member: 'unassigned' }),
    expected: 'not-theirs',
  },
  {
    label: 'default_assignee is an owner when nothing else is set',
    routine: base({ assigned_to: null, assigned_to_all: null, default_assignee: 'kaleb' }),
    ctx: ctx({ member: 'kaleb' }),
    expected: 'shows',
  },
  {
    label: 'assigned_to_all wins over assigned_to when both are set',
    routine: base({ assigned_to: 'scott', assigned_to_all: ['iris'] }),
    ctx: ctx({ member: 'scott' }),
    expected: 'not-theirs',
  },

  // --- rung 6: in-collection ---
  {
    label: 'a collection step never renders on its own',
    routine: base({ parent_routine_id: 'parent-1' }),
    ctx: ctx(),
    expected: 'in-collection',
  },
  {
    label: 'in-collection beats everyday — rung 6 wins',
    routine: base({ parent_routine_id: 'parent-1', recurrence_pattern: { type: 'daily' } }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'in-collection',
  },

  // --- rung 7: everyday ---
  {
    label: 'daily routine swept by hide-daily',
    routine: base({ recurrence_pattern: { type: 'daily' } }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'everyday',
  },
  {
    label: 'weekday-only weekly counts as everyday',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'everyday',
  },
  {
    label: 'pin_to_timeline survives hide-daily',
    routine: base({ recurrence_pattern: { type: 'daily' }, pin_to_timeline: true }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'shows',
  },
  {
    label: 'a dosed routine survives hide-daily',
    routine: base({ recurrence_pattern: { type: 'daily' }, times_per_day: ['08:00', '20:00'] }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'shows',
  },
  {
    label: 'a low-frequency routine is never swept',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ctx: ctx({ prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'shows',
  },
  {
    label: 'hide-daily off keeps everyday routines',
    routine: base({ recurrence_pattern: { type: 'daily' } }),
    ctx: ctx(),
    expected: 'shows',
  },
]
```

Create `src/lib/routineUtils.resolveRoutine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveRoutine, routineOwners, isPinnedToTimeline } from './routineUtils'
import { VISIBILITY_CORPUS, CORPUS_DATE } from './routineVisibility.fixtures'
import { makeAssigneeFilter } from './today/assigneeFilter'
import { createMockRoutine } from '@/test/mocks/factories'

describe('resolveRoutine — conformance corpus', () => {
  for (const row of VISIBILITY_CORPUS) {
    it(`${row.label} -> ${row.expected}`, () => {
      const result = resolveRoutine(row.routine, row.ctx)
      expect(result.reason).toBe(row.expected)
      expect(result.shows).toBe(row.expected === 'shows')
    })
  }

  it('covers every reason at least once', () => {
    const seen = new Set(VISIBILITY_CORPUS.map((r) => r.expected))
    expect([...seen].sort()).toEqual([
      'everyday', 'in-collection', 'not-theirs', 'not-today',
      'off', 'other-domain', 'resting', 'shows',
    ])
  })
})

describe('routineOwners', () => {
  it('prefers assigned_to_all', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['iris', 'ella'] })
    expect(routineOwners(r)).toEqual(['iris', 'ella'])
  })

  it('falls back to assigned_to', () => {
    expect(routineOwners(createMockRoutine({ assigned_to: 'scott' }))).toEqual(['scott'])
  })

  it('falls back to default_assignee', () => {
    const r = createMockRoutine({ assigned_to: null, default_assignee: 'kaleb' })
    expect(routineOwners(r)).toEqual(['kaleb'])
  })

  it('is empty when nothing is assigned', () => {
    expect(routineOwners(createMockRoutine({ assigned_to: null }))).toEqual([])
  })

  it('treats an empty assigned_to_all as unset', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: [] })
    expect(routineOwners(r)).toEqual(['scott'])
  })
})

// Rung 5 must agree with the filter every other surface already uses, or
// adopting it silently reshuffles who sees what. The ONLY intended difference
// is the default_assignee fallback, which this test pins by exclusion.
describe('rung 5 agrees with makeAssigneeFilter', () => {
  const selections = [null, 'scott', 'iris', ['scott', 'iris'], 'unassigned'] as const
  const routines = [
    createMockRoutine({ assigned_to: null, assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'iris', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] }),
  ]

  for (const selected of selections) {
    for (const routine of routines) {
      it(`${JSON.stringify(selected)} x ${routine.assigned_to ?? 'none'}/${JSON.stringify(routine.assigned_to_all)}`, () => {
        const legacy = makeAssigneeFilter(selected)(routine.assigned_to, routine.assigned_to_all)
        const resolved = resolveRoutine(routine, {
          date: CORPUS_DATE,
          member: selected,
          prefs: { hideRoutines: false, domain: 'universal' },
        })
        expect(resolved.reason === 'not-theirs').toBe(!legacy)
      })
    }
  }
})

describe('isPinnedToTimeline', () => {
  it('is true for an explicit pin', () => {
    expect(isPinnedToTimeline(createMockRoutine({ pin_to_timeline: true }))).toBe(true)
  })
  it('is true for a dosed routine', () => {
    expect(isPinnedToTimeline(createMockRoutine({ times_per_day: ['08:00'] }))).toBe(true)
  })
  it('is false otherwise', () => {
    expect(isPinnedToTimeline(createMockRoutine())).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/routineUtils.resolveRoutine.test.ts
```

Expected: FAIL — `resolveRoutine is not a function` / no export named `resolveRoutine`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/routineUtils.ts`:

```ts
import type { PlanningDomain } from '@/lib/today/domainFilter'
import type { AssigneeFilter } from '@/lib/today/types'

/**
 * Why a routine is or is not on screen. The rung that matched IS the reason,
 * which is what lets the board (step B) explain a hidden routine in one line
 * instead of listing everything that might be true of it.
 */
export type RoutineHideReason =
  | 'shows'
  | 'resting'        // rung 1 — visibility !== 'active'
  | 'not-today'      // rung 2 — recurrence doesn't match the date
  | 'off'            // rung 3 — show_on_timeline === false
  | 'other-domain'   // rung 4 — fails the domain lens
  | 'not-theirs'     // rung 5 — the selected member isn't an owner
  | 'in-collection'  // rung 6 — it's a step; the collection renders it
  | 'everyday'       // rung 7 — swept by "hide daily routines"

export interface RoutinePrefs {
  /** The "hide daily routines" toggle (rung 7). */
  hideRoutines: boolean
  /** The active domain lens (rung 4). 'universal' makes rung 4 a no-op. */
  domain: PlanningDomain
}

export interface ResolveRoutineCtx {
  date: Date
  /** null/undefined/[] means "everyone" and skips rung 5. */
  member?: AssigneeFilter
  prefs: RoutinePrefs
  /** Required only for 'since_last' recurrence; see matchesRecurrenceForDate. */
  lastCompletedAt?: Date | null
}

export interface RoutineResolution {
  shows: boolean
  reason: RoutineHideReason
  owners: string[]
}

/**
 * Collapse the three assignment columns into one list. Read-side only — the
 * columns stay as they are, and this is the single place that knows the order
 * of preference.
 */
export function routineOwners(routine: Routine): string[] {
  if (routine.assigned_to_all && routine.assigned_to_all.length > 0) {
    return [...routine.assigned_to_all]
  }
  if (routine.assigned_to) return [routine.assigned_to]
  if (routine.default_assignee) return [routine.default_assignee]
  return []
}

/**
 * A routine that survives the "hide daily routines" sweep. An explicit pin, or
 * a dosed routine (N times per day) — the latter is a tracked obligation like
 * PT exercises, not ambient habit noise.
 */
export function isPinnedToTimeline(routine: Routine): boolean {
  return routine.pin_to_timeline === true || (routine.times_per_day?.length ?? 0) > 0
}

function matchesOwners(owners: string[], selected: AssigneeFilter): boolean {
  const ids: string[] =
    selected == null ? [] : Array.isArray(selected) ? selected.filter(Boolean) : [selected as string]
  if (ids.length === 0) return true // "everyone"
  return ids.some((id) => (id === 'unassigned' ? owners.length === 0 : owners.includes(id)))
}

/**
 * The one rule for "should this routine show?". First match wins; the matching
 * rung is the reason.
 *
 * Rung order runs cheapest-and-most-absolute first, so the reason a user is
 * shown is the most fundamental one true of that routine — a resting routine
 * that also doesn't recur today reads better as 'resting' than 'not-today'.
 *
 * Deliberately NOT here, because neither is a visibility question:
 *   - isDraggable  — planning wants untimed routines only (!time_of_day)
 *   - canHeadline  — the wall's glance-card ranking
 */
export function resolveRoutine(routine: Routine, ctx: ResolveRoutineCtx): RoutineResolution {
  const owners = routineOwners(routine)
  const hide = (reason: RoutineHideReason): RoutineResolution => ({ shows: false, reason, owners })

  if (routine.visibility !== 'active') return hide('resting')
  if (!matchesRecurrenceForDate(routine, ctx.date, ctx.lastCompletedAt ?? null)) return hide('not-today')
  if (routine.show_on_timeline === false) return hide('off')
  if (ctx.prefs.domain !== 'universal' && routine.context !== ctx.prefs.domain) return hide('other-domain')
  if (!matchesOwners(owners, ctx.member)) return hide('not-theirs')
  if (routine.parent_routine_id != null) return hide('in-collection')
  if (ctx.prefs.hideRoutines && isEverydayRoutine(routine.recurrence_pattern) && !isPinnedToTimeline(routine)) {
    return hide('everyday')
  }
  return { shows: true, reason: 'shows', owners }
}
```

- [ ] **Step 4: Run tests and the type check**

```bash
npx vitest run src/lib/routineUtils.resolveRoutine.test.ts
npx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS, and no type errors.

- [ ] **Step 5: Record the two spec refinements**

In `docs/superpowers/specs/2026-08-25-routine-visibility-resolver-design.md`, in the Section 1 signature block, change `member?: string` to `member?: AssigneeFilter` and add `lastCompletedAt?: Date | null` to `ctx`. Add one sentence below it:

> `lastCompletedAt` is required only for `since_last` recurrence, which rung 2
> cannot evaluate without it. `member` takes the multi-select `AssigneeFilter`
> the surfaces actually use, including the `'unassigned'` pseudo-id.

- [ ] **Step 6: Commit**

```bash
git add src/lib/routineUtils.ts src/lib/routineVisibility.fixtures.ts \
        src/lib/routineUtils.resolveRoutine.test.ts \
        docs/superpowers/specs/2026-08-25-routine-visibility-resolver-design.md
git commit -m "feat(routines): resolveRoutine — one ladder, one reason

The 8-rung visibility ladder plus the conformance corpus that specifies
it. Nothing calls it yet; this changes no behavior.

Rung 5 is pinned against makeAssigneeFilter so adopting it cannot
reshuffle who sees what — the default_assignee fallback is the only
intended difference."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 2: The show_on_timeline data audit

The wall cannot adopt rung 3 until the data behind it is understood. This task produces a query and a written finding, not code. It gates Task 8 only — Tasks 3-7 proceed while it is open.

**Files:**
- Create: `docs/superpowers/specs/assets/2026-08-26-show-on-timeline-audit.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a written classification of every `show_on_timeline = false` routine, and a `UPDATE` statement for Scott to run.

**Do NOT run this against the database with the service role.** The service role bypasses RLS and will return rows Scott's own session cannot see, which produces a wrong answer confidently. Hand the SQL to Scott to run in the Supabase SQL editor.

- [ ] **Step 1: Write the audit query**

Create the file with this query in it:

```sql
-- Every routine currently hidden by the flag, with the context needed to
-- classify it. `owners_set` answers whether the assignee filter could do the
-- job instead — the whole premise of the fix.
select
  r.id,
  r.name,
  r.context,
  r.scope,
  r.visibility,
  r.recurrence_pattern->>'type' as recurrence,
  r.parent_routine_id is not null as is_step,
  coalesce(
    nullif(array_length(r.assigned_to_all, 1), 0),
    case when r.assigned_to is not null then 1 else 0 end
  ) > 0 as owners_set,
  r.assigned_to,
  r.assigned_to_all,
  r.default_assignee
from routines r
where r.show_on_timeline = false
order by r.context nulls last, r.name;
```

Second query, which settles whether the `default_assignee` fallback in `routineOwners` changes anything in practice:

```sql
-- Routines whose ONLY owner is default_assignee. If this returns zero rows,
-- rung 5's default_assignee fallback is a no-op on real data.
select id, name, default_assignee
from routines
where default_assignee is not null
  and assigned_to is null
  and coalesce(array_length(assigned_to_all, 1), 0) = 0;
```

- [ ] **Step 2: Hand both queries to Scott and record the results**

Ask Scott to run them and paste the output. Write the results into the audit file under a `## Findings` heading, classifying each row as:

- **(i) genuinely hidden everywhere** — leave `show_on_timeline = false`.
- **(ii) Today-declutter workaround** — flip to `true`; the assignee filter takes over.

For every row classified (ii), confirm `owners_set` is true. A row that is (ii) *and* has no owners cannot be handled by the assignee filter and needs assignment set first — list those separately as blockers.

- [ ] **Step 3: Write the backfill statement**

Under a `## Backfill` heading, write the exact statement, with the ids enumerated literally — never a `where name like` predicate:

```sql
update routines
set show_on_timeline = true
where id in ( /* the category (ii) ids, one per line, each with a -- name comment */ );
```

- [ ] **Step 4: Get Scott to run it, and confirm**

Re-run the first audit query. The category (ii) ids must no longer appear. Record the confirmation in the file.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/assets/2026-08-26-show-on-timeline-audit.md
git commit -m "docs(routines): show_on_timeline audit — findings and backfill

Which routines were using the flag as a Today-declutter workaround,
and the statement that moves them onto the assignee filter instead.
Gates the wall's adoption of rung 3 (Task 8)."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 3: TimelineItem carries owners

`routineToTimelineItem` currently drops `assigned_to_all` entirely, keeping only the legacy single `assignedTo`. That is why multi-assigned routines behave inconsistently downstream. Every later task depends on this.

**Files:**
- Modify: `src/types/timeline.ts:148-176` (`routineToTimelineItem`, and the `TimelineItem` interface above it)
- Create: `src/types/timeline.routineOwners.test.ts`

**Interfaces:**
- Consumes: `routineOwners` from Task 1.
- Produces: `TimelineItem.owners?: string[]` — present on routine items, absent on tasks and events.

- [ ] **Step 1: Write the failing test**

Create `src/types/timeline.routineOwners.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { routineToTimelineItem } from './timeline'
import { createMockRoutine } from '@/test/mocks/factories'

const DATE = new Date(2026, 7, 24, 9, 0, 0)

describe('routineToTimelineItem carries owners', () => {
  it('keeps every member of assigned_to_all', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] })
    expect(routineToTimelineItem(r, DATE).owners).toEqual(['scott', 'iris'])
  })

  it('falls back to assigned_to', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: null })
    expect(routineToTimelineItem(r, DATE).owners).toEqual(['scott'])
  })

  it('is empty for an unassigned routine', () => {
    const r = createMockRoutine({ assigned_to: null, assigned_to_all: null })
    expect(routineToTimelineItem(r, DATE).owners).toEqual([])
  })

  it('leaves the legacy assignedTo field alone', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] })
    expect(routineToTimelineItem(r, DATE).assignedTo).toBe('scott')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/types/timeline.routineOwners.test.ts
```

Expected: FAIL — `expected undefined to equal [ 'scott', 'iris' ]`.

- [ ] **Step 3: Write minimal implementation**

In `src/types/timeline.ts`, add to the `TimelineItem` interface:

```ts
  /** Routine items only: every member who owns this, collapsed from the three
   *  assignment columns by routineOwners(). `assignedTo` stays for callers that
   *  have not migrated. */
  owners?: string[]
```

And in `routineToTimelineItem`, add one line to the returned object, next to `assignedTo`:

```ts
    assignedTo: routine.assigned_to,
    owners: routineOwners(routine),
```

with `import { routineOwners } from '@/lib/routineUtils'` at the top.

- [ ] **Step 4: Run tests and the type check**

```bash
npx vitest run src/types/timeline.routineOwners.test.ts
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

Expected: PASS, no type errors, and the full suite still green — this is an additive field, so nothing else should move.

- [ ] **Step 5: Commit**

```bash
git add src/types/timeline.ts src/types/timeline.routineOwners.test.ts
git commit -m "feat(routines): TimelineItem carries owners

routineToTimelineItem dropped assigned_to_all entirely, which is why a
multi-assigned routine behaved differently on each surface. Additive:
assignedTo stays for unmigrated callers."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 4: Today adopts the resolver

The richest surface and the only one with a pure, fixtured core. It exercises all eight rungs, so if the resolver is wrong it is wrong here, cheaply.

**Files:**
- Create: `src/lib/today/surfaceParity.ts` (the shared characterization helper)
- Create: `src/lib/today/todayParity.test.ts`
- Modify: `src/lib/today/statusMaps.ts:33-52` (`selectVisibleRoutines`, `isPinnedToTimeline`)
- Modify: `src/lib/today/types.ts` (`TodayDataInput` gains `domain`)
- Modify: `src/lib/today/computeTodayData.ts:48` (the `selectVisibleRoutines` call)
- Modify: `src/lib/today/grouping.ts:66`
- Modify: `src/lib/today/routineCollections.ts:132`
- Modify: `src/components/schedule/TodayView.tsx:289-296` (pass `domain` into the input)
- Modify: `src/components/home/HomeView.tsx:90-97` and `src/apps/tasks/HomeViewContainer.tsx:262-270` (stop pre-filtering routines by domain)
- Modify: `src/lib/today/statusMaps.test.ts:34-55` (five calls use the OLD two-argument signature and will not compile after Step 4)

**Interfaces:**
- Consumes: `resolveRoutine`, `RoutinePrefs`, `VISIBILITY_CORPUS` (Task 1); `TimelineItem.owners` (Task 3).
- Produces:
  - `function recordVisible<T>(routines: Routine[], pipeline: (input: Routine[]) => T[], id: (item: T) => string): string[]` in `surfaceParity.ts` — a sorted, deduped list of the ids a pipeline renders.
  - `function corpusScenarios(rows: readonly CorpusRow[]): Map<string, CorpusRow[]>` in `surfaceParity.ts` — groups corpus rows that share one `ctx`, so a surface can be replayed per scenario.
  - `selectVisibleRoutines(routines: Routine[], ctx: ResolveRoutineCtx): Routine[]` — signature CHANGES from `(routines, hideRoutines: boolean)`.
  - `TodayDataInput.domain: PlanningDomain` — a new required field.

**Expected behavior change: none.** Today already applies all eight rungs. This task is a pure refactor and the parity test proves it. If the parity test fails, the resolver is wrong — fix the resolver, do not rewrite the expectation.

- [ ] **Step 1: Write the characterization helper**

Create `src/lib/today/surfaceParity.ts`:

```ts
// Characterization harness. Each surface's parity test replays the shared
// corpus through that surface's pipeline and records which routines survive.
// Written and run GREEN against the pre-migration code, then run again after
// the migration: a diff here is a behavior change, and it has to be named in
// the commit message rather than absorbed.
import type { Routine } from '@/types/actionable'
import type { CorpusRow } from '@/lib/routineVisibility.fixtures'

/** The corpus rows that share one ctx, so a surface can be replayed per-scenario. */
export function corpusScenarios(rows: readonly CorpusRow[]): Map<string, CorpusRow[]> {
  const byCtx = new Map<string, CorpusRow[]>()
  for (const row of rows) {
    const key = JSON.stringify({
      date: row.ctx.date.toISOString(),
      member: row.ctx.member ?? null,
      prefs: row.ctx.prefs,
      lastCompletedAt: row.ctx.lastCompletedAt?.toISOString() ?? null,
    })
    const arr = byCtx.get(key) ?? []
    arr.push(row)
    byCtx.set(key, arr)
  }
  return byCtx
}

/** Sorted, deduped ids a pipeline renders. Sorting makes the diff readable. */
export function recordVisible<T>(
  routines: Routine[],
  pipeline: (input: Routine[]) => T[],
  id: (item: T) => string,
): string[] {
  return [...new Set(pipeline(routines).map(id))].sort()
}
```

- [ ] **Step 2: Write the parity test and run it GREEN against current code**

Create `src/lib/today/todayParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS } from '@/lib/routineVisibility.fixtures'
import { corpusScenarios, recordVisible } from './surfaceParity'
import { filterRoutinesForDomain } from './domainFilter'
import { makeAssigneeFilter } from './assigneeFilter'
import { getRoutinesForDatePure, isEverydayRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'
import type { ResolveRoutineCtx } from '@/lib/routineUtils'

// The Today pipeline as it exists BEFORE migration, reassembled here from the
// six files it is spread across.
//
// Every stage is INLINED on purpose — nothing here calls the production
// functions this task is about to change. A characterization test that calls
// selectVisibleRoutines would break the moment Step 4 changes its signature,
// and a "before" recording that moves when you change the code is not a
// recording of anything. This function must not be edited after Step 3.
function todayPipelineBefore(routines: Routine[], ctx: ResolveRoutineCtx): Routine[] {
  // useRoutines.activeRoutines
  const active = routines.filter((r) => r.visibility === 'active')

  // useRoutines.getRoutinesForDate — since_last needs the completion map
  const lastMap = ctx.lastCompletedAt
    ? new Map(active.map((r) => [r.id, ctx.lastCompletedAt as Date]))
    : undefined
  const forDate = getRoutinesForDatePure(active, ctx.date, lastMap)

  // HomeView.filteredRoutines
  const domained = filterRoutinesForDomain(forDate, ctx.prefs.domain)

  // statusMaps.selectVisibleRoutines, inlined as of 2026-08-26
  const showable = domained.filter((r) => r.show_on_timeline !== false)
  const parentIds = new Set(showable.filter((r) => r.parent_routine_id).map((r) => r.parent_routine_id))
  const pinned = (r: Routine) => r.pin_to_timeline === true || (r.times_per_day?.length ?? 0) > 0
  const visible = !ctx.prefs.hideRoutines
    ? showable
    : showable.filter(
        (r) =>
          r.parent_routine_id != null ||
          parentIds.has(r.id) ||
          pinned(r) ||
          !isEverydayRoutine(r.recurrence_pattern),
      )

  // grouping.buildGroupedSections
  const match = makeAssigneeFilter(ctx.member ?? null)
  return visible.filter((r) => match(r.assigned_to, r.assigned_to_all))
}

describe('Today surface parity', () => {
  for (const [key, rows] of corpusScenarios(VISIBILITY_CORPUS)) {
    const ctx = rows[0].ctx
    it(`renders the same routines for ${key}`, () => {
      const routines = rows.map((r) => r.routine)
      const before = recordVisible(routines, (rs) => todayPipelineBefore(rs, ctx), (r) => r.id)
      const expected = rows.filter((r) => r.expected === 'shows').map((r) => r.routine.id).sort()
      expect(before).toEqual(expected)
    })
  }
})
```

```bash
npx vitest run src/lib/today/todayParity.test.ts
```

Expected: **PASS**, against the unmodified code. This is the point of the task — it proves the resolver's ladder already describes what Today does.

If it FAILS: stop and read the diff. Either the corpus encodes a rung Today does not actually apply, or Today has a bug the spec did not catch. Both are findings — report them before changing anything. Do not "fix" the corpus to match.

One known exception: the `since_last` rows pass `lastCompletedAt`, which `getRoutinesForDatePure` cannot receive in this shape. Thread it through by passing `new Map([[routine.id, ctx.lastCompletedAt]])` as its third argument when `ctx.lastCompletedAt` is set.

- [ ] **Step 3: Commit the characterization test on its own**

```bash
git add src/lib/today/surfaceParity.ts src/lib/today/todayParity.test.ts
git commit -m "test(routines): characterize Today's routine visibility

Replays the conformance corpus through Today's real pipeline, assembled
from the six files it is spread across. Green against unmodified code:
the ladder already describes what Today does. Task 4's migration must
keep it green."
```

- [ ] **Step 4: Change `selectVisibleRoutines` to call the resolver**

Replace the body of `src/lib/today/statusMaps.ts` from the `isPinnedToTimeline` helper down:

```ts
import { resolveRoutine, type ResolveRoutineCtx } from '@/lib/routineUtils'

/**
 * The Today routine pool. One resolveRoutine call replaces what used to be
 * five filters spread across useRoutines, useScheduleFiltering, HomeView,
 * this file, and grouping.ts.
 */
export function selectVisibleRoutines(routines: Routine[], ctx: ResolveRoutineCtx): Routine[] {
  return routines.filter((r) => resolveRoutine(r, ctx).shows)
}
```

Delete the local `isPinnedToTimeline` and the `isEverydayRoutine` import — they now live in `routineUtils.ts`.

- [ ] **Step 5: Thread the context through `computeTodayData`**

In `src/lib/today/types.ts`, add to `TodayDataInput`:

```ts
  /** The active domain lens. Universal shows every life area. */
  domain: PlanningDomain
```

with `import type { PlanningDomain } from './domainFilter'`.

In `src/lib/today/computeTodayData.ts`, replace line 48:

```ts
  const routineCtx: ResolveRoutineCtx = {
    date: input.viewedDate,
    member: input.selectedAssignee,
    prefs: { hideRoutines: input.hideRoutines, domain: input.domain },
  }
  const visibleRoutines = selectVisibleRoutines(input.routines, routineCtx)
```

Because rung 5 now runs inside `selectVisibleRoutines`, delete the redundant assignee filters:
- `src/lib/today/grouping.ts:66` — replace `routines.filter((routine) => match(routine.assigned_to, routine.assigned_to_all))` with `routines`, and drop the now-unused local.
- `src/lib/today/routineCollections.ts:132` — replace `routines.filter((r) => match(r.assigned_to, r.assigned_to_all))` with `routines`.

Leave the `match` parameter on both signatures: tasks and events still use it.

- [ ] **Step 6: Stop pre-filtering routines by domain upstream**

Rung 4 now runs in the resolver, so the upstream domain filter would double-apply. In `src/components/home/HomeView.tsx`, delete the `filteredRoutines` and `filteredAllActiveRoutines` memos (lines 89-98) and pass the unfiltered `routines` / `allActiveRoutines` through. Do the same at `src/apps/tasks/HomeViewContainer.tsx:262-270`.

Keep `filterRoutinesForDomain` exported — Planning still uses it until Task 6.

In `src/components/schedule/TodayView.tsx`, add `domain: currentDomain` to the `useTodayData` input object (~line 289) and `currentDomain` to its dependency array (~line 296). `currentDomain` comes from `useDomain()`, already imported in that file's tree — if not, import it from `@/hooks/useDomain`.

- [ ] **Step 7: Run the parity test, the full suite, and the type check**

```bash
npx vitest run src/lib/today/todayParity.test.ts
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

Expected: parity PASS with no change to the recorded ids, no type errors, full suite green.

`src/lib/today/statusMaps.test.ts` will fail to compile until you update it: lines 34, 35, 41, 52 and 55 pass `hideRoutines` as a bare second argument. Rewrite each to pass a full ctx, e.g. `selectVisibleRoutines([daily, weekly, hidden], { date: DATE, prefs: { hideRoutines: false, domain: 'universal' } })`, with `const DATE = new Date(2026, 7, 24)` at the top. The expected id lists must NOT change — if one does, the resolver disagrees with the behavior that test pinned, and that is a finding to report, not an expectation to edit.

If another test fails, read it before touching it. A failing `computeTodayData` or `TodayView` test usually means a fixture is missing the new required `domain` field — add `domain: 'universal'` to it. That is a fixture update, not a behavior change. A failing test that asserts on which routines render IS a behavior change and must be reported, not edited.

- [ ] **Step 8: Look at the running app**

A type check is not inspection. Start the dev server and open Today.

```bash
npm run dev
```

Confirm, signed in as Scott: routines appear on Today; the "Hide daily" toggle still hides everyday routines and still keeps pinned ones; switching the domain lens (Work / Family / Personal / Universal) still narrows routines; the assignee filter still narrows them. Compare against the deployed app at app.symphony-os.com side by side.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(today): one resolveRoutine call replaces five filters

Today's routine pipeline ran across useRoutines, useScheduleFiltering,
HomeView, statusMaps, grouping and routineCollections. It is now one
call at the computeTodayData entry point.

Parity test unchanged and green: no routine changes visibility."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 5: Week grid and Month adopt the resolver

**Files:**
- Create: `src/components/home/week/weekParity.test.ts`
- Modify: `src/components/home/week/WeekViewV2.tsx:228-247`
- Modify: `src/components/home/week/WeekViewMobile.tsx:84-99`
- Modify: `src/components/home/WeekView.tsx:236-242`
- Modify: `src/components/home/MonthView.tsx:163-168`

**Interfaces:**
- Consumes: `resolveRoutine`, `ResolveRoutineCtx` (Task 1).
- Produces: nothing new.

**Expected behavior changes — both intended, both named in the commit:**
1. **Collection steps stop rendering as loose blocks.** None of these four views check `parent_routine_id`. Rung 6 hides them.
2. **The assignee filter starts narrowing routines on the Week grid.** `WeekViewV2` and `WeekViewMobile` never applied rung 5 (the legacy `WeekView` and `MonthView` already did).

- [ ] **Step 1: Write the parity test recording the CURRENT behavior**

Create `src/components/home/week/weekParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS, CORPUS_DATE } from '@/lib/routineVisibility.fixtures'
import { recordVisible } from '@/lib/today/surfaceParity'
import { isEverydayRoutine, matchesRecurrenceForDate, resolveRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'

const ROUTINES = VISIBILITY_CORPUS.map((r) => r.routine)
const PREFS = { hideRoutines: false, domain: 'universal' as const }

/** WeekViewV2's routine filter as it exists before migration. */
function weekGridBefore(routines: Routine[], hideRoutines: boolean): Routine[] {
  const showable = routines.filter((r) => r.show_on_timeline !== false)
  const visible = hideRoutines
    ? showable.filter((r) => !isEverydayRoutine(r.recurrence_pattern))
    : showable
  return visible.filter((r) => matchesRecurrenceForDate(r, CORPUS_DATE))
}

describe('Week grid parity — the two intended changes, and nothing else', () => {
  it('drops exactly the collection steps and the not-theirs rows', () => {
    const before = recordVisible(ROUTINES, (rs) => weekGridBefore(rs, false), (r) => r.id)
    const after = recordVisible(
      ROUTINES,
      (rs) => rs.filter((r) => resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).shows),
      (r) => r.id,
    )
    const dropped = before.filter((id) => !after.includes(id))
    const added = after.filter((id) => !before.includes(id))

    // Everything dropped must be a routine the resolver calls a step or a
    // resting routine — never a routine that simply "used to show".
    const reasonById = new Map(
      ROUTINES.map((r) => [r.id, resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).reason]),
    )
    expect(dropped.length).toBeGreaterThan(0) // the corpus must exercise the change
    for (const id of dropped) {
      expect(['in-collection', 'resting']).toContain(reasonById.get(id))
    }
    expect(added).toEqual([])
  })

  it('pinned routines now survive hide-daily on the week grid', () => {
    const pinned = ROUTINES.filter((r) => r.pin_to_timeline === true)
    expect(pinned.length).toBeGreaterThan(0)
    for (const r of pinned) {
      expect(weekGridBefore([r], true)).toEqual([])
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: { ...PREFS, hideRoutines: true } }).shows).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run it to see the current shape**

```bash
npx vitest run src/components/home/week/weekParity.test.ts
```

Expected: PASS. It asserts the *shape* of the change (only steps and resting routines are dropped, nothing is added), not a frozen id list, so it stays meaningful after migration.

- [ ] **Step 3: Migrate WeekViewV2**

Replace `src/components/home/week/WeekViewV2.tsx:235-247` with:

```tsx
    // One rule for routine visibility, shared with Today and the wall. Rung 2
    // is evaluated per day below, so the pool here is resolved per date rather
    // than once for the week.
    const routineItems = routines.flatMap((r) =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        if (!resolveRoutine(r, { date: d, member: selectedAssignees, prefs: { hideRoutines, domain: currentDomain } }).shows) {
          return null
        }
        return { ...routineToTimelineItem(r, d), id: `routine-${r.id}-day${i}` }
      }).filter((item): item is NonNullable<typeof item> => item !== null),
    )
```

Replace the `isEverydayRoutine, matchesRecurrenceForDate` import with `resolveRoutine`. Add `selectedAssignees` and `currentDomain` to the component's props if they are not already there — check how `WeekViewV2` is called in `HomeView.tsx:284` and thread them from the same source `TodayView` uses. Add both to the `useMemo` dependency array at line 280.

- [ ] **Step 4: Migrate the other three the same way**

- `WeekViewMobile.tsx:89-99` — identical shape to Step 3.
- `WeekView.tsx:236-242` — replace the three-clause filter with a single `resolveRoutine(...).shows`, evaluated per rendered date.
- `MonthView.tsx:163-168` — same.

In each, delete the now-unused `isEverydayRoutine` / `matchesRecurrenceForDate` / `matchesAssigneeFilter` imports.

- [ ] **Step 5: Run everything**

```bash
npx vitest run src/components/home/
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

Expected: all green.

- [ ] **Step 6: Look at the running app**

`npm run dev`, then open the Week and Month views. Confirm: collection steps no longer appear as loose blocks; the assignee filter now narrows routines on the week grid; pinned routines survive the hide-daily toggle; a Mon-Fri routine still does not render on Saturday.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(week,month): adopt resolveRoutine

Two intended behavior changes, both from rungs these views never applied:
 - collection steps stop rendering as loose blocks (rung 6)
 - the assignee filter now narrows routines on the week grid (rung 5)

Nothing else moves; weekParity asserts the shape of the diff."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 6: Planning adopts the resolver

**Files:**
- Create: `src/components/planning/planningParity.test.ts`
- Modify: `src/components/planning/PlanningSession.tsx:458-486`
- Modify: `src/components/planning/guided/GuidedSessionContainer.tsx:92-94, 152`

**Interfaces:**
- Consumes: `resolveRoutine` (Task 1).
- Produces: `function isDraggableRoutine(routine: Routine): boolean` in `src/lib/routineUtils.ts` — `routine.time_of_day == null`. The caller-side predicate the spec keeps out of the ladder.

**Expected behavior changes:** collection steps stop appearing (rung 6); the assignee filter starts applying (rung 5).

- [ ] **Step 1: Write the failing test for `isDraggableRoutine`**

Append to `src/lib/routineUtils.resolveRoutine.test.ts`:

```ts
describe('isDraggableRoutine', () => {
  it('is true for an untimed routine', () => {
    expect(isDraggableRoutine(createMockRoutine({ time_of_day: null }))).toBe(true)
  })
  it('is false for a timed routine', () => {
    expect(isDraggableRoutine(createMockRoutine({ time_of_day: '09:00' }))).toBe(false)
  })
})
```

Add `isDraggableRoutine` to the import at the top of that file.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/routineUtils.resolveRoutine.test.ts -t isDraggableRoutine
```

Expected: FAIL — no export named `isDraggableRoutine`.

- [ ] **Step 3: Implement it**

Append to `src/lib/routineUtils.ts`:

```ts
/**
 * Caller-side, NOT a rung: planning surfaces accept only untimed routines as
 * drag sources. A timed routine is visible but cannot be dragged, which is a
 * different question from whether it shows.
 */
export function isDraggableRoutine(routine: Routine): boolean {
  return routine.time_of_day == null
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/routineUtils.resolveRoutine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Migrate PlanningSession**

Replace the two `.filter(...)` chains at `src/components/planning/PlanningSession.tsx:465-466` with one resolver call per date:

```tsx
      const routinesForDay = (getRoutinesForDate ? getRoutinesForDate(date) : routines)
        .filter((r) => resolveRoutine(r, { date, prefs: { hideRoutines, domain: currentDomain } }).shows)
```

And at line 479, replace `if (routine && routine.show_on_timeline !== false)` with:

```tsx
          if (
            routine &&
            resolveRoutine(routine, {
              date,
              prefs: { hideRoutines, domain: currentDomain },
              deferredInto: deferredIntoIds,
            }).shows
          ) {
            deferredIn.push(routine)
          }
```

**`deferredInto` is mandatory here, and omitting it is a bug.** A routine deferred
onto this day by definition does NOT recur on it, so rung 2 would veto every one
of them and the whole deferred-in branch would become dead code. This exact
regression already happened on Today and was caught in review; the resolver now
takes `deferredInto?: ReadonlySet<string>` as an instance-level override of rung 2
only. Build `deferredIntoIds` with the shared helper `deferredInRoutineIds` from
`src/lib/today/deferredRoutines.ts` (created in Task 4) rather than deriving the
set again here.

Every OTHER rung still applies, which is the point: a routine deferred into this
day that is resting, off-timeline, or someone else's stays hidden. It cannot
arrive by the back door — it just is not vetoed for failing to recur. Add `currentDomain` to the dependency array at line 486.

- [ ] **Step 6: Migrate GuidedSessionContainer**

At line 152, replace:

```tsx
    draggableRoutines: domainRoutines.filter((r) => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
```

with:

```tsx
    draggableRoutines: allRoutines.filter(
      (r) =>
        isDraggableRoutine(r) &&
        resolveRoutine(r, { date: sessionDate, prefs: { hideRoutines: true, domain: currentDomain } }).shows,
    ),
```

`hideRoutines: true` is intentional and preserves the existing `!isEverydayRoutine` behavior: a guided session is for placing non-routine work, so ambient everyday routines are never drag candidates. `sessionDate` is the date the guided session is planning for. Read it from the container's existing session state; if the session spans a range, use its first day. Do not invent a `new Date()` — the pool is date-sensitive through rung 2, so a wrong date silently changes which routines are offered.

Delete the `domainRoutines` memo at line 92 and the `filterRoutinesForDomain` wrapper at line 94; rung 4 does that work now. Drop the `isEverydayRoutine` and `filterRoutinesForDomain` imports.

- [ ] **Step 6b: Migrate the third copy of the same predicate**

`src/apps/tasks/HomeViewContainer.tsx:271` carries a character-for-character
duplicate of the draggable filter:

```tsx
allRoutines.filter(r => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
```

Replace it with the same expression used in Step 6, and delete the
`isEverydayRoutine` import if nothing else in the file uses it. Missing this
leaves a raw primitive in a render-path file and Task 9's tripwire will fail on
it — which is the tripwire working, but it is cheaper to fix here.

- [ ] **Step 7: Run everything**

```bash
npx vitest run src/components/planning/
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

Expected: all green.

- [ ] **Step 8: Look at the running app**

`npm run dev`, open a planning session. Confirm routines still appear on the day columns, collection steps no longer appear as loose rows, timed routines are still not draggable, and the hide-daily toggle still works.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(planning): adopt resolveRoutine

Collection steps stop appearing (rung 6) and the assignee filter now
applies (rung 5). isDraggableRoutine lands as a caller-side predicate,
deliberately outside the ladder: draggable is not a visibility question.

A routine deferred INTO a day now passes the same ladder, so a resting
routine can no longer arrive by the back door."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 7: The river view adopts the resolver

Smallest surface, one real bug: it reads `assigned_to` only, so a routine assigned through `assigned_to_all` is invisible there.

**Files:**
- Modify: `src/components/home/CascadingRiverView.tsx:668-672`
- Create: `src/components/home/riverParity.test.ts`

**Interfaces:**
- Consumes: `resolveRoutine` (Task 1).
- Produces: nothing new.

**Expected behavior change:** multi-assigned routines reappear in the river.

- [ ] **Step 1: Write the failing test**

Create `src/components/home/riverParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveRoutine } from '@/lib/routineUtils'
import { createMockRoutine } from '@/test/mocks/factories'

const DATE = new Date(2026, 7, 24, 9, 0, 0)
const PREFS = { hideRoutines: false, domain: 'universal' as const }

/** The river's filter before migration: assigned_to only. */
function riverBefore(r: import('@/types/actionable').Routine, selected: string[]): boolean {
  if (!r.assigned_to || !selected.includes(r.assigned_to)) return false
  if (r.show_on_timeline === false) return false
  return !!r.time_of_day
}

describe('river view — multi-assigned routines', () => {
  const multi = createMockRoutine({
    assigned_to: null,
    assigned_to_all: ['scott', 'iris'],
    time_of_day: '09:00',
  })

  it('was invisible before, because assigned_to was null', () => {
    expect(riverBefore(multi, ['scott'])).toBe(false)
  })

  it('is visible after, via owners', () => {
    expect(resolveRoutine(multi, { date: DATE, member: ['scott'], prefs: PREFS }).shows).toBe(true)
  })

  it('still excludes a routine owned by nobody selected', () => {
    const theirs = createMockRoutine({ assigned_to: 'ella', time_of_day: '09:00' })
    expect(resolveRoutine(theirs, { date: DATE, member: ['scott'], prefs: PREFS }).shows).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/components/home/riverParity.test.ts
```

Expected: the second test FAILS only if the resolver is wrong; more likely all three pass immediately, since the resolver already exists. That is fine — this test's job is to pin the bug so it cannot come back. Confirm test 1 passes (the bug was real) before moving on.

- [ ] **Step 3: Migrate the call site**

Replace `src/components/home/CascadingRiverView.tsx:669-672`:

```tsx
    for (const routine of routines) {
      if (!resolveRoutine(routine, { date: viewedDate, member: selectedAssignees, prefs: { hideRoutines, domain: currentDomain } }).shows) continue
      // The river is a clock; an untimed routine has no place on it.
      if (!routine.time_of_day) continue
```

Thread `hideRoutines` and `currentDomain` in as props if the component does not already receive them — `HomeView.tsx:357` is the only call site.

- [ ] **Step 4: Run everything**

```bash
npx vitest run src/components/home/
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

- [ ] **Step 5: Look at the running app**

`npm run dev`, open the river view. Confirm timed routines still appear at the right times and a routine assigned to several people now shows for each of them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(river): multi-assigned routines were invisible

CascadingRiverView read assigned_to only, so a routine assigned through
assigned_to_all rendered for nobody. Adopting resolveRoutine fixes it
via owners."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 8: The wall adopts the resolver

Last, because it is glanced at rather than clicked through and a bad render is not obvious for hours. **Blocked on Task 2's backfill being confirmed applied.**

**Files:**
- Modify: `src/hooks/useWallData.ts:293-300`
- Modify: `src/components/wall-v2/wallV2Adapter.ts:344-352` (`isVisible`) and `:425-440` (`canHeadline` in `adaptMemberGlance`)
- Create: `src/components/wall-v2/wallParity.test.ts`

**Interfaces:**
- Consumes: `resolveRoutine`, `isEverydayRoutine`, `isPinnedToTimeline` (Task 1); Task 2's confirmed backfill.
- Produces: `function canHeadline(item: TimelineItem, prefs: RoutinePrefs): boolean` in `wallV2Adapter.ts`.

**Do not start this task until the audit file records the backfill as applied and re-verified.** Without it, the kids' morning and bedtime routines disappear from the wall.

**Expected behavior changes:**
1. Collection steps stop rendering as loose rows (rung 6) — the largest visual delta.
2. `pin_to_timeline` and dosed routines survive "hide daily routines" (rung 7's pin escape, which the wall never had).
3. `canHeadline` becomes pref-aware: a glance card may headline an everyday routine when hide-daily is off.
4. **Multi-assigned routines reach every owner's lane and glance card.** Added by the pre-flight scan: Task 3 produces `TimelineItem.owners` and no task in the original plan consumed it. Two places on the wall read the single `assignedTo` and therefore show a routine assigned to `['scott','iris']` in Scott's lane only — `wallLanes.ownersOf` (`:95`) and `adaptMemberGlance` (`:432`). Steps 6b and 6c fix both.

- [ ] **Step 1: Confirm the backfill landed**

Read `docs/superpowers/specs/assets/2026-08-26-show-on-timeline-audit.md`. It must contain a `## Backfill` section with an applied-and-re-verified confirmation. If it does not, STOP and report that Task 8 is blocked.

- [ ] **Step 2: Write the parity test**

Create `src/components/wall-v2/wallParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS, CORPUS_DATE } from '@/lib/routineVisibility.fixtures'
import { resolveRoutine, isEverydayRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'

const ROUTINES = VISIBILITY_CORPUS.map((r) => r.routine)
const PREFS = { hideRoutines: true, domain: 'universal' as const }

/** The wall's rhythm-zone filter before migration: recurrence + hide-daily only. */
function wallBefore(r: Routine, hideDaily: boolean): boolean {
  if (r.visibility !== 'active') return false          // useRoutines
  if (!hideDaily) return true
  return !isEverydayRoutine(r.recurrence_pattern)
}

describe('wall parity — the three intended changes', () => {
  it('collection steps stop rendering as loose rows', () => {
    const steps = ROUTINES.filter((r) => r.parent_routine_id != null && r.visibility === 'active')
    expect(steps.length).toBeGreaterThan(0)
    for (const r of steps) {
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).reason).toBe('in-collection')
    }
  })

  it('pinned and dosed routines now survive hide-daily', () => {
    const pinned = ROUTINES.filter(
      (r) => (r.pin_to_timeline === true || (r.times_per_day?.length ?? 0) > 0) && r.visibility === 'active',
    )
    expect(pinned.length).toBeGreaterThan(0)
    for (const r of pinned) {
      expect(wallBefore(r, true)).toBe(false)                                          // swept before
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).shows).toBe(true)  // kept after
    }
  })

  it('nothing else changes', () => {
    const unaffected = ROUTINES.filter(
      (r) =>
        r.parent_routine_id == null &&
        r.pin_to_timeline !== true &&
        (r.times_per_day?.length ?? 0) === 0 &&
        r.show_on_timeline !== false &&
        r.context !== 'work',
    )
    for (const r of unaffected) {
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).shows).toBe(wallBefore(r, true))
    }
  })
})
```

- [ ] **Step 3: Run it**

```bash
npx vitest run src/components/wall-v2/wallParity.test.ts
```

Expected: PASS.

- [ ] **Step 4: Migrate `useWallData`**

Replace `src/hooks/useWallData.ts:293-300`. The comment about deliberately skipping `show_on_timeline` goes away — Task 2 fixed the data instead.

```ts
        // One rule for routine visibility, shared with Today. The wall used to
        // skip the hide-from-timeline flag on purpose, because the kids'
        // morning and bedtime routines used it as a Today-declutter
        // workaround. That data was fixed (see the audit under
        // docs/superpowers/specs/assets/); the flag now means the same thing
        // everywhere and the wall obeys it.
        //
        // Do not name the column literally in this comment — Task 9's tripwire
        // matches comments as well as code, deliberately: a comment naming the
        // flag almost always sits beside logic that reads it.
        //
        // hideRoutines stays false here: the wall's own toggle is applied
        // downstream in wallV2Adapter, per section, not to the day's pool.
        const dayRoutines = routines.filter(
          (r) =>
            resolveRoutine(r, {
              date,
              prefs: { hideRoutines: false, domain: 'universal' },
              lastCompletedAt: lastCompletionByRoutine.get(r.id) ?? null,
            }).shows,
        )
```

- [ ] **Step 5: Migrate `wallV2Adapter.isVisible`**

Replace the routine clause at `src/components/wall-v2/wallV2Adapter.ts:348-351`:

```ts
  const isVisible = (i: TimelineItem) => {
    if (i.type === 'event') return false;            // all events → band (timed or all-day strip)
    if (isCommitment(i)) return false;               // timed tasks → band
    if (i.type !== 'routine') return true;
    if (!hideDailyRoutines) return true;
    // Rung 7's pin escape, which the wall never had: a pinned or dosed routine
    // is a tracked obligation (PT exercises), not ambient noise.
    if (i.originalRoutine && isPinnedToTimeline(i.originalRoutine)) return true;
    return !isEverydayRoutine(i.recurrencePattern);
  };
```

Import `isPinnedToTimeline` from `@/lib/routineUtils`.

- [ ] **Step 6: Make `canHeadline` pref-aware**

Extract the inline skip at `src/components/wall-v2/wallV2Adapter.ts:436` into a named function above `adaptMemberGlance`:

```ts
/**
 * Whether an item may headline a member's glance card. Not a visibility
 * question — a routine can be on the wall and still be the wrong thing to lead
 * with. Everyday routines are the day's background rhythm ("brush teeth"), so
 * they only headline when the user has chosen to see everyday routines at all.
 */
function canHeadline(item: TimelineItem, prefs: { hideRoutines: boolean }): boolean {
  if (item.type !== 'routine') return true;
  if (!isEverydayRoutine(item.recurrencePattern)) return true;
  return !prefs.hideRoutines;
}
```

Replace line 436 with `if (!canHeadline(item, { hideRoutines: hideDailyRoutines })) continue;` and thread `hideDailyRoutines` into `adaptMemberGlance`'s signature and its call site.

- [ ] **Step 6b: Multi-assigned routines reach every lane**

`src/components/wall-v2/wallLanes.ts:95` ends `ownersOf` with:

```ts
  return item.assignedTo ? [item.assignedTo] : [];
```

so a routine assigned to `['scott', 'iris']` lands in Scott's lane only. Replace it with:

```ts
  // Routine items carry every owner (routineToTimelineItem -> routineOwners).
  // assignedTo is the legacy single column and stays the fallback for item
  // types that do not populate owners yet.
  if (item.owners && item.owners.length > 0) return [...item.owners];
  return item.assignedTo ? [item.assignedTo] : [];
```

- [ ] **Step 6c: Multi-assigned routines reach every glance card**

`src/components/wall-v2/wallV2Adapter.ts:432` reads:

```ts
      if (item.assignedTo !== member.id) continue;
```

Replace it with:

```ts
      const itemOwners = item.owners?.length ? item.owners : item.assignedTo ? [item.assignedTo] : [];
      if (!itemOwners.includes(member.id)) continue;
```

Add this to `src/components/wall-v2/wallParity.test.ts`:

```ts
import { routineToTimelineItem } from '@/types/timeline'
import { createMockRoutine } from '@/test/mocks/factories'

describe('a multi-assigned routine reaches every owner', () => {
  it('carries both owners onto the timeline item', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] })
    expect(routineToTimelineItem(r, CORPUS_DATE).owners).toEqual(['scott', 'iris'])
  })
})
```

- [ ] **Step 7: Run everything**

```bash
npx vitest run src/components/wall-v2/ src/hooks/
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/
```

- [ ] **Step 8: Look at the wall at its real size**

This is the step that matters most on this task. `npm run dev`, then open the wall route in a 1024x768 iframe or window — not a maximized desktop browser, which hides density problems.

Confirm: the kids' morning and bedtime routines are still on the wall (if they are not, the Task 2 backfill was incomplete — STOP and report); collection steps no longer appear as loose rows; toggling "Hide daily routines" keeps pinned and dosed routines; the lanes still have content and no lane has collapsed to empty.

Then screenshot the real Pi (see the Pi SSH + `grim` notes) and compare against the pre-change wall before pushing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(wall): adopt resolveRoutine

Three intended changes:
 - collection steps stop rendering as loose rows (rung 6)
 - pinned and dosed routines survive hide-daily (rung 7's pin escape)
 - canHeadline is pref-aware, so a glance card may lead with an everyday
   routine when hide-daily is off

The wall no longer skips show_on_timeline. The data that made that
necessary was fixed first — see the show_on_timeline audit."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

### Task 9: The tripwire, and the surface that deliberately opts out

Without this, call site #16 appears within a month and the whole exercise unwinds.

**Files:**
- Create: `src/lib/routineVisibilityCoverage.test.ts`
- Modify: `src/components/routine/RhythmPage.tsx:196`
- Modify: `src/components/routine/rhythm/tendHeuristics.ts:49`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the tripwire test**

Create `src/lib/routineVisibilityCoverage.test.ts`, modelled on `src/lib/scopeDefaultCoverage.test.ts`:

```ts
// Tripwire: routine visibility is decided in ONE place.
//
// Before resolveRoutine, "should this routine show?" was answered in 15 places
// across 18 files, each implementing a different subset of the rule. The same
// routine appeared on one surface and not another for no reason a user could
// name. This test exists so that does not happen again by accretion.
//
// It fails if a raw visibility primitive appears in a render-path file outside
// the allowlist. If you are adding a legitimate exception, add it here
// deliberately — that edit is the point.
//
// What this does NOT catch, verified against the tree rather than guessed:
//   - a check written through a variable (`const flag = r.show_on_timeline`)
//   - a check inside a .test.ts file (excluded on purpose — tests may assert
//     on raw columns, and the parity tests must)
//
// It DOES match comments as well as code. Deliberate, not a bug: a comment
// naming one of these flags almost always sits beside logic that reads it,
// and the false positives are cheap to reword.
//   - a check in supabase/functions or connectors, which do not render
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** Raw primitives that answer "should this routine show?". */
const PRIMITIVES = [
  'show_on_timeline',
  'pin_to_timeline',
  'isEverydayRoutine',
  "visibility === 'active'",
  "visibility !== 'active'",
]

/**
 * Files allowed to name a primitive, each for a stated reason.
 * ADDING TO THIS LIST IS A DESIGN DECISION, not a formality.
 */
const ALLOWED = new Map<string, string>([
  ['lib/routineUtils.ts', 'the resolver itself — the one place the rule lives'],
  ['lib/routineVisibility.fixtures.ts', 'the conformance corpus builds raw routines'],
  ['test/mocks/factories.ts', 'createMockRoutine sets the raw column defaults every fixture starts from'],
  ['types/actionable.ts', 'the column declarations'],
  ['hooks/useRoutines.ts', 'the WRITE path: create/update and the paused_until auto-resume'],
  ['components/routine/RoutineForm.tsx', 'the editor UI that toggles the flags'],
  ['components/detail/DetailPanelRedesign.tsx', 'the detail panel that toggles the flags'],
  ['components/surface/TapRoutinePanel.tsx', 'the tap panel that toggles the flags'],
  ['components/routine/RhythmPage.tsx', 'Tend deliberately shows RESTING routines — opted out, see the comment there'],
  ['components/routine/rhythm/tendHeuristics.ts', 'same opt-out as RhythmPage'],
  ['components/routine/rhythm/rhythmModel.ts', 'management surface, not a render path'],
  ['hooks/useSystemHealth.ts', 'diagnostics: counts unassigned ACTIVE routines'],
  ['components/layout/RecentlyUpdated.tsx', 'an activity log, not a schedule surface'],
  ['components/wall-v2/wallV2Adapter.ts', 'canHeadline + the hide-daily section sweep — ranking, not visibility'],
  ['components/wall-v2/wallLanes.ts', 'lane packing reads everyday-ness for density, not visibility'],
  ['components/wall-v2/wallGantt.ts', 'bar sizing reads everyday-ness for density, not visibility'],
])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__fixtures__') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

describe('routine visibility lives in one place', () => {
  it('no render-path file decides visibility on its own', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (ALLOWED.has(rel)) continue
      const body = readFileSync(file, 'utf8')
      for (const p of PRIMITIVES) {
        if (body.includes(p)) offenders.push(`${rel} names ${p}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every allowlist entry still exists', () => {
    const missing = [...ALLOWED.keys()].filter((rel) => {
      try {
        return !statSync(join(SRC, rel)).isFile()
      } catch {
        return true
      }
    })
    expect(missing).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and read the failures**

```bash
npx vitest run src/lib/routineVisibilityCoverage.test.ts
```

Expected: FAIL, listing any file Tasks 4-8 left behind. Each offender is either a missed migration (go fix it) or a legitimate exception (add it to `ALLOWED` **with a reason**). Do not add an entry without writing why.

- [ ] **Step 3: Document Tend's opt-out at the source**

Above `src/components/routine/RhythmPage.tsx:196`, add:

```tsx
      // Deliberately NOT resolveRoutine. Tend is a management surface: its job
      // is to show RESTING routines so you can wake them, which is the exact
      // opposite of rung 1. Filtering to `visibility === 'active'` here is the
      // seasonal shelf's own rule, not a stale copy of the visibility ladder.
```

Add the same comment above `src/components/routine/rhythm/tendHeuristics.ts:49`.

- [ ] **Step 4: Run it green**

```bash
npx vitest run src/lib/routineVisibilityCoverage.test.ts
npx vitest run src/
npx tsc --noEmit -p tsconfig.app.json
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(routines): tripwire — visibility is decided in one place

Fails if a render-path file names show_on_timeline, pin_to_timeline,
isEverydayRoutine, or a visibility === 'active' check outside the
allowlist. Every allowlist entry carries the reason it is there, so the
next exception is a decision rather than an accretion.

Tend's opt-out is now stated at the source: it shows resting routines on
purpose, which is the opposite of rung 1."
# Do NOT push. The controller pushes after this task's review passes —
# pushing to main auto-deploys to production, and unreviewed code must
# never reach it. Centralising the push also keeps the rebase/retry race
# with sibling sessions in one place.
```

---

## Done when

- `npx vitest run src/` is green and `npx tsc --noEmit -p tsconfig.app.json` is clean.
- The tripwire passes, and every allowlist entry has a written reason.
- The wall has been looked at on the Pi at 1024x768, after the backfill, and the kids' morning and bedtime routines are still on it.
- Every behavior change that landed is named in a commit message: collection steps off the wall / week / month / planning, the pin escape on the wall and week grid, multi-assigned routines back in the river, `canHeadline` pref-aware, and the assignee filter reaching routines on the week grid and planning.

## Not in this plan

- Step B (the board) and step C (closing the chat gap). Both depend on this and follow it.
- Any change to `assigned_to`, `assigned_to_all`, or `default_assignee`. Read-side only.
- Rhythm/Tend visibility rules — opted out on purpose.
- Splitting the specials event on Today. Decided against; wall only.
