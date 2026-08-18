import { describe, it, expect, beforeEach } from 'vitest'
import {
  isBuyish, buyItemText, findToBuyList,
  isToBuyNudgeDismissed, dismissToBuyNudge,
} from './toBuy'
import type { List } from '@/types/list'

describe('isBuyish', () => {
  it.each([
    'buy pull ups',
    'Buy pull ups',
    'pick up dry cleaning',
    'Pickup prescription',
    'order new soccer cleats',
    'purchase parking pass',
  ])('matches "%s"', (title) => {
    expect(isBuyish(title)).toBe(true)
  })

  it.each([
    'get haircut',            // "get" deliberately excluded — too broad
    'call about the order',   // verb must LEAD the title
    'email re: purchase',
    'buy',                    // a verb with no object is not an item
    'Schedule fall activities',
    'buyer meeting prep',     // "buy" must be a whole word
  ])('does not match "%s"', (title) => {
    expect(isBuyish(title)).toBe(false)
  })
})

describe('buyItemText', () => {
  it('strips the verb and capitalizes', () => {
    expect(buyItemText('buy pull ups')).toBe('Pull ups')
    expect(buyItemText('pick up dry cleaning')).toBe('Dry cleaning')
    expect(buyItemText('order new soccer cleats')).toBe('New soccer cleats')
  })

  it('still trims and capitalizes when no verb leads the title', () => {
    expect(buyItemText('  pull ups  ')).toBe('Pull ups')
  })
})

describe('findToBuyList', () => {
  const mk = (title: string, externalSource?: string): List => ({
    id: title, title, category: 'shopping', visibility: 'family',
    sortOrder: 0, externalSource, createdAt: new Date(0), updatedAt: new Date(0),
  })

  it('finds the native list case-insensitively', () => {
    expect(findToBuyList([mk('Groceries'), mk('to BUY')])?.title).toBe('to BUY')
  })

  it('NEVER matches an Apple-bridged list of the same name — the bridge resurrects deleted rows', () => {
    expect(findToBuyList([mk('To buy', 'apple_reminders')])).toBeUndefined()
  })

  it('returns undefined when absent (caller creates lazily)', () => {
    expect(findToBuyList([mk('Groceries')])).toBeUndefined()
  })
})

describe('nudge dismissals', () => {
  beforeEach(() => localStorage.clear())

  it('persists a dismissal per task', () => {
    expect(isToBuyNudgeDismissed('t1')).toBe(false)
    dismissToBuyNudge('t1')
    expect(isToBuyNudgeDismissed('t1')).toBe(true)
    expect(isToBuyNudgeDismissed('t2')).toBe(false)
  })
})
