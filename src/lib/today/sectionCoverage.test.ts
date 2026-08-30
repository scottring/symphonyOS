// Guard against ONE shape of the day-band re-partition regression class —
// not the whole class. Read the gaps below before trusting this file to
// catch the next occurrence of this bug.
//
// The day used to be three bands (hour<12 morning, hour<18 afternoon, else
// evening), so ANY consumer iterating ['morning','afternoon','evening','allday']
// covered 00:00–23:59. DAY_SECTION_BOUNDS re-partitioned it into five, and that
// same four-name literal now covers 08:00–20:59 ONLY — everything before 8 AM
// and after 9 PM silently disappears.
//
// Twelve sites had the bug and not one test failed, because the failure mode is
// an item that quietly isn't there. Behavioural tests only catch the sites
// someone remembered to write a test for; this catches the shape itself —
// but only for ONE of the six historical bug shapes: a single-quoted array
// literal that contains both 'morning' and 'evening' but not one of
// earlyMorning/night.
//
// What it does NOT catch (verified, not guessed):
//   - literals missing BOTH 'morning' and 'evening', e.g. ['morning','allday'],
//     ['evening','allday'], ['afternoon','evening','allday'] — the detector
//     only fires when both anchor names are present.
//   - spread-based reads, e.g. [...(today.items.morning ?? []), ...] — there
//     is no array-of-quoted-strings literal to match.
//   - double-quoted strings ("morning"), switch/case on DaySection, object
//     literals ({ morning: ..., evening: ... }), or DaySection type unions.
//   - every *.test.*/*.spec.* file is skipped by sourceFiles() below — which
//     matters because tsconfig.app.json excludes test files from `tsc`, so a
//     bad section fixture inside a test is guarded by neither the compiler
//     nor this test.
//
// One near-miss IS handled: a multi-line literal with a trailing comma
// (the default formatting for any wrapped list) — see the comment on
// ARRAY_LITERAL below.
//
// Bottom line: this is a narrow, honest tripwire for the exact literal shape
// that bit twelve call sites, not a general-purpose day-section linter.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DAY_SECTION_BOUNDS, TIMED_SECTIONS } from '@/lib/timeUtils'
import { SECTIONS_ORDER } from './types'

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

// An array literal of quoted section names, e.g. ['morning', 'afternoon', ...].
// The trailing `,?` matters: without it this literal, split across lines with
// a trailing comma (the default formatting for any wrapped list), does not
// match at all —
//   ['morning',
//    'afternoon',
//    'evening',
//   ]
// — because the pattern otherwise requires the last element to be followed
// directly by `]` with no comma. `\s` already matches newlines, so no /s
// flag or explicit `\n` is needed for the multi-line case itself.
const ARRAY_LITERAL = /\[\s*(?:'[a-zA-Z]+'\s*,\s*)*'[a-zA-Z]+'\s*,?\s*\]/g

/** Comments describe the rule (including in this file's own docs); only code counts. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Sites that legitimately use a three-value list. Every one of these models the
 * coarse `TimeOfDay` ambience/scheduling concept — they never index a
 * `Record<DaySection, TimelineItem[]>`, so they cannot drop an item off a
 * surface. Adding to this list should require showing the same.
 */
const ALLOWED: Record<string, string> = {
  'src/lib/parseRoutine.ts':
    'Natural-language keywords ("morning routine") for the 3-valued TimeOfDay, not bucket lookup.',
  'src/lib/planning/suggestSlot.ts':
    'Suggests WHICH coarse slot to schedule into; reads no section buckets.',
  'src/components/triage/SchedulePopover.tsx':
    'Local 3-valued picker — emits a concrete hour, never a section string (see M5 note there).',
  'src/components/triage/TimePickerPopover.tsx':
    'Local 3-valued picker — emits a concrete hour, never a section string (see M5 note there).',
  'src/components/wall-v2/KidDayView.tsx':
    "BAND_ORDER is the kid page's own KidBandKey partition (morning/" +
    'afternoon/evening/anytime), not a DaySection list. It is total over ' +
    'the day via kidDayModel.bandForTime (hour<12 morning, hour<17 ' +
    'afternoon, else evening; null → anytime — boundaries pinned by ' +
    'kidDayModel.test.ts), and tasks are mapped DaySection→band ' +
    'exhaustively by kidDayModel.sectionBand (a switch over all 7 ' +
    'DaySection cases). It never indexes a Record<DaySection, ' +
    'TimelineItem[]> — days[].items is read only through that exhaustive ' +
    'mapping — so it cannot drop an item off the surface.',
}

describe('day-section coverage', () => {
  it('derives TIMED_SECTIONS from the bounds table rather than a copy', () => {
    expect(TIMED_SECTIONS).toEqual(DAY_SECTION_BOUNDS.map(b => b.section))
  })

  it('SECTIONS_ORDER covers every timed band plus allday and unscheduled', () => {
    for (const s of TIMED_SECTIONS) expect(SECTIONS_ORDER).toContain(s)
    expect(SECTIONS_ORDER).toContain('allday')
    expect(SECTIONS_ORDER).toContain('unscheduled')
  })

  it('the whole day is contiguous 00:00–23:59 with no gaps or overlaps', () => {
    const sorted = [...DAY_SECTION_BOUNDS].sort((a, b) => a.startHour - b.startHour)
    expect(sorted[0].startHour).toBe(0)
    expect(sorted[sorted.length - 1].endHour).toBe(23)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startHour).toBe(sorted[i - 1].endHour + 1)
    }
  })

  // The real guard. A literal that sweeps both morning and evening is claiming
  // to walk the whole day — so it must not stop short of the day's two ends.
  it('no source file sweeps morning..evening while omitting earlyMorning/night', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(SRC)) {
      const rel = file.replace(SRC, 'src')
      if (ALLOWED[rel]) continue
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const match of text.match(ARRAY_LITERAL) ?? []) {
        const names = [...match.matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1])
        // Only interested in lists that are clearly day sections spanning the day.
        if (!names.includes('morning') || !names.includes('evening')) continue
        const missing = (['earlyMorning', 'night'] as const).filter(s => !names.includes(s))
        if (missing.length > 0) {
          offenders.push(`${rel}: ${match} omits ${missing.join(' + ')}`)
        }
      }
    }

    expect(
      offenders,
      'Use SECTIONS_ORDER (@/lib/today/types) or TIMED_SECTIONS (@/lib/timeUtils) '
      + 'instead of a hand-written section list. If a surface is scoped on '
      + 'purpose, say so in a comment and keep it from spanning morning→evening.',
    ).toEqual([])
  })

  // ARRAY_LITERAL itself, not the source scan: pins the one near-miss this
  // file was fixed to catch. Before the trailing `,?`, this multi-line,
  // trailing-comma literal (the default output of any code formatter that
  // wraps a list) didn't match the regex at all, so the scan above silently
  // skipped it — a bad literal formatted this way would pass with no offense
  // recorded.
  it('ARRAY_LITERAL matches a multi-line literal with a trailing comma', () => {
    const source = `const BAD: DaySection[] = [\n  'morning',\n  'afternoon',\n  'evening',\n]`
    expect(source.match(ARRAY_LITERAL)).not.toBeNull()
  })
})
