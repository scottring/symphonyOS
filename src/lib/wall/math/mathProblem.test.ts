import { describe, expect, it } from 'vitest'
import {
  answerOf, checkAnswer, generateSpec, inputReady, kindForDate, MATH_KINDS, MAX_LEVEL, MIN_LEVEL,
  parseSpec, problemText, rngFor, seededRng, type MathSpec,
} from './mathProblem'

const digits = (n: number) => String(n).length

/** Every type × level × 200 seeds. */
function each(fn: (spec: MathSpec, level: number) => void) {
  for (const kind of MATH_KINDS) {
    for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
      for (let seed = 1; seed <= 200; seed++) fn(generateSpec(kind, level, seededRng(seed * 7919 + level)), level)
    }
  }
}

describe('kindForDate', () => {
  it('follows the weekday: Mon ×, Tue ÷, Wed fractions, Thu + −, Fri word', () => {
    const rng = seededRng(1)
    expect(kindForDate('2026-10-19', rng)).toBe('multiply')
    expect(kindForDate('2026-10-20', rng)).toBe('divide')
    expect(kindForDate('2026-10-14', rng)).toBe('fraction')
    expect(kindForDate('2026-10-15', rng)).toBe('addsub')
    expect(kindForDate('2026-10-16', rng)).toBe('word')
  })
  it('draws a weekend type from the seed, the same way twice', () => {
    expect(kindForDate('2026-10-17', rngFor('kid-a', '2026-10-17'))).toBe(kindForDate('2026-10-17', rngFor('kid-a', '2026-10-17')))
    expect(MATH_KINDS).toContain(kindForDate('2026-10-18', rngFor('kid-a', '2026-10-18')))
  })
})

describe('generateSpec', () => {
  it('is deterministic for the same seed', () => {
    for (const kind of MATH_KINDS) {
      expect(generateSpec(kind, 3, rngFor('m1', '2026-10-20'))).toEqual(generateSpec(kind, 3, rngFor('m1', '2026-10-20')))
    }
  })

  it('keeps every problem inside its level', () => {
    each((spec, level) => {
      switch (spec.kind) {
        case 'multiply':
          if (level <= 2) { expect(digits(spec.a)).toBe(2); expect(spec.b).toBeLessThan(10) }
          if (level === 2) expect((spec.a % 10) * spec.b).toBeGreaterThanOrEqual(10)
          if (level === 3) { expect(digits(spec.a)).toBe(3); expect(spec.b).toBeLessThan(10) }
          if (level >= 4) expect(digits(spec.b)).toBe(2)
          break
        case 'divide': {
          const r = spec.dividend % spec.divisor
          expect(spec.remainders).toBe(level >= 3)
          if (spec.remainders) expect(r).toBeGreaterThan(0)
          else expect(r).toBe(0)
          if (level === 1) expect(digits(spec.dividend)).toBe(2)
          if (level === 2 || level === 3) expect(digits(spec.dividend)).toBe(3)
          if (level === 4) expect(digits(spec.dividend)).toBe(4)
          if (level === 5) { expect(digits(spec.divisor)).toBe(2); expect(digits(spec.dividend)).toBe(3) }
          if (level < 5) expect(spec.divisor).toBeLessThan(10)
          break
        }
        case 'addsub':
          if (spec.op === '-') expect(spec.a).toBeGreaterThan(spec.b)
          if (level <= 2) expect(digits(spec.a)).toBe(3)
          if (level === 3 || level === 4) expect(digits(spec.a)).toBe(4)
          if (level === 4) expect(Math.floor(spec.a / 100) % 10).toBe(0)
          if (level === 5) expect(digits(spec.a)).toBe(5)
          break
        case 'fraction': {
          const a = answerOf(spec)
          if (spec.form === 'of') {
            expect(level).toBe(4)
            expect(spec.whole % spec.x.d).toBe(0)
            expect(spec.x.n).toBeLessThan(spec.x.d)
          } else {
            expect(a.type).toBe('fraction')
            if (a.type === 'fraction') {
              expect(a.n).toBeGreaterThan(0)
              expect(a.n).toBeLessThanOrEqual(a.d) // never more than one whole
            }
            if (level <= 2) expect(spec.x.d).toBe(spec.y.d)
            if (level === 3) expect(spec.y.d).toBe(spec.x.d * 2)
          }
          break
        }
        case 'word': {
          const a = answerOf(spec)
          expect(a.type).toBe('number')
          if (a.type === 'number') expect(a.value).toBeGreaterThan(0)
          if (spec.op1 === '÷') expect(spec.a % spec.b).toBe(0)
          break
        }
      }
    })
  })

  it('writes the problem as a line of math', () => {
    expect(problemText({ kind: 'divide', dividend: 742, divisor: 6, remainders: true })).toBe('742 ÷ 6')
    expect(problemText({ kind: 'fraction', form: 'add', x: { n: 3, d: 8 }, y: { n: 2, d: 8 } })).toBe('3/8 + 2/8')
    expect(problemText({ kind: 'fraction', form: 'of', x: { n: 3, d: 4 }, whole: 24 })).toBe('3/4 of 24')
    expect(problemText({ kind: 'addsub', op: '-', a: 503, b: 278 })).toBe('503 − 278')
  })
})

describe('answers', () => {
  it('computes each type', () => {
    expect(answerOf({ kind: 'divide', dividend: 742, divisor: 6, remainders: true })).toEqual({ type: 'remainder', quotient: 123, remainder: 4 })
    expect(answerOf({ kind: 'divide', dividend: 852, divisor: 4, remainders: false })).toEqual({ type: 'number', value: 213 })
    expect(answerOf({ kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 3, d: 8 } })).toEqual({ type: 'fraction', n: 5, d: 8 })
    expect(answerOf({ kind: 'fraction', form: 'of', x: { n: 3, d: 4 }, whole: 24 })).toEqual({ type: 'number', value: 18 })
    expect(answerOf({ kind: 'word', a: 12, op1: '×', b: 4, op2: '+', c: 15 })).toEqual({ type: 'number', value: 63 })
  })

  it('checks a remainder answer; an empty R box is 0', () => {
    const a = answerOf({ kind: 'divide', dividend: 742, divisor: 6, remainders: true })
    expect(checkAnswer(a, { a: '123', b: '4' })).toBe(true)
    expect(checkAnswer(a, { a: '123', b: '' })).toBe(false)
    expect(checkAnswer(a, { a: '124', b: '4' })).toBe(false)
    const exact = answerOf({ kind: 'divide', dividend: 853, divisor: 853, remainders: true })
    expect(checkAnswer(exact, { a: '1', b: '' })).toBe(true)
  })

  it('accepts any equal fraction', () => {
    const a = answerOf({ kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 1, d: 4 } })
    expect(checkAnswer(a, { a: '2', b: '4' })).toBe(true)
    expect(checkAnswer(a, { a: '1', b: '2' })).toBe(true)
    expect(checkAnswer(a, { a: '3', b: '4' })).toBe(false)
    expect(checkAnswer(a, { a: '1', b: '0' })).toBe(false)
    expect(inputReady(a, { a: '1', b: '' })).toBe(false)
  })

  it('rejects anything that isn’t a whole number', () => {
    const a = answerOf({ kind: 'multiply', a: 48, b: 7 })
    expect(checkAnswer(a, { a: '', b: '' })).toBe(false)
    expect(checkAnswer(a, { a: '33x', b: '' })).toBe(false)
    expect(checkAnswer(a, { a: '336', b: '' })).toBe(true)
  })
})

describe('parseSpec', () => {
  it('reads back what the generator writes', () => {
    each((spec) => { expect(parseSpec(JSON.parse(JSON.stringify(spec)))).toEqual(spec) })
  })
  it('refuses a malformed row', () => {
    expect(parseSpec(null)).toBeNull()
    expect(parseSpec({ kind: 'divide', dividend: 10, divisor: 0 })).toBeNull()
    expect(parseSpec({ kind: 'fraction', form: 'add', x: { n: 1, d: 0 }, y: { n: 1, d: 2 } })).toBeNull()
    expect(parseSpec({ kind: 'nope' })).toBeNull()
  })
})
