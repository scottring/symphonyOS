import { describe, it, expect } from 'vitest'
import { formatCents, workLabel, priceFor, howItAddsUp, pricedSummary } from './price'
import type { PriceLine, WorkPiece } from '@/types/choice'

const WORK: WorkPiece[] = [
  { id: 'main', label: 'Main bath' },
  { id: 'hall', label: 'Hall bath' },
  { id: 'kids', label: "Kids' bath" },
]
let n = 0
const line = (workIds: string[], amountCents: number): PriceLine => ({
  id: `l${n++}`, optionId: 'o', workIds, amountCents, sortOrder: n,
})
const MARTINEZ = [line(['main'], 1840000), line(['hall'], 980000), line(['kids'], 720000)]
const HARBOR = [line(['main'], 2290000), line(['main', 'hall', 'kids'], 4450000)]
const CHESAPEAKE = [line(['main'], 1975000), line(['main', 'hall'], 2700000)]

describe('price', () => {
  it('formats whole and part dollars', () => {
    expect(formatCents(1840000)).toBe('$18,400'); expect(formatCents(1840050)).toBe('$18,400.50')
  })
  it('labels pieces, and every piece as All three', () => {
    expect(workLabel(['main', 'hall'], WORK)).toBe('Main bath + Hall bath')
    expect(workLabel(['main', 'hall', 'kids'], WORK)).toBe('All three')
    expect(workLabel(['kids', 'main'], WORK)).toBe("Main bath + Kids' bath")
    expect(workLabel(['main'], WORK)).toBe('Main bath')
    expect(workLabel(['main', 'hall'], WORK.slice(0, 2))).toBe('Main bath + Hall bath')
  })
  it('sums separate lines for the selection', () => {
    const r = priceFor(MARTINEZ, ['main', 'hall'], WORK)!
    expect(r.totalCents).toBe(2820000)
    expect(howItAddsUp(r, WORK)).toBe('Main bath $18,400 + Hall bath $9,800')
  })
  it('uses a bundle line that covers exactly the selection', () => {
    const r = priceFor(CHESAPEAKE, ['main', 'hall'], WORK)!
    expect(r.totalCents).toBe(2700000)
    expect(howItAddsUp(r, WORK)).toBe('Main bath + Hall bath, one price')
    expect(howItAddsUp(priceFor(HARBOR, ['main', 'hall', 'kids'], WORK)!, WORK)).toBe('All three, one price')
  })
  it('takes the lowest way to add up the same pieces', () => {
    const lines = [...MARTINEZ, line(['main', 'hall'], 2500000)]
    expect(priceFor(lines, ['main', 'hall'], WORK)!.totalCents).toBe(2500000)
  })
  it('returns null when the lines cannot cover exactly the selection', () => {
    expect(priceFor(HARBOR, ['main', 'hall'], WORK)).toBeNull()
    expect(pricedSummary(HARBOR, WORK)).toBe('Priced: Main bath $22,900 · All three $44,500')
  })
  it('ignores lines naming removed pieces', () => {
    const lines = [...MARTINEZ, line(['gone'], 100)]
    expect(priceFor(lines, ['main'], WORK)!.totalCents).toBe(1840000)
  })
  it('with no work list, the price is the sum of the lines', () => {
    expect(priceFor([line([], 120000)], [], [])!.totalCents).toBe(120000)
    expect(priceFor([], [], [])).toBeNull()
  })
})
