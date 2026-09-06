import { describe, it, expect } from 'vitest'
import { findLikelyDuplicate } from '@/lib/planDuplicates'

describe('findLikelyDuplicate', () => {
  it('matches gutters lines across pages', () => {
    const ex = [
      { id: '1', title: 'Get gutters cleaned before the leaves' },
      { id: '2', title: 'Pay water bill' },
    ]
    // 1 shared word out of 4/5 — a different errand, not the same line.
    expect(findLikelyDuplicate('Get quotes on gutters', ex)?.id).toBeUndefined()
    expect(findLikelyDuplicate('Get gutters cleaned', ex)?.id).toBe('1')
    expect(findLikelyDuplicate('Go to pumpkin patch', [{ id: '3', title: 'Pumpkin patch' }])?.id).toBe('3')
  })

  it('ignores empty and stopword-only titles', () => {
    expect(findLikelyDuplicate('the a to', [{ id: '1', title: 'Pay water bill' }])).toBeNull()
    expect(findLikelyDuplicate('Pay water bill', [{ id: '1', title: 'the a to' }])).toBeNull()
    expect(findLikelyDuplicate('Pay water bill', [])).toBeNull()
  })

  it('picks the closest of several open tasks', () => {
    const ex = [
      { id: 'a', title: 'Pay water bill' },
      { id: 'b', title: 'Book Iceland flights' },
    ]
    expect(findLikelyDuplicate('Book flights to Iceland', ex)?.id).toBe('b')
  })

  it('does not call two short unrelated lines the same', () => {
    expect(findLikelyDuplicate('Pay water bill', [{ id: '1', title: 'Pay gas bill' }])).toBeNull()
  })
})
