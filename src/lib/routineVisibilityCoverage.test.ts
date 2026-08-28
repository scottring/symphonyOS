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
//   - a check in supabase/functions or connectors, which do not render
//
// It DOES match comments as well as code. Deliberate, not a bug: a comment
// naming one of these flags almost always sits beside logic that reads it,
// and the false positives are cheap to reword.
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
  ['hooks/useSystemHealth.ts', 'diagnostics: counts unassigned ACTIVE routines'],
  ['components/layout/RecentlyUpdated.tsx', 'an activity log, not a schedule surface'],
  ['components/wall-v2/wallV2Adapter.ts', 'canHeadline + the hide-daily section sweep — ranking, not visibility'],
  ['components/wall-v2/wallLanes.ts', 'lane packing reads everyday-ness for density, not visibility'],
  ['components/wall-v2/wallGantt.ts', 'bar sizing reads everyday-ness for density, not visibility'],
  [
    'hooks/useWallData.ts',
    'TEMPORARY: pending Task 8b — the wall cannot adopt rung 3 until the ' +
      'show_on_timeline data audit and backfill are done; remove this entry ' +
      'when 8b lands.',
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
