import { describe, it, expect } from 'vitest'
import { GUIDE_SHEETS, sheetFor, sidesLabel, type GuideBlock } from './guideSheets'

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

  // Every sheet opens the same way and closes the same way, so the second one
  // someone picks up is already familiar. The middle differs on purpose: the
  // week sheet is one side and leaves out what a longer horizon needs.
  it('opens with the period and what it holds, and ends with what that means', () => {
    for (const sheet of GUIDE_SHEETS) {
      const titles = sheet.bands.map((b) => b.title)
      expect(titles[0]).toBe('This is')
      // What the period already holds always comes BEFORE what matters, so the
      // choosing is done against what is really there.
      const holds = titles.findIndex((t) => /already (committed|holds)/.test(t))
      expect(holds).toBeGreaterThan(0)
      expect(holds).toBeLessThan(titles.indexOf('What matters here'))
      expect(titles.indexOf('What that means')).toBe(titles.indexOf('What matters here') + 1)
    }
  })

  // Codex, 2026-09-24: "four sheets" meant twelve printed sides, and nobody
  // was told. The count is content, and the print check measures it.
  it('says how many sides each one really is, and the week is one', () => {
    expect(sheetFor('week').sides).toBe(1)
    expect(sidesLabel(sheetFor('week'))).toBe('One side')
    expect(sidesLabel(sheetFor('month'))).toBe('Two sides')
    expect(GUIDE_SHEETS.reduce((n, s) => n + s.sides, 0)).toBe(9)
  })

  // A week and a month are dates. A season is whatever you call it, and the
  // year sheet used to ask for the year twice.
  it('asks for each period in that period\'s own terms', () => {
    const fields = (level: 'week' | 'month' | 'season' | 'year') => {
      const b = sheetFor(level).bands[0].blocks.find((x) => x.kind === 'fields')
      return b && b.kind === 'fields' ? b.fields.map((f) => f.label) : []
    }
    expect(fields('week')).toEqual(['Week beginning (date)', 'Written by'])
    expect(fields('month')).toEqual(['Month', 'Year', 'Written by'])
    expect(fields('season')).toEqual(['Season', 'Year', 'Written by'])
    expect(fields('year')).toEqual(['Year', 'Written by'])
    for (const level of ['week', 'month', 'season', 'year'] as const) {
      const labels = fields(level)
      expect(new Set(labels).size).toBe(labels.length)
      expect(sheetFor(level).bands[0].lead).not.toMatch(/season in digits/i)
    }
  })

  // Codex's guide review: individuals and families are equally valid at every
  // horizon. The season and year sheets used to be described as household work.
  it('never says a horizon belongs to a household', () => {
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).not.toMatch(/usually a household/i)
    }
    // Every sheet has the family prompt, and it is never compulsory. On the
    // week sheet — one side — it is a single line rather than a band.
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).toMatch(/more than one of you/i)
      const band = sheet.bands.find((b) => b.title.startsWith('If more than one'))
      if (band) expect(band.optional).toBe(true)
    }
    expect(allText('week')).toMatch(/who has agreed to take the next action/i)
  })

  it('asks a different question at each horizon', () => {
    expect(sheetFor('week').bands.find((b) => b.title === 'What matters here')?.questions)
      .toEqual(expect.arrayContaining([expect.stringMatching(/belong to this week/i)]))
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
      expect(text(band.blocks)).toMatch(/not (a|the) limit/i)
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
      expect(text([actions])).toMatch(/(no date or owner required|neither a date nor an owner is required)/i)
      expect(text(band.blocks)).toMatch(/(nothing written here becomes a commitment|not a commitment)/i)
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
    // Said in full where there is room; the one-side week sheet lets the guide
    // page carry it rather than spending four lines on a reassurance.
    for (const level of ['month', 'season', 'year'] as const) {
      expect(text(sheetFor(level).bands[0].blocks)).toMatch(/still useful/i)
    }
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
