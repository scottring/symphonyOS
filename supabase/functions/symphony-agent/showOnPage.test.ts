import { describe, expect, it } from 'vitest'
import { pointableIds, showSteps } from './showOnPage'

const snapshot = { page: 'season', targets: [{ id: 'period', label: 'Fall 2026' }, { id: 'region:Still to place', label: 'Still to place' }], items: [{ id: 't1', title: 'Renew passports' }], intentions: [{ id: 'g1', title: 'Feel stronger' }] }

describe('showSteps', () => {
  it('knows the snapshot targets, items and year goals', () => {
    expect([...pointableIds(snapshot)]).toEqual(['period', 'region:Still to place', 't1', 'g1'])
  })
  it('keeps only ids on the page, drops a step left with none, and keeps an arrow only between known ids', () => {
    const r = showSteps({ steps: [
      { targets: ['period', 'made-up'], title: 'Fall 2026', text: 'A brainstorm list.' },
      { targets: ['made-up'], title: 'Gone', text: 'x' },
      { targets: ['t1'], title: 'Loose', text: 'Drag it.', arrow: { from: 't1', to: 'g1', label: 'drag', drag: true } },
      { targets: ['t1'], title: 'Bad arrow', text: 'x', arrow: { from: 't1', to: 'elsewhere' } },
    ] }, snapshot)
    expect(r).toEqual({ steps: [
      { targets: ['period'], title: 'Fall 2026', text: 'A brainstorm list.' },
      { targets: ['t1'], title: 'Loose', text: 'Drag it.', arrow: { from: 't1', to: 'g1', label: 'drag', drag: true } },
      { targets: ['t1'], title: 'Bad arrow', text: 'x' },
    ] })
  })
  it('says why when nothing can be shown', () => {
    expect(showSteps({ steps: [{ targets: ['x'], title: 't', text: 'y' }] }, snapshot)).toEqual({ error: expect.stringContaining('(x)') })
    expect(showSteps({ steps: [] }, undefined)).toEqual({ error: expect.stringContaining('only available') })
  })
})
