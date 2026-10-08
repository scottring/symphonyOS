import { describe, it, expect } from 'vitest'
import { additionRows, newAddition, parentChoices } from './addition'
import type { ExistingPlan } from './flow'

const EXISTING: ExistingPlan = {
  goals: [{ id: 'g-office', title: 'Home office', context: 'family' }],
  items: [
    { id: 's-desk', title: 'Desk in place', horizon: 'season', goalId: 'g-office' },
    { id: 'm-paint', title: 'Paint the walls', horizon: 'month', goalId: 'g-office' },
  ],
}
let n = 0
const ids = () => `a${++n}`

describe('Add to my plan', () => {
  it('offers goals and the lines above as what it can serve', () => {
    expect(parentChoices('year', EXISTING)).toEqual([])
    expect(parentChoices('month', EXISTING).map((p) => p.id)).toEqual(['g-office', 's-desk'])
    expect(parentChoices('week', EXISTING).map((p) => p.id)).toEqual(['g-office', 'm-paint'])
  })

  it('a week task under a month line links to it and its goal, in the goal’s domain, and can be done today', () => {
    const a = { ...newAddition('week', 'm-paint', ids), text: 'Buy rollers', nextToday: true }
    expect(additionRows(a, EXISTING)).toEqual([
      { id: a.ids.item, level: 'week', title: 'Buy rollers', context: 'family', goalId: 'g-office', sourceId: 'm-paint' },
      // Chosen for today on its own row, once the task exists.
      { id: `today:${a.ids.item}`, level: 'today', title: 'Buy rollers', existingId: a.ids.item, after: a.ids.item, context: 'family' },
    ])
  })

  it('an optional next step lands one level down, under the same goal', () => {
    const a = { ...newAddition('month', 'g-office', ids), text: 'Choose a lamp', next: 'Measure the corner' }
    const rows = additionRows(a, EXISTING)
    expect(rows.map((r) => [r.level, r.title, r.goalId, r.sourceId])).toEqual([
      ['month', 'Choose a lamp', 'g-office', undefined],
      ['week', 'Measure the corner', 'g-office', a.ids.item],
    ])
  })

  it('a new goal’s next step serves the new goal; nothing at all writes nothing', () => {
    const a = { ...newAddition('year', null, ids), text: 'Learn bread', next: 'Bake once a fortnight' }
    const rows = additionRows(a, EXISTING)
    expect(rows[1]).toMatchObject({ level: 'season', goalId: a.ids.item, context: 'personal' })
    expect(additionRows(newAddition('week', null, ids), EXISTING)).toEqual([])
  })

  it('preserves the selected season source for a new monthly line', () => {
    const a = { ...newAddition('month', 's-desk', ids), text: 'Choose a desk' }
    expect(additionRows(a, EXISTING)[0]).toMatchObject({
      level: 'month', sourceId: 's-desk', goalId: 'g-office', context: 'family',
    })
  })

  it('links an optional monthly next step to the new seasonal line, including freeform plans', () => {
    for (const parent of ['g-office', null]) {
      const a = { ...newAddition('season', parent, ids), text: 'Desk in place', next: 'Choose a desk' }
      expect(additionRows(a, EXISTING)[1]).toMatchObject({ level: 'month', sourceId: a.ids.item })
    }
  })
})
