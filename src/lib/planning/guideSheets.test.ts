import { describe, it, expect } from 'vitest'
import { GUIDE_SHEETS, sheetFor, sidesLabel, totalSidesLabel, type GuideBand, type GuideBlock, type GuideLevel } from './guideSheets'

const text = (blocks: readonly GuideBlock[]): string =>
  blocks.map((b) => {
    if (b.kind === 'note') return b.text
    if (b.kind === 'open') return `${b.label} ${b.hint ?? ''}`
    if (b.kind === 'fields') return b.fields.map((f) => f.label).join(' ')
    if (b.kind === 'days') return b.last
    return `${b.label ?? ''} ${b.hint ?? ''}`
  }).join(' ')

const allText = (level: GuideLevel): string => {
  const s = sheetFor(level)
  return [s.lead, ...s.bands.flatMap((b) => [b.title, b.lead ?? '', ...(b.questions ?? []), text(b.blocks)])].join(' ')
}

const LEVELS: GuideLevel[] = ['week', 'month', 'season', 'year']
const ABOVE: Record<Exclude<GuideLevel, 'year'>, string> = { week: 'month', month: 'season', season: 'year' }
const choose = (level: Exclude<GuideLevel, 'year'>): GuideBand =>
  sheetFor(level).bands.find((b) => b.title === `Choose from the ${ABOVE[level]}`)!
const listBand = (level: GuideLevel): GuideBand =>
  level === 'year' ? sheetFor('year').bands.find((b) => b.title === 'This year’s goals')! : choose(level)

describe('the printable planning guide', () => {
  it('has one sheet per horizon, each saying what it is for and how long it takes', () => {
    expect(GUIDE_SHEETS.map((s) => s.level)).toEqual(LEVELS)
    for (const sheet of GUIDE_SHEETS) {
      expect(sheet.lead.length).toBeGreaterThan(20)
      expect(sheet.minutes).toBeGreaterThan(0)
    }
  })

  // The sheets follow the app's Plan button in its order (2026-10-19): the
  // period, Looking back, then choosing from the level above — and on the
  // week, giving them a day.
  it('runs in the order of the Plan button', () => {
    expect(sheetFor('week').bands.map((b) => b.title))
      .toEqual(['This is', 'Looking back', 'Choose from the month', 'Give them a day'])
    for (const level of ['month', 'season'] as const) {
      expect(sheetFor(level).bands.map((b) => b.title).slice(0, 3))
        .toEqual(['This is', 'Looking back', `Choose from the ${ABOVE[level]}`])
    }
    // The year has no level above: its list comes straight after Looking back.
    expect(sheetFor('year').bands.map((b) => b.title).slice(0, 3))
      .toEqual(['This is', 'Looking back', 'This year’s goals'])
  })

  // Looking back is the app's card: one number, what went well, what didn't,
  // and a decision for every leftover. Skippable, never a score.
  it('looks back the way the app does, and makes every leftover a decision', () => {
    for (const level of LEVELS) {
      const band = sheetFor(level).bands.find((b) => b.title === 'Looking back')!
      expect(band.optional).toBe(true)
      const t = text(band.blocks)
      expect(t).toMatch(/done/i)
      expect(t).toMatch(/out of/i)
      expect(t).toMatch(/went well/i)
      expect(t).toMatch(/didn’t/i)
      expect(t).toMatch(/not done/i)
      expect(t).toMatch(/let (it )?go/i)
    }
  })

  // "A month is a plain list written with its season beside it" — and the
  // same shape one level up and one level down.
  it('writes the level above beside this period’s list', () => {
    for (const level of ['week', 'month', 'season'] as const) {
      const band = choose(level)
      expect(band.beside).toBe(true)
      const [above, list] = band.blocks
      expect(above.kind === 'lines' && above.label).toMatch(new RegExp(`^The ${ABOVE[level]}’s`))
      expect(list.kind === 'lines' && list.tail).toEqual(expect.arrayContaining(['for']))
    }
  })

  // Year, Season and Month hold goals; Week and Day hold tasks.
  it('calls goals goals above the week and tasks tasks on it', () => {
    expect(text(choose('week').blocks)).toMatch(/This week’s tasks/)
    expect(text(choose('month').blocks)).toMatch(/This month’s goals/)
    expect(text(choose('season').blocks)).toMatch(/This season’s list/)
    for (const level of ['month', 'season', 'year'] as const) {
      const labels = listBand(level).blocks.flatMap((b) => (b.kind === 'lines' && b.label ? [b.label] : []))
      for (const label of labels) expect(label).not.toMatch(/\btasks?\b/i)
    }
    // The nouns retired by the 2026-10-11 rename.
    for (const level of LEVELS) {
      expect(allText(level)).not.toMatch(/priorit|next action|milestone|intention|single action/i)
    }
  })

  // No goal/task split above the week: nothing is sorted into task, routine,
  // event and idea areas. The old "What that means" band is gone everywhere.
  it('sorts nothing into kinds', () => {
    for (const sheet of GUIDE_SHEETS) {
      expect(sheet.bands.map((b) => b.title)).not.toContain('What that means')
      expect(allText(sheet.level)).not.toMatch(/happens repeatedly|fixed date and time|not yet decided/i)
    }
  })

  // A goal is never given a day; the week's days are the only place a day is
  // written, and what can be done any day has its own box.
  it('gives a day only on the week sheet, with room for no day yet', () => {
    const days = sheetFor('week').bands.find((b) => b.title === 'Give them a day')!.blocks[0]
    expect(days).toEqual({ kind: 'days', count: 7, lines: 3, last: 'No day yet' })
    for (const level of ['month', 'season', 'year'] as const) {
      expect(sheetFor(level).bands.some((b) => b.blocks.some((x) => x.kind === 'days'))).toBe(false)
    }
    expect(allText('month')).toMatch(/goal never gets a day/i)
  })

  // A season is a brainstorm list, the year a reference — the sheets say so.
  it('says what each list above the week is for', () => {
    expect(sheetFor('season').lead).toMatch(/brainstorm/i)
    expect(allText('season')).toMatch(/brainstorm is not a promise/i)
    expect(allText('year')).toMatch(/reference, not a to-do list/i)
    expect(sheetFor('month').lead).toMatch(/season beside it/i)
    expect(sheetFor('week').lead).toMatch(/week is for doing/i)
  })

  // Codex, 2026-09-24: "four sheets" meant twelve printed sides, and nobody
  // was told. The count is content, and the print check measures it.
  it('says how many sides each one really is, and the week is one', () => {
    expect(sheetFor('week').sides).toBe(1)
    expect(sidesLabel(sheetFor('week'))).toBe('One side')
    expect(sidesLabel(sheetFor('month'))).toBe('Two sides')
    const total = GUIDE_SHEETS.reduce((n, s) => n + s.sides, 0)
    expect(total).toBe(7)
    expect(totalSidesLabel()).toBe('seven sides')
  })

  // A week and a month are dates. A season is whatever you call it, with the
  // dates it runs between — every period has explicit dates.
  it('asks for each period in that period\'s own terms', () => {
    const fields = (level: GuideLevel) => {
      const b = sheetFor(level).bands[0].blocks.find((x) => x.kind === 'fields')
      return b && b.kind === 'fields' ? b.fields.map((f) => f.label) : []
    }
    expect(fields('week')).toEqual(['Week beginning (day and date)', 'Written by'])
    expect(fields('month')).toEqual(['Month', 'Year', 'Written by'])
    expect(fields('season')).toEqual(['Season', 'From', 'To', 'Written by'])
    expect(fields('year')).toEqual(['Year', 'Written by'])
    for (const level of LEVELS) {
      const labels = fields(level)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  // Individuals and families are equally valid at every horizon.
  it('never says a horizon belongs to a household, and keeps the family prompt optional', () => {
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).not.toMatch(/usually a household/i)
      expect(allText(sheet.level)).toMatch(/more than one of you/i)
      const band = sheet.bands.find((b) => b.title.startsWith('If more than one'))
      if (band) expect(band.optional).toBe(true)
    }
    expect(allText('week')).toMatch(/who has agreed to take which task/i)
  })

  it('asks a different question at each horizon above the week', () => {
    expect(choose('month').questions).toEqual(expect.arrayContaining([expect.stringMatching(/end of the month/i)]))
    expect(choose('season').questions).toEqual(expect.arrayContaining([expect.stringMatching(/since the last season/i)]))
    expect(listBand('year').questions).toEqual(expect.arrayContaining([expect.stringMatching(/direction matters this year/i)]))
  })

  it('suggests a few goals without imposing a limit', () => {
    for (const level of ['month', 'season', 'year'] as const) {
      expect(text(listBand(level).blocks)).toMatch(/not the limit/i)
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
    for (const level of ['month', 'season', 'year'] as const) {
      expect(text(sheetFor(level).bands[0].blocks)).toMatch(/still useful/i)
    }
    for (const sheet of GUIDE_SHEETS) {
      expect(allText(sheet.level)).not.toMatch(/lost|wrong place|discard/i)
    }
  })

  it('gives every sheet real space to write in', () => {
    for (const sheet of GUIDE_SHEETS) {
      const lines = sheet.bands
        .flatMap((b) => b.blocks)
        .reduce((n, b) => n + (b.kind === 'lines' ? b.count : b.kind === 'days' ? (b.count + 1) * b.lines : 0), 0)
      expect(lines).toBeGreaterThan(15)
    }
  })

  it('tells the reader that no sheet is a prerequisite for another', () => {
    expect(sheetFor('year').lead).toMatch(/only ever fills in the week sheet/i)
    expect(sheetFor('month').lead).toMatch(/whether or not you ever fill in a season sheet/i)
    for (const sheet of GUIDE_SHEETS) {
      expect(`${sheet.lead} ${sheet.bands[0].lead}`).not.toMatch(/first fill in|before you can/i)
    }
  })

  it('throws rather than guessing when asked for a sheet that does not exist', () => {
    // @ts-expect-error — the point of the test
    expect(() => sheetFor('decade')).toThrow()
  })
})
