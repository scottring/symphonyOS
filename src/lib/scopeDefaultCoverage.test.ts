// Guard against the family-context/scope divergence: a row that claims a life
// area but forgets who can see it.
//
// Sharing runs on TWO columns that must agree:
//   - `context` ('family') is the LIFE AREA. Views filter on it.
//   - `scope`   ('compound') is WHO CAN SEE IT. RLS filters on it, and only it
//     (2026-06-07_scope_axis.sql:34 for tasks, :67 for notes).
//
// `scope` is NOT NULL DEFAULT 'individual'. So a write that sets a family
// context and omits `scope` produces a row that appears on every family surface
// for its OWNER and is unreadable by the rest of the household. It looks shared
// and isn't, and nothing on screen says so.
//
// addTask() gets this right via defaultScopeForArea() (src/lib/scope.ts).
// THREE call sites built the payload by hand instead and did not:
//   - the wall's quick capture (WallV2Shell)
//   - extract-capture (task rows + triage note)
//   - vault-sync (note upsert)
//
// The first version of this guard caught the first two and MISSED vault-sync,
// on three counts, all of which this version now handles:
//   1. it scanned `.insert(` only; vault-sync uses `.upsert(`.
//   2. it required a LITERAL `context: 'family'`; vault-sync passes a mapped
//      value (`context: context`). The presence of a `context` key is now
//      enough to demand a `scope` key beside it.
//   3. it only read inline object literals; vault-sync builds `noteData` as a
//      variable first. Still unhandled generically — covered by the explicit
//      per-file assertions below instead.
//
// What this STILL does not catch (verified against the current tree, not guessed):
//   - any payload assembled in a variable, in src/. Only the three edge-function
//     writers are pinned by name; an equivalent variable-built payload under
//     src/ would slip through.
//   - a scope written as a non-literal whose runtime value is 'individual'.
//     Only the KEY's presence is checked, never its value.
//   - writes through an RPC or a database function rather than the JS client.
//   - the UPDATE path (useSupabaseTasks' dbUpdates), which has its own
//     context->scope coupling and its own tests.
//   - untagged (context-null) rows, which are `individual` by design and are a
//     triage question, not a bug — and which are the LARGER half of the
//     real-world symptom this bug class produced.
//
// Bottom line: a tripwire for a scoped-table write that names a context and
// forgets the scope, plus three named files pinned by explicit assertion.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defaultScopeForArea } from './scope'

const SRC = join(process.cwd(), 'src')
const FUNCTIONS = join(process.cwd(), 'supabase/functions')

/** The five tables that carry a `scope` column (2026-06-07_scope_axis.sql:9-13). */
const SCOPED_TABLES = ['tasks', 'routines', 'projects', 'contacts', 'notes']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Comments describe the rule (including this file's own docs); only code counts. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * `.from('<scoped table>') … .insert({…})` or `.upsert({…})` with an inline
 * payload. The bounded `[\s\S]{0,400}?` lets `.select()`/`.eq()` and line breaks
 * sit between the two calls. Nested braces inside a payload (e.g. a jsonb
 * column) end the match early; that can only produce a FALSE POSITIVE (a scope
 * key after the cut), never a miss — the safe direction for a tripwire.
 */
const SCOPED_WRITE = new RegExp(
  `\\.from\\(\\s*'(${SCOPED_TABLES.join('|')})'\\s*\\)[\\s\\S]{0,400}?\\.(insert|upsert)\\(\\s*\\{([^{}]*)\\}`,
  'g',
)

/**
 * Writes that name a context but genuinely need no scope. Adding to this list
 * should require showing the context can never be 'family' at runtime.
 */
const ALLOWED: Record<string, string> = {
  'supabase/functions/capture-to-inbox/index.ts':
    "Writes a literal `context: null` — a private, untriaged inbox task by " +
    "design (see the file's own header). 'individual' is the correct scope.",
}

describe('a written context implies a written scope', () => {
  it('defaultScopeForArea is the single definition of the coupling', () => {
    // If this flips, every hardcoded 'compound' beside a family context is stale.
    expect(defaultScopeForArea('family')).toBe('compound')
  })

  it('no inline insert/upsert to a scoped table names a context without a scope', () => {
    const offenders: string[] = []

    for (const file of [...sourceFiles(SRC), ...sourceFiles(FUNCTIONS)]) {
      const rel = file.replace(process.cwd() + '/', '')
      if (ALLOWED[rel]) continue
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const match of text.matchAll(SCOPED_WRITE)) {
        const [, table, , payload] = match
        if (!/\bcontext:/.test(payload)) continue
        if (/\bscope:/.test(payload)) continue
        offenders.push(`${rel} -> ${table}`)
      }
    }

    expect(
      offenders,
      'These writes set a life-area context but leave scope at its ' +
        "'individual' default, so the row is invisible to the rest of the " +
        'household. Add scope beside the context (see defaultScopeForArea).',
    ).toEqual([])
  })

  // Pinned by name: these build their payload in a way the scan above either
  // cannot see (vault-sync's variable) or would catch only by accident.
  it('extract-capture sets a scope on both of its family-context writes', () => {
    const text = stripComments(
      readFileSync(join(FUNCTIONS, 'extract-capture/index.ts'), 'utf8'),
    )
    // Two known writers: the task row (buildTaskRow) and the triage note.
    // A third should fail this count and force a look rather than sliding in.
    expect(text.match(/context:\s*'family'/g) ?? []).toHaveLength(2)
    expect(text.match(/scope:\s*'compound'/g) ?? []).toHaveLength(2)
  })

  it('vault-sync couples scope to the mapped context on its note upsert', () => {
    const text = stripComments(
      readFileSync(join(FUNCTIONS, 'vault-sync/index.ts'), 'utf8'),
    )
    // The payload is a variable, so assert the coupling expression itself.
    expect(text).toMatch(
      /scope:\s*context === 'family' \? 'compound' : 'individual'/,
    )
  })
})
