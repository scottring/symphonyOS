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

// Fixed instances (not built inline) so a deferral row and its "same routine,
// no deferral" counterpart below can both reference the identical id.
const DEFERRED_ROUTINE = base({ recurrence_pattern: { type: 'weekly', days: ['fri'] } })
const DEFERRED_RESTING_ROUTINE = base({
  recurrence_pattern: { type: 'weekly', days: ['fri'] },
  visibility: 'reference',
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

  // --- rung 2 override: a cross-day deferral (dragged onto CORPUS_DATE) ---
  // A drag writes a one-day `deferred_to` override rather than rewriting
  // `recurrence_pattern` (see routineTime.ts) — so `deferredInto` has to let
  // the instance-level placement win over the pattern's own verdict, without
  // reaching past rung 1.
  {
    label: 'a deferred-in routine survives rung 2 even though its recurrence does not match',
    routine: DEFERRED_ROUTINE,
    ctx: ctx({ deferredInto: new Set([DEFERRED_ROUTINE.id]) }),
    expected: 'shows',
  },
  {
    label: 'the same routine, without the deferral recorded, still fails rung 2',
    routine: DEFERRED_ROUTINE,
    ctx: ctx(),
    expected: 'not-today',
  },
  {
    label: 'a deferral does not leapfrog rung 1 — resting still wins',
    routine: DEFERRED_RESTING_ROUTINE,
    ctx: ctx({ deferredInto: new Set([DEFERRED_RESTING_ROUTINE.id]) }),
    expected: 'resting',
  },

  // --- rung 2 override: date: null (the date-agnostic question) ---
  // Drag POOLS (Planning's draggableRoutines) offer a routine for placement
  // onto any of several visible days, not one specific day — a single-day
  // recurrence check would make a routine that only recurs later in the
  // range vanish from the pool entirely. `date: null` skips rung 2 and ONLY
  // rung 2: every other rung still has to hide it when it should.
  {
    label: 'date: null skips rung 2 for a routine that recurs on no nearby day',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] } }),
    ctx: ctx({ date: null }),
    expected: 'shows',
  },
  {
    label: 'date: null still hides a resting routine — rung 1 is unaffected',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] }, visibility: 'reference' }),
    ctx: ctx({ date: null }),
    expected: 'resting',
  },
  {
    label: 'date: null still hides an off-timeline routine — rung 3 is unaffected',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] }, show_on_timeline: false }),
    ctx: ctx({ date: null }),
    expected: 'off',
  },
  {
    label: 'date: null still hides a collection step — rung 6 is unaffected',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] }, parent_routine_id: 'some-parent' }),
    ctx: ctx({ date: null }),
    expected: 'in-collection',
  },
  {
    label: 'date: null still hides an other-domain routine — rung 4 is unaffected',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] }, context: 'work' }),
    ctx: ctx({ date: null, prefs: { hideRoutines: false, domain: 'family' } }),
    expected: 'other-domain',
  },
  {
    label: 'date: null still hides a not-theirs routine — rung 5 is unaffected',
    routine: base({ recurrence_pattern: { type: 'weekly', days: ['tue'] }, assigned_to: 'iris' }),
    ctx: ctx({ date: null, member: 'scott' }),
    expected: 'not-theirs',
  },
  // rung 7 gets its own two rows, not folded into the four above: this is
  // the ONE live production combination (GuidedSessionContainer.tsx passes
  // date: null with hideRoutines: true for the guided weekly session's drag
  // pool, so ambient everyday routines are never offered) and it was
  // previously the only one of the seven non-rung-2 rungs left unpinned.
  {
    label: 'date: null with hideRoutines sweeps an everyday routine — rung 7 is unaffected',
    routine: base({ recurrence_pattern: { type: 'daily' } }),
    ctx: ctx({ date: null, prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'everyday',
  },
  {
    label: 'date: null with hideRoutines still shows a pinned everyday routine — the rung 7 exemption holds',
    routine: base({ recurrence_pattern: { type: 'daily' }, pin_to_timeline: true }),
    ctx: ctx({ date: null, prefs: { hideRoutines: true, domain: 'universal' } }),
    expected: 'shows',
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
