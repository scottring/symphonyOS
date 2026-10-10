import { describe, it, expect } from 'vitest'
import { kioskComposition, parseWallClock, nextCommitment, buildPeopleLanes, laneWindow, tonightRows } from './kioskCompose'
import { buildDeparture, countdownLabel, nextDeparture, buildBedtimeGrid, kidViewHoldsOpen } from './kioskRoutines'
import { ingredientsForStep, ingredientTerms, scaledLine, plainStep, isIngredientLine } from './cookingModel'
import type { WallTodayRow } from '../wallMomentsModel'
import type { KidRow } from '../kidDayModel'

const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m)
const row = (o: Partial<WallTodayRow> & { id: string; time: string; title: string }): WallTodayRow => ({
  kind: 'event', end: null, sub: null, owners: [], past: false, now: false, ...o,
})
const kidRow = (id: string, title: string, done = false): KidRow => ({ entityType: 'routine', id, title, done, timeOfDay: null, target: null })

describe('kioskComposition', () => {
  it('follows wallMoment and splits the quiet hours out', () => {
    expect(kioskComposition('morning', at(7))).toMatchObject({ part: 'morning', hero: 'out-the-door', label: 'Morning' })
    expect(kioskComposition('after', at(11))).toMatchObject({ part: 'quiet', hero: 'scenery', label: null })
    expect(kioskComposition('after', at(15))).toMatchObject({ part: 'afternoon', hero: 'lanes' })
    expect(kioskComposition('dinner', at(17, 30))).toMatchObject({ part: 'evening', hero: 'dinner', label: 'Evening' })
    expect(kioskComposition('evening', at(20))).toMatchObject({ part: 'evening', hero: 'bedtime' })
    expect(kioskComposition('evening', at(22))).toMatchObject({ part: 'quiet', hero: 'scenery' })
    expect(kioskComposition('evening', at(3))).toMatchObject({ part: 'quiet' })
  })
})

describe('parseWallClock / nextCommitment', () => {
  it('reads the wall’s own clock format', () => {
    expect(parseWallClock('7:30a', at(0))?.getHours()).toBe(7)
    expect(parseWallClock('12p', at(0))?.getHours()).toBe(12)
    expect(parseWallClock('12a', at(0))?.getHours()).toBe(0)
    expect(parseWallClock('2:10p', at(0))?.getMinutes()).toBe(10)
    expect(parseWallClock('soon', at(0))).toBeNull()
  })

  it('NEXT is the earliest household thing not yet started', () => {
    const rows = [
      row({ id: 'a', time: '3p', title: 'Pickup', past: false, now: true, startsAt: at(15).getTime() }),
      row({ id: 'b', time: '5:30p', title: 'Soccer', owners: ['el'], startsAt: at(17, 30).getTime() }),
      row({ id: 'c', time: '4p', title: 'Piano', owners: ['ka'] }),
      row({ id: 'd', time: '1p', title: 'Lunch', past: true }),
    ]
    expect(nextCommitment(rows, at(15, 10))?.title).toBe('Piano')
    expect(nextCommitment(rows, at(18))).toBeNull()
  })
})

describe('buildPeopleLanes', () => {
  const members = [{ id: 'sk', name: 'Scott' }, { id: 'el', name: 'Ella' }, { id: 'ka', name: 'Kaleb' }]
  it('one lane per person with something in the window, plus Household; positions are percentages', () => {
    const rows = [
      row({ id: 'a', time: '4p', title: 'Soccer', owners: ['el'], startsAt: at(16).getTime(), endsAt: at(17).getTime() }),
      row({ id: 'b', time: '6p', title: 'Dinner out', owners: ['el', 'ka'], startsAt: at(18).getTime(), endsAt: at(19).getTime() }),
      row({ id: 'c', time: '7p', title: 'Trash night', startsAt: at(19).getTime() }),
      row({ id: 'd', time: '1p', title: 'Gone', owners: ['sk'], past: true }),
    ]
    const win = laneWindow(at(15, 20))
    expect(win.start.getHours()).toBe(15)
    expect(win.ticks[0].label).toBe('3p')
    const lanes = buildPeopleLanes(rows, members, at(15, 20), win)
    expect(lanes.map((l) => l.name)).toEqual(['Ella', 'Kaleb', 'Household'])
    expect(lanes[0].blocks.map((b) => b.title)).toEqual(['Soccer', 'Dinner out'])
    expect(lanes[0].blocks[0].left).toBeCloseTo((1 / 6) * 100)
    expect(lanes[0].blocks[0].width).toBeCloseTo((1 / 6) * 100)
  })

  it('tonight: rows from 5pm not yet past', () => {
    const rows = [row({ id: 'a', time: '4p', title: 'A' }), row({ id: 'b', time: '7p', title: 'B' }), row({ id: 'c', time: '8p', title: 'C', past: true })]
    expect(tonightRows(rows, at(16)).map((r) => r.id)).toEqual(['b'])
  })
})

describe('departure', () => {
  const kids = [
    { member: { id: 'el', name: 'Ella' }, hint: 'Return her library book.', needed: ['Sneakers'], homeworkDue: ['Spelling sheet'] },
    { member: { id: 'ka', name: 'Kaleb' }, hint: null, needed: [], homeworkDue: [] },
  ]
  const rows = [
    row({ id: 'x', time: '7:15a', title: 'Dentist', sub: 'Main St', startsAt: at(7, 15).getTime() }),
    row({ id: 's', time: '7:45a', title: 'School — Ella & Kaleb', startsAt: at(7, 45).getTime() }),
  ]

  it('per-person bring/do lists from the morning data, with the school run as the departure', () => {
    const d = buildDeparture(kids, rows, at(7, 0), ['el:bring:sneakers'])
    expect(d.label).toBe('school run')
    expect(d.at?.getHours()).toBe(7)
    expect(d.atLabel).toBe('School — Ella & Kaleb at 7:45a')
    expect(d.people[0].items.map((i) => [i.kind, i.text, i.done])).toEqual([
      ['do', 'Return her library book.', false],
      ['bring', 'Sneakers', true],
      ['homework', 'Spelling sheet', false],
    ])
    expect(d.people[1].items).toEqual([])
    expect([d.done, d.total]).toEqual([1, 3])
  })

  it('with no school, the next event with a place; none at all says so', () => {
    expect(nextDeparture([rows[0]], at(7))?.title).toBe('Dentist')
    const none = buildDeparture(kids, [], at(7), [])
    expect(none).toMatchObject({ label: 'out the door', at: null, atLabel: null })
  })

  it('countdown words', () => {
    expect(countdownLabel(at(7, 45), at(7, 23))).toBe('in 22 min')
    expect(countdownLabel(at(9, 5), at(8, 0))).toBe('in 1 hr 5 min')
    expect(countdownLabel(at(7), at(7, 1))).toBe('now')
  })
})

describe('bedtime grid', () => {
  it('steps × people, matched by words, with empty cells where a routine lacks a step', () => {
    const g = buildBedtimeGrid([
      { member: { id: 'el', name: 'Ella' }, list: { title: 'Bedtime', rows: [kidRow('e1', 'Brush teeth', true), kidRow('e2', 'Pajamas')] } },
      { member: { id: 'ka', name: 'Kaleb' }, list: { title: 'Bedtime', rows: [kidRow('k1', 'brush teeth'), kidRow('k2', 'Read')] } },
      { member: { id: 'sk', name: 'Scott' }, list: null },
    ])
    expect(g.people.map((p) => p.name)).toEqual(['Ella', 'Kaleb'])
    expect(g.steps.map((s) => s.title)).toEqual(['Brush teeth', 'Pajamas', 'Read'])
    expect(g.steps[0].cells.map((c) => c.row?.id)).toEqual(['e1', 'k1'])
    expect(g.steps[1].cells.map((c) => c.row?.id ?? null)).toEqual(['e2', null])
    expect(g).toMatchObject({ done: 1, total: 4, inProgress: true, title: 'Bedtime' })
  })

  it('untouched or finished is not in progress', () => {
    expect(buildBedtimeGrid([{ member: { id: 'el', name: 'Ella' }, list: { title: 'B', rows: [kidRow('a', 'A')] } }]).inProgress).toBe(false)
    expect(buildBedtimeGrid([{ member: { id: 'el', name: 'Ella' }, list: { title: 'B', rows: [kidRow('a', 'A', true)] } }]).inProgress).toBe(false)
    expect(buildBedtimeGrid([]).steps).toEqual([])
  })
})

describe('kidViewHoldsOpen', () => {
  it('holds while a reading timer runs or the current checklist is under way', () => {
    expect(kidViewHoldsOpen({ checklistRows: [], readingTimerRunning: true })).toBe(true)
    expect(kidViewHoldsOpen({ checklistRows: [{ done: true }, { done: false }], readingTimerRunning: false })).toBe(true)
    expect(kidViewHoldsOpen({ checklistRows: [{ done: false }, { done: false }], readingTimerRunning: false })).toBe(false)
    expect(kidViewHoldsOpen({ checklistRows: [{ done: true }], readingTimerRunning: false })).toBe(false)
  })
})

describe('cooking model', () => {
  const ingredients = ['2 lb ground turkey, 93% lean', '1 tbsp olive oil', '2 cans kidney beans, drained', 'FOR SERVING', 'Salt and pepper', '1 onion, diced']
  it('finds the ingredients a step uses', () => {
    expect(ingredientTerms(ingredients[0])).toContain('turkey')
    expect(isIngredientLine('FOR SERVING')).toBe(false)
    expect(ingredientsForStep('Heat the oil and soften the onion.', ingredients)).toEqual([1, 5])
    expect(ingredientsForStep('Brown the turkey, then add the beans.', ingredients)).toEqual([0, 2])
    expect(ingredientsForStep('Season with salt and pepper.', ingredients)).toEqual([4])
  })

  it('scales with "was" marks only when the amount changed', () => {
    expect(scaledLine('1 1/4 lb salmon', 2)).toEqual({ text: '2 1/2 lb salmon', was: '1 1/4' })
    expect(scaledLine('2–3 tbsp lemon juice', 2)).toEqual({ text: '4–6 tbsp lemon juice', was: '2–3' })
    expect(scaledLine('Salt and pepper', 2)).toEqual({ text: 'Salt and pepper', was: null })
    expect(scaledLine('2 tbsp Dijon', 1)).toEqual({ text: '2 tbsp Dijon', was: null })
  })

  it('strips the viewer’s bold marks', () => {
    expect(plainStep('Brown the **turkey**. ')).toBe('Brown the turkey.')
  })
})

describe('ingredientParts', () => {
  it('puts the name left and the scaled quantity right, with what it was', async () => {
    const { ingredientParts } = await import('./cookingModel')
    expect(ingredientParts('2 lb ground turkey', 1.5)).toEqual({ name: 'Ground turkey', qty: '3 lb', was: '2 lb' })
    expect(ingredientParts('2 lb ground turkey', 1)).toEqual({ name: 'Ground turkey', qty: '2 lb', was: null })
    expect(ingredientParts('Salt and pepper', 2)).toEqual({ name: 'Salt and pepper', qty: '', was: null })
  })
})
