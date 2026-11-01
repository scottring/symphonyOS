import { describe, it, expect } from 'vitest'
import { groupByArea } from './byArea'
import type { LifeArea } from '@/hooks/useLifeAreas'

const area = (id: string, name: string, sortOrder: number): LifeArea => ({ id, name, context: 'personal', mine: true, sortOrder })
const health = area('h', 'Health', 0)
const money = area('m', 'Money', 1)
const fun = area('f', 'Fun', 2)

describe('groupByArea', () => {
  it('groups in area sort order, keeping each group in its item order, then No area last', () => {
    const items = [
      { t: 'a', areaId: 'm' }, { t: 'b', areaId: null }, { t: 'c', areaId: 'h' }, { t: 'd', areaId: 'm' }, { t: 'e' },
    ]
    // Passed out of order on purpose: sortOrder decides.
    const g = groupByArea(items, [money, fun, health])
    expect(g.map((x) => x.area?.name ?? null)).toEqual(['Health', 'Money', null])
    expect(g[0].items.map((i) => i.t)).toEqual(['c'])
    expect(g[1].items.map((i) => i.t)).toEqual(['a', 'd'])
    expect(g[2].items.map((i) => i.t)).toEqual(['b', 'e'])
  })

  it('omits areas with no items and the No area group when empty', () => {
    const g = groupByArea([{ areaId: 'f' }], [health, money, fun])
    expect(g).toHaveLength(1)
    expect(g[0].area?.name).toBe('Fun')
  })

  it('puts an item whose area the viewer cannot see under No area', () => {
    const g = groupByArea([{ areaId: 'hidden' }, { areaId: '' }], [health])
    expect(g).toHaveLength(1)
    expect(g[0].area).toBeNull()
    expect(g[0].items).toHaveLength(2)
  })

  it('with no areas at all is one group with no area, passing items through', () => {
    const items = [{ areaId: 'x' }, { areaId: null }]
    expect(groupByArea(items, [])).toEqual([{ area: null, items }])
  })

  it('returns nothing for no items', () => {
    expect(groupByArea([], [health])).toEqual([])
    expect(groupByArea([], [])).toEqual([])
  })
})
