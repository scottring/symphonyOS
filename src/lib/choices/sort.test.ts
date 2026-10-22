import { describe, it, expect } from 'vitest'
import { sortOptions } from './sort'
import type { ChoiceOption, CellValue } from '@/types/choice'

const now = new Date()
const opt = (id: string, order: number, values: Record<string, CellValue> = {}, name = id): ChoiceOption => ({
  id, choiceId: 'c', userId: 'u', name, status: 'considering', statusChangedAt: now,
  values, sortOrder: order, updatedAt: now,
})
const ids = (os: ChoiceOption[]) => os.map((o) => o.id)
const noPrice = () => null

describe('sortOptions', () => {
  const a = opt('a', 1, { n: 30, d: '2026-12-01', y: false, t: 'pear' }, 'Zed')
  const b = opt('b', 2, { n: 10, d: '2026-11-17', y: true, t: 'apple' }, 'amy')
  const c = opt('c', 3, {}, 'Bob')
  const d = opt('d', 0, { n: 10, d: '', y: null, t: '' }, 'Dan')
  const all = [a, b, c, d]

  it('null key keeps sortOrder', () => {
    expect(ids(sortOptions(all, null, noPrice))).toEqual(['d', 'a', 'b', 'c'])
  })
  it('name sorts lexically, ignoring case', () => {
    expect(ids(sortOptions(all, { kind: 'name' }, noPrice))).toEqual(['b', 'c', 'd', 'a'])
  })
  it('numbers ascending, blanks last, ties keep sortOrder', () => {
    expect(ids(sortOptions(all, { kind: 'column', columnId: 'n' }, noPrice))).toEqual(['d', 'b', 'a', 'c'])
  })
  it('dates and text sort lexically with blanks last', () => {
    expect(ids(sortOptions(all, { kind: 'column', columnId: 'd' }, noPrice))).toEqual(['b', 'a', 'd', 'c'])
    expect(ids(sortOptions(all, { kind: 'column', columnId: 't' }, noPrice))).toEqual(['b', 'a', 'd', 'c'])
  })
  it('yes/no puts true first, false next, blank last', () => {
    expect(ids(sortOptions(all, { kind: 'column', columnId: 'y' }, noPrice))).toEqual(['b', 'a', 'd', 'c'])
  })
  it('price ascending with no price last', () => {
    const prices: Record<string, number | null> = { a: 500, b: 200, c: null, d: 200 }
    expect(ids(sortOptions(all, { kind: 'price' }, (o) => prices[o.id]))).toEqual(['d', 'b', 'a', 'c'])
  })
  it('does not mutate the input', () => {
    const copy = [...all]
    sortOptions(all, { kind: 'name' }, noPrice)
    expect(all).toEqual(copy)
  })
})
