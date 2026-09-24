import { describe, it, expect } from 'vitest'
import { GUIDE_SHEETS, sheetFor, type GuideBlock } from './guideSheets'

const text = (blocks: readonly GuideBlock[]): string =>
  blocks.map((b) => {
    if (b.kind === 'note') return b.text
    if (b.kind === 'open') return `${b.label} ${b.hint ?? ''}`
    if (b.kind === 'fields') return b.fields.map((f) => f.label).join(' ')
    return `${b.label ?? ''} ${b.hint ?? ''}`
  }).join(' ')

const allText = (level: 'week' | 'month' | 'season' | 'year'): string => {
  const s = sheetFor(level)
  return [s.lead, ...s.bands.flatMap((b) => [b.title, b.lead ?? '', ...(b.questions ?? []), text(b.blocks)])].join(' ')
}

describe('the printable planning guide', () => {
  it('has one sheet per horizon, each saying what it is for and how long it takes', () => {
    expect(GUIDE_SHEETS.map((s) => s.level)).toEqual(['week', 'month', 'season', 'year'])
    for (const sheet of GUIDE_SHEETS) {
      expect(sheet.lead.length).toBeGreaterThan(20)
      expect(sheet.minutes).toBeGreaterThan(0)
    }
  })

  // Every sheet asks the same things in the same order, so the second sheet
  // someone picks up is already familiar.
  it('asks the same five things in the same order on every sheet', () => {
    for (const sheet of GUIDE_SHEETS) {
      const titles = sheet.bands.map((b) => b.title)
      expect(titles.slice(0, 3)).toEqual(['This is', 'What happened', 'What is already committed'])
      expect(titles).toContain('What matters here')
      expect(titles.indexOf('What that means')).toBe(titles.indexOf('What matters here') + 1)
    }
  })

  // Codex's guide review: individuals and families are equally valid at every
  // horizon. The season and year sheets used to be described as household work.
  it('never says a horizon belongs to a household', () => {
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).not.toMatch(/usually a household/i)
    }
    for (const sheet of GUIDE_SHEETS) {
      const together = sheet.bands.find((b) => b.title.startsWith('If more than one'))
      expect(together?.optional).toBe(true)
    }
  })

  it('asks a different question at each horizon', () => {
    expect(sheetFor('week').bands.find((b) => b.title === 'What matters here')?.questions)
      .toEqual(expect.arrayContaining([expect.stringMatching(/already fixed/i)]))
    expect(sheetFor('month').bands.find((b) => b.title === 'What matters here')?.questions)
      .toEqual(expect.arrayContaining([expect.stringMatching(/end of the month/i)]))
    expect(sheetFor('season').bands.find((b) => b.title === 'What matters here')?.questions)
      .toEqual(expect.arrayContaining([expect.stringMatching(/since the last season/i)]))
    expect(sheetFor('year').bands.find((b) => b.title === 'What matters here')?.questions)
      .toEqual(expect.arrayContaining([expect.stringMatching(/direction matters this year/i)]))
  })

  // A few priorities are suggested. The lines are not a cap, and the sheet
  // says so rather than letting the count do the arguing.
  it('suggests a few priorities without imposing a limit', () => {
    for (const sheet of GUIDE_SHEETS) {
      const band = sheet.bands.find((b) => b.title === 'What matters here')!
      expect(text(band.blocks)).toMatch(/not the limit/i)
    }
  })

  // An undecided idea and an actionable task without a date are different
  // things, and position keeps them apart.
  it('keeps next actions and undecided ideas in separate printed areas', () => {
    for (const sheet of GUIDE_SHEETS) {
      const band = sheet.bands.find((b) => b.title === 'What that means')!
      const labels = band.blocks.flatMap((b) => (b.kind === 'lines' && b.label ? [b.label] : []))
      expect(labels).toEqual(['Next actions', 'Happens repeatedly', 'Fixed date and time', 'Not yet decided'])
      const actions = band.blocks.find((b) => b.kind === 'lines' && b.label === 'Next actions')!
      expect(text([actions])).toMatch(/neither a date nor an owner is required/i)
      expect(text(band.blocks)).toMatch(/nothing written here becomes a commitment/i)
    }
  })

  it('keeps a blank blank, on every sheet', () => {
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).toMatch(/a blank is kept as a blank/i)
    }
  })

  // A missing period is a question to resolve, not a reason to throw the
  // sheet away — the paper must not threaten the reader.
  it('asks for the period without claiming a sheet is wasted without it', () => {
    const band = sheetFor('week').bands[0]
    expect(text(band.blocks)).toMatch(/still useful/i)
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).not.toMatch(/lost|wrong place|discard/i)
    }
  })

  it('offers "supports" in plain words, with no code to learn', () => {
    for (const sheet of GUIDE_SHEETS) {
      const band = sheet.bands.find((b) => b.title === 'What matters here')!
      const lines = band.blocks.find((b) => b.kind === 'lines' && b.tail)
      expect(lines && lines.kind === 'lines' ? lines.tail : []).toEqual(['supports'])
      expect(text(band.blocks)).toMatch(/usually left blank/i)
    }
  })

  it('gives every sheet real space to write in', () => {
    for (const sheet of GUIDE_SHEETS) {
      const lines = sheet.bands
        .flatMap((b) => b.blocks)
        .reduce((n, b) => n + (b.kind === 'lines' ? b.count : 0), 0)
      expect(lines).toBeGreaterThan(15)
    }
  })

  it('tells the reader that no sheet is a prerequisite for another', () => {
    expect(sheetFor('year').lead).toMatch(/only ever fills in the week sheet/i)
    for (const sheet of GUIDE_SHEETS) {
      expect(`${sheet.lead} ${sheet.bands[0].lead}`).not.toMatch(/first fill in|before you can/i)
    }
  })

  it('throws rather than guessing when asked for a sheet that does not exist', () => {
    // @ts-expect-error — the point of the test
    expect(() => sheetFor('decade')).toThrow()
  })
})
