// Guard against ONE shape of the family-context/scope divergence — not the
// whole class. Read the gaps below before trusting this file.
//
// Sharing runs on TWO columns that must agree:
//   - `context` ('family') is the LIFE AREA. Views filter on it.
//   - `scope`   ('compound') is WHO CAN SEE IT. RLS filters on it, and only it
//     (2026-06-07_scope_axis.sql:34).
//
// `scope` is NOT NULL DEFAULT 'individual'. So a raw insert that sets
// `context: 'family'` and omits `scope` produces a row that appears on every
// family-scoped surface for its OWNER and is unreadable by the rest of the
// household. It looks shared and isn't, and nothing on screen says so.
//
// addTask() gets this right via defaultScopeForArea() (src/lib/scope.ts).
// Two call sites bypassed addTask and wrote the raw object instead — the wall's
// quick capture and the extract-capture edge function — and produced 5 such
// tasks plus 3 such notes before anyone noticed, because the failure mode is a
// row the OTHER person silently never sees. This catches the shape itself.
//
// What it does NOT catch (verified against the current tree, not guessed):
//   - a scope written as a non-literal, e.g. `scope: someVar` where someVar is
//     'individual' at runtime. Only the literal's PRESENCE is checked, never
//     its value.
//   - `context: "family"` in double quotes, or a computed key.
//   - inserts where context is a variable that happens to hold 'family' — the
//     detector anchors on the literal `context: 'family'`.
//   - a payload built up across statements (`const row = {...}; row.context =
//     'family'`) rather than as one object literal.
//   - the UPDATE path (useSupabaseTasks' dbUpdates), which has its own
//     context->scope coupling and its own tests.
//   - supabase/functions/** is NOT scanned here — Deno sources live outside
//     src/ and outside tsconfig. extract-capture is covered by the explicit
//     assertion at the bottom instead.
//
// Bottom line: a narrow tripwire for an object literal that sets a family
// context and forgets the scope beside it.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defaultScopeForArea } from './scope'

const SRC = join(process.cwd(), 'src')
const EXTRACT_CAPTURE = join(
  process.cwd(),
  'supabase/functions/extract-capture/index.ts',
)

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
 * An object literal passed to .insert(...) — from the opening `insert({` to the
 * matching `}`. Nested braces inside a payload (e.g. a jsonb column) would end
 * the match early; no current call site has one, and an early end can only
 * produce a FALSE POSITIVE (scope appearing after the cut), never a miss.
 */
const INSERT_PAYLOAD = /\.insert\(\s*\{([^{}]*)\}/g

describe('family context implies an explicit scope', () => {
  it('defaultScopeForArea is the single definition of the coupling', () => {
    // If this flips, every hardcoded 'compound' beside a family context is stale.
    expect(defaultScopeForArea('family')).toBe('compound')
  })

  it('no .insert() in src/ sets a family context without also setting scope', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(SRC)) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const match of text.matchAll(INSERT_PAYLOAD)) {
        const payload = match[1]
        if (!/context:\s*'family'/.test(payload)) continue
        if (/\bscope:/.test(payload)) continue
        offenders.push(file.replace(SRC, 'src'))
      }
    }

    expect(
      offenders,
      'These inserts write a family life-area but leave scope at its ' +
        "'individual' default, so the row is invisible to the rest of the " +
        'household. Add scope: defaultScopeForArea(...).',
    ).toEqual([])
  })

  // Scanned explicitly: this file is Deno, lives outside src/, and writes BOTH
  // a task row and a note row with a family context.
  it('extract-capture sets scope on every family-context insert it writes', () => {
    const text = stripComments(readFileSync(EXTRACT_CAPTURE, 'utf8'))
    const familyBlocks = [...text.matchAll(/context:\s*'family'/g)]

    // Two known writers: the task row (buildTaskRow) and the triage note.
    // A new one should fail this count and force a look rather than sliding in.
    expect(familyBlocks).toHaveLength(2)
    expect(text.match(/scope:\s*'compound'/g) ?? []).toHaveLength(2)
  })
})
