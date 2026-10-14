import { describe, expect, it } from 'vitest'
import { answerOf, generateSpec, MAX_LEVEL, MIN_LEVEL, seededRng, type MathSpec } from './mathProblem'
import { BLANK_CELL, cellsThrough, defaultHint, longDivisionSteps, paperGeometry, TOP_ROOM, workedSolution } from './mathWorked'

/** The digits written in one row, left to right. */
function rowText(spec: MathSpec, row: number): string {
  const w = workedSolution(spec)
  return cellsThrough(w, w.steps.length - 1).cells
    .filter((c) => c.row === row && c.tone === 'work' && /^[\dR]/.test(c.text))
    .sort((a, b) => a.col - b.col)
    .map((c) => c.text)
    .join('')
}

describe('long division', () => {
  it('works 742 ÷ 6 the way it is written by hand', () => {
    expect(longDivisionSteps(742, 6)).toEqual([
      { i: 0, cur: 7, q: 1, product: 6, rem: 1 },
      { i: 1, cur: 14, q: 2, product: 12, rem: 2 },
      { i: 2, cur: 22, q: 3, product: 18, rem: 4 },
    ])
    const w = workedSolution({ kind: 'divide', dividend: 742, divisor: 6, remainders: true })
    expect(w.steps).toHaveLength(3)
    expect(w.steps[2].say).toContain('742 ÷ 6 = 123 R4')
    expect(rowText({ kind: 'divide', dividend: 742, divisor: 6, remainders: true }, 0)).toBe('123R4')
    expect(w.bracket).toEqual({ col: 3, row: 1, span: 3 })
  })

  it('starts with two digits when the first is too small', () => {
    const w = workedSolution({ kind: 'divide', dividend: 256, divisor: 4, remainders: false })
    expect(w.steps[0].say).toMatch(/^4 doesn’t fit in 2, so start with 25\./)
    expect(rowText({ kind: 'divide', dividend: 256, divisor: 4, remainders: false }, 0)).toBe('64')
  })

  it('handles a zero in the middle of the answer', () => {
    // 618 ÷ 6 = 103: the 1 brought down makes 1, and 6 goes into it 0 times.
    expect(rowText({ kind: 'divide', dividend: 618, divisor: 6, remainders: false }, 0)).toBe('103')
  })
})

describe('every generated problem works out to its answer', () => {
  for (const kind of ['divide', 'multiply', 'addsub'] as const) {
    it(kind, () => {
      for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
        for (let seed = 1; seed <= 150; seed++) {
          const spec = generateSpec(kind, level, seededRng(seed * 104729 + level))
          const a = answerOf(spec)
          const w = workedSolution(spec)
          expect(w.rows).toBeLessThanOrEqual(10)
          const all = [...w.given, ...w.steps.flatMap((s) => s.cells)]
          expect(Math.min(...all.map((c) => c.col))).toBeGreaterThanOrEqual(0)
          expect(Math.max(...all.map((c) => c.col))).toBeLessThanOrEqual(12)
          if (spec.kind === 'divide') {
            const want = a.type === 'remainder' ? `${a.quotient}R${a.remainder}` : String(a.type === 'number' ? a.value : '')
            expect(rowText(spec, 0)).toBe(want)
          } else if (spec.kind === 'multiply') {
            const last = spec.b < 10 ? 3 : 3 + String(spec.b).length
            expect(rowText(spec, last)).toBe(String(spec.a * spec.b))
          } else if (spec.kind === 'addsub') {
            expect(rowText(spec, 3)).toBe(String(spec.op === '+' ? spec.a + spec.b : spec.a - spec.b))
          }
        }
      }
    })
  }
})

describe('column work', () => {
  it('carries in multiplication', () => {
    const w = workedSolution({ kind: 'multiply', a: 48, b: 7 })
    expect(w.steps[0].say).toBe('Ones: 8 × 7 = 56. Write the 6 and carry the 5 to the tens.')
    expect(w.steps[1].say).toBe('Tens: 4 × 7 = 28 + the 5 you carried = 33. Write 33. So 48 × 7 = 336.')
  })

  it('borrows across zeros, showing the new digits', () => {
    const spec: MathSpec = { kind: 'addsub', op: '-', a: 4003, b: 1278 }
    const w = workedSolution(spec)
    expect(w.steps[0].say).toContain('borrow from the thousands (the 0s on the way become 9s)')
    const marks = cellsThrough(w, 0).cells.filter((c) => c.tone === 'carry').map((c) => c.text).sort()
    expect(marks).toEqual(['13', '3', '9', '9'])
    expect(rowText(spec, 3)).toBe('2725')
  })

  it('doesn’t write a leading zero', () => {
    expect(rowText({ kind: 'addsub', op: '-', a: 2004, b: 1987 }, 3)).toBe('17')
  })
})

describe('fractions and word problems', () => {
  it('matches the bottoms first when they differ', () => {
    const w = workedSolution({ kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 3, d: 8 } })
    expect(w.given).toEqual([])
    expect(w.steps.map((s) => s.say).join(' ')).toContain('1/4 = 2/8')
    expect(w.steps.at(-1)!.say).toContain('5/8')
  })
  it('notes the simplest form', () => {
    const w = workedSolution({ kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 1, d: 4 } })
    expect(w.steps.at(-1)!.say).toContain('same as 1/2')
  })
  it('takes a fraction of a number in two steps', () => {
    const w = workedSolution({ kind: 'fraction', form: 'of', x: { n: 3, d: 4 }, whole: 24 })
    expect(w.steps.map((s) => s.say)).toEqual([
      'The bottom number says how many equal groups: split 24 into 4 groups. 24 ÷ 4 = 6 in each.',
      'The top number says how many groups to take: 3 × 6 = 18. So 3/4 of 24 is 18.',
    ])
  })
  it('walks a word problem in its two steps', () => {
    const w = workedSolution({ kind: 'word', a: 12, op1: '×', b: 4, op2: '+', c: 15 })
    expect(w.steps.map((s) => s.say)).toEqual(['Two steps. First: 12 × 4 = 48.', 'Then: 48 + 15 = 63. The answer is 63.'])
  })
})

describe('defaultHint', () => {
  it('never gives the answer away', () => {
    for (const kind of ['divide', 'multiply', 'addsub', 'fraction', 'word'] as const) {
      for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
        const spec = generateSpec(kind, level, seededRng(level * 31 + kind.length))
        const a = answerOf(spec)
        const value = a.type === 'number' ? String(a.value) : a.type === 'remainder' ? String(a.quotient) : `${a.n}/${a.d}`
        if (value.length > 1) expect(defaultHint(spec)).not.toContain(value)
      }
    }
  })
})

describe('paperGeometry', () => {
  // The wall's paper, in design px, beside the pens (1920×1080 frame).
  const W = 880, H = 640

  it('leaves room above the problem and makes squares as big as it fits', () => {
    const g = paperGeometry(workedSolution({ kind: 'multiply', a: 48, b: 7 }), W, H)
    expect(g.cell).toBeGreaterThanOrEqual(96)
    expect(g.offY).toBe(Math.round(TOP_ROOM * g.cell))
    const d = paperGeometry(workedSolution({ kind: 'divide', dividend: 742, divisor: 6, remainders: true }), W, H)
    expect(d.cell).toBeGreaterThanOrEqual(64)
    expect(d.offY).toBeGreaterThan(d.cell)
  })

  it('a blank sheet gets big squares', () => {
    expect(paperGeometry(workedSolution({ kind: 'word', a: 12, op1: '×', b: 4, op2: '+', c: 15 }), W, H)).toEqual({ cell: BLANK_CELL, offX: 0, offY: 0 })
  })

  it('every generated problem fits the paper, room at the top included', () => {
    for (const kind of ['divide', 'multiply', 'addsub'] as const) {
      for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
        for (let seed = 1; seed <= 60; seed++) {
          const w = workedSolution(generateSpec(kind, level, seededRng(seed * 7 + level)))
          const g = paperGeometry(w, W, H)
          expect(g.offY + w.rows * g.cell).toBeLessThanOrEqual(H)
          const lastCol = Math.max(...[...w.given, ...w.steps.flatMap((s) => s.cells)].map((c) => c.col + (c.text.length > 1 ? 1 : 0)))
          expect(g.offX + (lastCol + 1) * g.cell).toBeLessThanOrEqual(W)
        }
      }
    }
  })
})
