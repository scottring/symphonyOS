import { describe, it, expect } from 'vitest'
import { MORE_GROUPS, isDestinationActive } from './moreDestinations'

const all = MORE_GROUPS.flatMap(([, items]) => items)

describe('the More menu', () => {
  // Live check, 2026-09-24: /guide rendered correctly and nothing in this
  // layout's navigation pointed at it.
  it('offers the planning guide', () => {
    const guide = all.find((d) => d.label === 'Planning guide')
    expect(guide).toEqual({ label: 'Planning guide', route: '/guide' })
  })

  it('marks the guide active while it is open', () => {
    expect(isDestinationActive('/guide', '/guide')).toBe(true)
    expect(isDestinationActive('/guide', '/today')).toBe(false)
  })

  it('keeps every destination reachable and unique', () => {
    const routes = all.map((d) => d.route)
    expect(new Set(routes).size).toBe(routes.length)
    for (const d of all) expect(d.route.startsWith('/')).toBe(true)
  })
})
