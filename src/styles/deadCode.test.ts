import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Final review (2026-11-04): dead code from the paper-style horizons work is
// gone and stays gone — the orphaned "Move under…" menu and Today aside
// selectors, ScheduleItem's servesLine, and the unused WeekListV2 (with the
// MonthLink and useSafeAdd only it used).
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })
}

describe('dead code stays deleted', () => {
  it('no stylesheet styles .plan-move* or .today-aside', () => {
    for (const f of cssFiles('src')) {
      const css = readFileSync(f, 'utf8')
      expect(css, f).not.toMatch(/\.plan-move\b|\.plan-move-/)
      expect(css, f).not.toMatch(/\.today-aside\b/)
    }
  })
  it('ScheduleItem has no servesLine, and WeekListV2, MonthLink and useSafeAdd are gone', () => {
    expect(readFileSync('src/components/schedule/ScheduleItem.tsx', 'utf8')).not.toContain('servesLine')
    for (const f of ['WeekListV2.tsx', 'MonthLink.tsx', 'useSafeAdd.ts']) expect(existsSync(`src/components/plan/v2/${f}`), f).toBe(false)
  })
})
