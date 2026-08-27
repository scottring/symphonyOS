import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS } from '@/lib/routineVisibility.fixtures'
import { corpusScenarios, recordVisible } from './surfaceParity'
import { filterRoutinesForDomain } from './domainFilter'
import { makeAssigneeFilter } from './assigneeFilter'
import { getRoutinesForDatePure, isEverydayRoutine } from '@/lib/routineUtils'
import { selectVisibleRoutines } from './statusMaps'
import type { Routine } from '@/types/actionable'
import type { ResolveRoutineCtx } from '@/lib/routineUtils'

// WHAT THIS TEST PROVES, AND WHAT IT DOES NOT.
//
// This is a characterization test: it replays the shared conformance corpus
// through the LEGACY Today pipeline ("before", reassembled below from the six
// files it used to be spread across) and through the migrated pipeline
// ("after", the real `selectVisibleRoutines`), then diffs the two id sets.
//
// It proves the migration preserved Today's routine pool, modulo a small,
// explicitly named set of intended divergences (KNOWN_DIVERGENCES below). Any
// id that differs between before/after and is NOT on that list fails the
// test loudly — there is no wildcard or index-based matching here.
//
// It does NOT prove that `resolveRoutine` matches the conformance corpus's
// `expected` column — that is `src/lib/routineUtils.resolveRoutine.test.ts`'s
// job, and comparing the corpus's `expected` field against BEFORE (the
// legacy pipeline) is a category error: `expected` specifies the resolver,
// not legacy behavior, and the two were never guaranteed to agree row for
// row. (An earlier version of this file made exactly that comparison; it
// failed on 4 of 10 scenarios, two of which were real before/after
// divergences and two of which were artifacts of comparing the wrong two
// things — see KNOWN_DIVERGENCES and the note below it.)

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

type Direction = 'onlyBefore' | 'onlyAfter'

interface KnownDivergence {
  /** The corpus routine id this divergence fires on. Ids are unique across the whole corpus. */
  routineId: string
  /** 'onlyBefore' = legacy shows it and the resolver doesn't. 'onlyAfter' = the reverse. */
  direction: Direction
  /** Narrows which scenario this applies to, so a coincidental id collision elsewhere can't mask a real regression. */
  matchesScenario: (ctx: ResolveRoutineCtx) => boolean
  /** Why this is intended, not a bug. */
  reason: string
}

// Corpus rows are looked up by their (stable, human-written) label rather
// than by their auto-generated `routine.id` — createMockRoutine's ids are
// sequential counters, so a hardcoded 'routine-21' silently points at the
// WRONG row the moment any row is added or reordered above it in the corpus
// array. This bit once already (fix round 2): adding two module-level
// fixtures shifted every subsequent id by two, and the hardcoded ids below
// quietly started naming the wrong routines. Looking up by label is immune
// to that.
function corpusRoutineId(label: string): string {
  const row = VISIBILITY_CORPUS.find((r) => r.label === label)
  if (!row) throw new Error(`todayParity KNOWN_DIVERGENCES: no corpus row labeled "${label}"`)
  return row.routine.id
}

// The only (routine, direction) pairs where before and after are EXPECTED to
// disagree. Anything not listed here must agree — if it doesn't, the test
// fails on that id specifically, not on a swallowed "some mismatch somewhere."
//
// Both are the two documented, reviewed rung-5 divergences between
// `makeAssigneeFilter` (legacy) and `resolveRoutine`'s `routineOwners`,
// already pinned by `KNOWN_DIVERGENCES` in
// `src/lib/routineUtils.resolveRoutine.test.ts` (Task 1's review round).
// They surface here again because Today is the first surface to actually
// adopt rung 5 — that is expected, not new.
const DEFERRAL_OVERRIDE_ID = corpusRoutineId(
  'a deferred-in routine survives rung 2 even though its recurrence does not match',
)

const KNOWN_DIVERGENCES: readonly KnownDivergence[] = [
  {
    routineId: corpusRoutineId('assigned_to_all wins over assigned_to when both are set'),
    direction: 'onlyBefore',
    matchesScenario: (ctx) => ctx.member === 'scott' && ctx.prefs.hideRoutines === false,
    reason:
      "Divergence (b): assigned_to='scott', assigned_to_all=['iris']. The resolver lets a " +
      'non-empty assigned_to_all win outright, so Scott no longer owns it. The legacy ' +
      'makeAssigneeFilter OR-combines the two columns and still matches Scott on the stale ' +
      'assigned_to. Three of five routine-assignment write paths leave assigned_to stale after ' +
      'reassigning through assigned_to_all alone, so the OR-combine is the bug being fixed here, ' +
      'not a rule to preserve.',
  },
  {
    routineId: corpusRoutineId('default_assignee is an owner when nothing else is set'),
    direction: 'onlyAfter',
    matchesScenario: (ctx) => ctx.member === 'kaleb' && ctx.prefs.hideRoutines === false,
    reason:
      "Divergence (a): assigned_to=null, assigned_to_all=null, default_assignee='kaleb'. The " +
      "resolver's routineOwners falls back to default_assignee when nothing else is set, so " +
      'Kaleb now owns it. makeAssigneeFilter has no default_assignee fallback, so legacy never ' +
      'matched him.',
  },
  {
    routineId: DEFERRAL_OVERRIDE_ID,
    direction: 'onlyAfter',
    // Scoped to the exact scenario whose deferredInto Set names THIS routine
    // — the corpus has a second, unrelated deferredInto scenario (the
    // resting-routine row) that must not accidentally match here too.
    matchesScenario: (ctx) => ctx.deferredInto?.has(DEFERRAL_OVERRIDE_ID) ?? false,
    reason:
      'Fix round 2 CRITICAL: a routine dragged onto another day writes a one-day `deferred_to` ' +
      'override rather than rewriting recurrence_pattern (routineTime.ts). The resolver\'s rung 2 ' +
      'now honors `ctx.deferredInto` and lets the placement win; `todayPipelineBefore` is frozen ' +
      'and models only getRoutinesForDatePure (no deferral awareness at all), so it still drops ' +
      'this routine as not-today. This is the bug the coordinator flagged, now fixed in ' +
      '`selectVisibleRoutines`/`resolveRoutine` — legacy behavior (before) is the one that was ' +
      'wrong here, which is exactly why this is an onlyAfter divergence rather than a regression.',
  },
]

// NOT a divergence, despite two corpus rows looking like one at first glance:
// 'a collection step never renders on its own' and 'in-collection beats
// everyday — rung 6 wins' both have parent_routine_id set. Neither legacy
// nor the migrated `selectVisibleRoutines` drops a Step from the POOL —
// legacy never excluded steps at all, and the migrated function deliberately
// retains any row whose only resolveRoutine reason is 'in-collection' so
// grouping.ts/routineCollections.ts can still reconstruct the collection
// downstream. So before and after AGREE on both ids (both keep them) — there
// is nothing to list here. They only looked like failures in an earlier,
// incorrect version of this test that compared `before` against the
// corpus's `expected` column, which encodes resolveRoutine's per-row verdict
// ('in-collection' = not on its own), not pool membership.
//
// Also not a divergence: 'the same routine, without the deferral recorded,
// still fails rung 2' and 'a deferral does not leapfrog rung 1 — resting
// still wins'. Both behave identically before and after — no deferredInto
// membership means rung 2 runs unmodified (same as always), and rung 1
// short-circuits before rung 2 is ever reached regardless of deferredInto.

function isKnownDivergence(routineId: string, direction: Direction, ctx: ResolveRoutineCtx): boolean {
  return KNOWN_DIVERGENCES.some(
    (d) => d.routineId === routineId && d.direction === direction && d.matchesScenario(ctx),
  )
}

describe('Today surface parity', () => {
  for (const [key, rows] of corpusScenarios(VISIBILITY_CORPUS)) {
    const ctx = rows[0].ctx
    it(`before and after agree for ${key}`, () => {
      const routines = rows.map((r) => r.routine)
      const before = recordVisible(routines, (rs) => todayPipelineBefore(rs, ctx), (r) => r.id)
      const after = recordVisible(routines, (rs) => selectVisibleRoutines(rs, ctx), (r) => r.id)

      const onlyBefore = before.filter((id) => !after.includes(id))
      const onlyAfter = after.filter((id) => !before.includes(id))

      const unexpectedOnlyBefore = onlyBefore.filter((id) => !isKnownDivergence(id, 'onlyBefore', ctx))
      const unexpectedOnlyAfter = onlyAfter.filter((id) => !isKnownDivergence(id, 'onlyAfter', ctx))

      expect(unexpectedOnlyBefore, 'ids legacy shows that the migrated pipeline unexpectedly drops').toEqual([])
      expect(unexpectedOnlyAfter, 'ids the migrated pipeline shows that legacy unexpectedly did not').toEqual([])

      // A named divergence that stops firing means the underlying difference
      // was fixed (or broken) elsewhere, and the entry is stale — it must be
      // deleted, not left here silently passing.
      for (const d of KNOWN_DIVERGENCES.filter((d) => d.matchesScenario(ctx))) {
        const pool = d.direction === 'onlyBefore' ? onlyBefore : onlyAfter
        expect(pool, `expected known divergence on ${d.routineId} to still fire`).toContain(d.routineId)
      }
    })
  }
})
