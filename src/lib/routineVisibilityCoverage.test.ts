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
// Both spellings of the resting check are watched — `visibility === 'active'`
// / `!== 'active'` AND `visibility === 'reference'` / `!== 'reference'`.
// `RoutineVisibility` is a strict two-value enum (types/actionable.ts), so
// `=== 'reference'` is logically identical to `!== 'active'` (and vice
// versa). A guard that watched only the 'active' spellings would let the
// complementary literal answer the exact same question, unseen — which is
// exactly how a live call site (TodayView's clarity count, fixed alongside
// this comment) slipped through undetected.
//
// What this does NOT catch, verified against the tree rather than guessed:
//   - a check written through a variable (`const flag = r.show_on_timeline`,
//     or `const resting = r.visibility !== 'active'` assigned once and read
//     elsewhere)
//   - the same rule expressed with no primitive in this list at all — e.g.
//     reasoning from `parent_routine_id`, `times_per_day`, `paused_until`, or
//     re-deriving `matchesRecurrenceForDate`'s logic by hand instead of
//     calling it
//   - a check inside a .test.ts file (excluded on purpose — tests may assert
//     on raw columns, and the parity tests must)
//   - a check in supabase/functions or connectors, which do not render
//   - anything inside a directory named `__fixtures__` (currently only
//     `lib/today/__fixtures__`) — walked past entirely by `sourceFiles`, the
//     same way `node_modules` is. No live evasion exists today; this is
//     listed because the value of this list is being complete, not because
//     anyone is using it that way.
//
// It DOES match comments as well as code. Deliberate, not a bug: a comment
// naming one of these flags almost always sits beside logic that reads it,
// and the false positives are cheap to reword.
//
// The bigger honesty gap: this guard only watches rungs 1, 3, and 7
// (`visibility`, `show_on_timeline`, `isEverydayRoutine`). A new call site
// can reimplement rung 6 via `parent_routine_id`, rung 2 via
// `getRoutinesForDatePure`/`matchesRecurrenceForDate`, rung 4 via
// `filterRoutinesForLayers`, or rung 5 via `makeAssigneeFilter`, and this
// test will stay green. Those identifiers are deliberately NOT added to
// PRIMITIVES — they are legitimately used all over the codebase for things
// that have nothing to do with visibility, and watching them would make this
// guard noisy enough that someone deletes it. Documenting the limit honestly
// here is the correct trade-off, not a TODO.
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
  "visibility === 'reference'",
  "visibility !== 'reference'",
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
  [
    'components/routine/rhythm/rhythmModel.ts',
    'the same Tend opt-out as RhythmPage/tendHeuristics, expressed via the ' +
      "complementary literal — Tend deliberately surfaces resting routines.",
  ],
  ['hooks/useSystemHealth.ts', 'diagnostics: counts unassigned ACTIVE routines'],
  ['components/layout/RecentlyUpdated.tsx', 'an activity log, not a schedule surface'],
  [
    'components/wall-v2/wallV2Adapter.ts',
    "canHeadline + the hide-daily section sweep make a per-band visibility " +
      'decision (an everyday unpinned routine can drop from the rhythm band ' +
      'when hide-daily is on) — safe only because the Gantt board renders ' +
      'everyday routines unconditionally, so nothing leaves the wall entirely.',
  ],
  ['components/wall-v2/wallLanes.ts', 'lane packing reads everyday-ness for density, not visibility'],
  ['components/wall-v2/wallGantt.ts', 'bar sizing reads everyday-ness for density, not visibility'],
  [
    'hooks/useWallData.ts',
    'Task 8b landed: useWallData now calls resolveRoutine for rungs 1, 2, ' +
      'and 4. Two TEMPORARY overrides remain at that one call site, each ' +
      'shown by matching `show_on_timeline` (this file\'s guard, not ' +
      'parent_routine_id — that primitive is deliberately not watched, see ' +
      'the file header): ' +
      '(1) `show_on_timeline: true` — rung 3 is blocked on the ' +
      'show_on_timeline data audit; the kids\' morning/bedtime routines use ' +
      'that flag as a Today-declutter workaround, so honouring rung 3 here ' +
      'would delete them from the wall. Remove once the audit lands. ' +
      '(2) `parent_routine_id: null` — rung 6 is excepted because ' +
      'days[].items also feeds the live /morning and /bedtime kid ' +
      'checklists (MorningLaunchView, BedtimeView), which filter on ' +
      'assignedTo only and fall back to hardcoded default steps (whose taps ' +
      'do not persist) when a kid\'s assigned items come back empty — a ' +
      'kid\'s real checklist IS a collection\'s Steps. Remove once those two ' +
      'screens read collections themselves instead of relying on Steps ' +
      'reaching them unfiltered. Do not remove this entry until BOTH ' +
      'overrides are gone.',
  ],
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
