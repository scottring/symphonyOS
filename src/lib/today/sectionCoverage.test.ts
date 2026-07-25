// Guard against the day-band re-partition regression class.
//
// The day used to be three bands (hour<12 morning, hour<18 afternoon, else
// evening), so ANY consumer iterating ['morning','afternoon','evening','allday']
// covered 00:00–23:59. DAY_SECTION_BOUNDS re-partitioned it into five, and that
// same four-name literal now covers 08:00–20:59 ONLY — everything before 8 AM
// and after 9 PM silently disappears.
//
// Twelve sites had the bug and not one test failed, because the failure mode is
// an item that quietly isn't there. Behavioural tests only catch the sites
// someone remembered to write a test for; this catches the shape itself.

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
const ARRAY_LITERAL = /\[\s*(?:'[a-zA-Z]+'\s*,\s*)*'[a-zA-Z]+'\s*\]/g

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
  'src/components/wall/now/buildDayGrid.ts':
    'Deliberately folds earlyMorning→morning and night→evening via FOLD_INTO; nothing is dropped.',
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
})
