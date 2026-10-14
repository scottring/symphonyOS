// Math of the day (Scott, 2026-10-14; mockup "Math of the Day"): each kid
// gets one problem a day on the kitchen wall, worked out with a finger on
// grid paper and answered on a number pad.
//
// The CODE picks the problem: the type comes from the weekday (Mon ×, Tue
// long division, Wed fractions, Thu big + / −, Fri a two-step word problem;
// weekends draw one at random), the numbers from the kid's level for that
// type, and the answer is computed here, so the answer key is always right.
// Claude only dresses the numbers in a story (mathWording.ts).
//
// Seeded by kid + date, so building the same day twice gives the same problem
// (two walls loading at once agree before the database does).
//
// PURE: no clock reads, no storage.

export type MathKind = 'multiply' | 'divide' | 'fraction' | 'addsub' | 'word'

export interface Frac { n: number; d: number }

export type MathSpec =
  | { kind: 'multiply'; a: number; b: number }
  | { kind: 'divide'; dividend: number; divisor: number; remainders: boolean }
  | { kind: 'addsub'; op: '+' | '-'; a: number; b: number }
  | { kind: 'fraction'; form: 'add' | 'sub'; x: Frac; y: Frac }
  | { kind: 'fraction'; form: 'of'; x: Frac; whole: number }
  | { kind: 'word'; a: number; op1: '×' | '÷'; b: number; op2: '+' | '-'; c: number }

export type MathAnswer =
  | { type: 'number'; value: number }
  | { type: 'remainder'; quotient: number; remainder: number }
  | { type: 'fraction'; n: number; d: number }

/** What the kid typed: the boxes on the pad, as typed. Remainder: a = the
 *  answer, b = R. Fraction: a = top, b = bottom. Number: a only. */
export interface MathInput { a: string; b: string }

export const MIN_LEVEL = 1
export const MAX_LEVEL = 5
/** Every type starts one rung above typical third-grade work. */
export const START_LEVEL = 2

const WEEKDAY_KIND: Record<number, MathKind> = { 1: 'multiply', 2: 'divide', 3: 'fraction', 4: 'addsub', 5: 'word' }
export const MATH_KINDS: MathKind[] = ['multiply', 'divide', 'fraction', 'addsub', 'word']

export const KIND_LABEL: Record<MathKind, string> = {
  multiply: 'Multiplication',
  divide: 'Long division',
  fraction: 'Fractions',
  addsub: 'Big adding & subtracting',
  word: 'Word problem',
}

/** One line per level, shown as the level chip ("3-digit ÷ 1-digit, remainders"). */
export const LEVEL_LABEL: Record<MathKind, string[]> = {
  multiply: ['2-digit × 1-digit', '2-digit × 1-digit, carrying', '3-digit × 1-digit', '2-digit × 2-digit', '3-digit × 2-digit'],
  divide: ['2-digit ÷ 1-digit', '3-digit ÷ 1-digit', '3-digit ÷ 1-digit, remainders', '4-digit ÷ 1-digit, remainders', '3-digit ÷ 2-digit, remainders'],
  fraction: ['Adding, same bottoms', 'Subtracting, same bottoms', 'Adding, matching bottoms', 'A fraction of a number', 'Adding, different bottoms'],
  addsub: ['3-digit adding', '3-digit subtracting', '4-digit adding', '4-digit subtracting across zeros', '5-digit adding & subtracting'],
  word: ['Two steps, small numbers', 'Two steps: × then +', 'Two steps: × then −', 'Two steps: ÷ then +', 'Two steps, big numbers'],
}

// ─── Seeded randomness ───

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Rng = () => number

/** mulberry32: small, fast, good enough for picking numbers. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
}

/** The type for a date: Mon–Fri fixed, weekends drawn from the day's seed. */
export function kindForDate(ymd: string, rng: Rng): MathKind {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return WEEKDAY_KIND[dow] ?? pick(rng, MATH_KINDS)
}

export function rngFor(memberId: string, ymd: string): Rng {
  return seededRng(hashString(`${memberId}:${ymd}`))
}

// ─── Generators, one per type ───

function carries(a: number, b: number): boolean {
  let x = a, y = b
  while (x > 0 || y > 0) {
    if ((x % 10) + (y % 10) >= 10) return true
    x = Math.floor(x / 10); y = Math.floor(y / 10)
  }
  return false
}

function borrows(a: number, b: number): boolean {
  let x = a, y = b
  while (y > 0) {
    if (x % 10 < y % 10) return true
    x = Math.floor(x / 10); y = Math.floor(y / 10)
  }
  return false
}

/** Retry a draw until it meets the level's rule (bounded; the last draw stands). */
function until<T>(draw: () => T, ok: (t: T) => boolean, tries = 50): T {
  let t = draw()
  for (let i = 0; i < tries && !ok(t); i++) t = draw()
  return t
}

function multiply(level: number, rng: Rng): MathSpec {
  switch (level) {
    case 1: return { kind: 'multiply', a: int(rng, 11, 49), b: int(rng, 2, 5) }
    case 2: return until(() => ({ kind: 'multiply' as const, a: int(rng, 13, 99), b: int(rng, 3, 9) }), (s) => (s.a % 10) * s.b >= 10)
    case 3: return { kind: 'multiply', a: int(rng, 104, 999), b: int(rng, 3, 9) }
    case 4: return until(() => ({ kind: 'multiply' as const, a: int(rng, 13, 99), b: int(rng, 12, 49) }), (s) => s.b % 10 !== 0)
    default: return until(() => ({ kind: 'multiply' as const, a: int(rng, 104, 499), b: int(rng, 12, 59) }), (s) => s.b % 10 !== 0)
  }
}

function divide(level: number, rng: Rng): MathSpec {
  const make = (divisor: number, quotient: number, remainder: number, remainders: boolean): MathSpec =>
    ({ kind: 'divide', dividend: divisor * quotient + remainder, divisor, remainders })
  switch (level) {
    case 1: {
      const divisor = int(rng, 2, 5)
      return make(divisor, int(rng, 11, Math.floor(99 / divisor)), 0, false)
    }
    case 2: {
      const divisor = int(rng, 3, 9)
      return make(divisor, int(rng, Math.ceil(100 / divisor), Math.floor(999 / divisor)), 0, false)
    }
    case 3: {
      const divisor = int(rng, 3, 9)
      return until(() => make(divisor, int(rng, Math.ceil(100 / divisor), Math.floor(990 / divisor)), int(rng, 1, divisor - 1), true),
        (s) => s.kind === 'divide' && s.dividend <= 999)
    }
    case 4: {
      const divisor = int(rng, 4, 9)
      return until(() => make(divisor, int(rng, Math.ceil(1000 / divisor), Math.floor(9990 / divisor)), int(rng, 1, divisor - 1), true),
        (s) => s.kind === 'divide' && s.dividend <= 9999)
    }
    default: {
      const divisor = int(rng, 11, 25)
      return until(() => make(divisor, int(rng, 12, 60), int(rng, 1, divisor - 1), true),
        (s) => s.kind === 'divide' && s.dividend >= 100 && s.dividend <= 999)
    }
  }
}

function addsub(level: number, rng: Rng): MathSpec {
  switch (level) {
    case 1: return until(() => ({ kind: 'addsub' as const, op: '+' as const, a: int(rng, 120, 799), b: int(rng, 105, 199) }), (s) => carries(s.a, s.b))
    case 2: return until(() => ({ kind: 'addsub' as const, op: '-' as const, a: int(rng, 300, 999), b: int(rng, 105, 299) }), (s) => s.a > s.b && borrows(s.a, s.b))
    case 3: return until(() => ({ kind: 'addsub' as const, op: '+' as const, a: int(rng, 1200, 6999), b: int(rng, 1050, 2999) }), (s) => carries(s.a, s.b))
    case 4: {
      // A zero in the hundreds (and sometimes the tens) of the top number: borrowing across zeros.
      return until(() => {
        const tensZero = rng() < 0.5
        const a = int(rng, 2, 9) * 1000 + (tensZero ? 0 : int(rng, 1, 9) * 10) + int(rng, 0, 8)
        return { kind: 'addsub' as const, op: '-' as const, a, b: int(rng, 150, 999) }
      }, (s) => s.a > s.b && borrows(s.a, s.b) && (s.a % 10) < (s.b % 10))
    }
    default: {
      const op = rng() < 0.5 ? '+' as const : '-' as const
      return op === '+'
        ? until(() => ({ kind: 'addsub' as const, op, a: int(rng, 12000, 59999), b: int(rng, 10500, 39999) }), (s) => carries(s.a, s.b))
        : until(() => ({ kind: 'addsub' as const, op, a: int(rng, 40000, 99999), b: int(rng, 10500, 39999) }), (s) => s.a > s.b && borrows(s.a, s.b))
    }
  }
}

function fraction(level: number, rng: Rng): MathSpec {
  switch (level) {
    case 1: {
      const d = pick(rng, [4, 5, 6, 8, 10])
      const n1 = int(rng, 1, d - 2)
      return { kind: 'fraction', form: 'add', x: { n: n1, d }, y: { n: int(rng, 1, d - 1 - n1), d } }
    }
    case 2: {
      const d = pick(rng, [5, 6, 8, 10, 12])
      const n1 = int(rng, 3, d - 1)
      return { kind: 'fraction', form: 'sub', x: { n: n1, d }, y: { n: int(rng, 1, n1 - 1), d } }
    }
    case 3: {
      const d1 = pick(rng, [2, 3, 4, 5])
      const d2 = d1 * 2
      const n1 = int(rng, 1, d1 - 1)
      // Keep the sum at or under one whole: n1/d1 + n2/d2 ≤ 1 → n2 ≤ d2 − 2·n1.
      const room = d2 - 2 * n1
      if (room < 1) return { kind: 'fraction', form: 'add', x: { n: 1, d: d1 }, y: { n: 1, d: d2 } }
      return { kind: 'fraction', form: 'add', x: { n: n1, d: d1 }, y: { n: int(rng, 1, room), d: d2 } }
    }
    case 4: {
      const d = pick(rng, [2, 3, 4, 5, 6, 8])
      return { kind: 'fraction', form: 'of', x: { n: int(rng, 1, d - 1), d }, whole: d * int(rng, 3, 12) }
    }
    default: {
      const pairs: [number, number][] = [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [4, 6], [5, 6], [3, 8]]
      return until(() => {
        const [d1, d2] = pick(rng, pairs)
        return { kind: 'fraction' as const, form: 'add' as const, x: { n: int(rng, 1, d1 - 1), d: d1 }, y: { n: int(rng, 1, d2 - 1), d: d2 } }
      }, (s) => s.x.n * s.y.d + s.y.n * s.x.d <= s.x.d * s.y.d)
    }
  }
}

function word(level: number, rng: Rng): MathSpec {
  switch (level) {
    case 1: return { kind: 'word', a: int(rng, 3, 9), op1: '×', b: int(rng, 3, 9), op2: '+', c: int(rng, 10, 49) }
    case 2: return { kind: 'word', a: int(rng, 12, 40), op1: '×', b: int(rng, 3, 9), op2: '+', c: int(rng, 11, 99) }
    case 3: {
      const a = int(rng, 12, 40), b = int(rng, 3, 9)
      return { kind: 'word', a, op1: '×', b, op2: '-', c: int(rng, 10, a * b - 5) }
    }
    case 4: {
      const b = int(rng, 3, 9)
      return { kind: 'word', a: b * int(rng, Math.ceil(100 / b), Math.floor(999 / b)), op1: '÷', b, op2: '+', c: int(rng, 11, 99) }
    }
    default: {
      const a = int(rng, 12, 30), b = int(rng, 11, 25)
      return { kind: 'word', a, op1: '×', b, op2: '-', c: int(rng, 100, a * b - 20) }
    }
  }
}

export function generateSpec(kind: MathKind, level: number, rng: Rng): MathSpec {
  const l = clampLevel(level)
  switch (kind) {
    case 'multiply': return multiply(l, rng)
    case 'divide': return divide(l, rng)
    case 'addsub': return addsub(l, rng)
    case 'fraction': return fraction(l, rng)
    case 'word': return word(l, rng)
  }
}

// ─── Answers ───

export function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b)
  while (y) [x, y] = [y, x % y]
  return x || 1
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

export function answerOf(spec: MathSpec): MathAnswer {
  switch (spec.kind) {
    case 'multiply': return { type: 'number', value: spec.a * spec.b }
    case 'divide': {
      const quotient = Math.floor(spec.dividend / spec.divisor)
      return spec.remainders
        ? { type: 'remainder', quotient, remainder: spec.dividend % spec.divisor }
        : { type: 'number', value: quotient }
    }
    case 'addsub': return { type: 'number', value: spec.op === '+' ? spec.a + spec.b : spec.a - spec.b }
    case 'word': {
      const first = spec.op1 === '×' ? spec.a * spec.b : spec.a / spec.b
      return { type: 'number', value: spec.op2 === '+' ? first + spec.c : first - spec.c }
    }
    case 'fraction': {
      if (spec.form === 'of') return { type: 'number', value: (spec.whole / spec.x.d) * spec.x.n }
      const d = lcm(spec.x.d, spec.y.d)
      const nx = spec.x.n * (d / spec.x.d), ny = spec.y.n * (d / spec.y.d)
      return { type: 'fraction', n: spec.form === 'add' ? nx + ny : nx - ny, d }
    }
  }
}

/** Any equal fraction counts (6/8 for 3/4); a remainder box left empty is 0. */
export function checkAnswer(answer: MathAnswer, input: MathInput): boolean {
  const a = input.a.trim(), b = input.b.trim()
  if (!/^\d+$/.test(a)) return false
  switch (answer.type) {
    case 'number': return Number(a) === answer.value
    case 'remainder': {
      if (b && !/^\d+$/.test(b)) return false
      return Number(a) === answer.quotient && Number(b || 0) === answer.remainder
    }
    case 'fraction': {
      if (!/^\d+$/.test(b) || Number(b) === 0) return false
      return Number(a) * answer.d === answer.n * Number(b)
    }
  }
}

/** Is the input complete enough to check? */
export function inputReady(answer: MathAnswer, input: MathInput): boolean {
  if (!input.a.trim()) return false
  return answer.type !== 'fraction' || !!input.b.trim()
}

export function fracText(f: Frac): string {
  return `${f.n}/${f.d}`
}

/** The bare problem, as a line of math: "742 ÷ 6", "3/8 + 2/8", "3/4 of 24". */
export function problemText(spec: MathSpec): string {
  switch (spec.kind) {
    case 'multiply': return `${spec.a} × ${spec.b}`
    case 'divide': return `${spec.dividend} ÷ ${spec.divisor}`
    case 'addsub': return `${spec.a} ${spec.op === '+' ? '+' : '−'} ${spec.b}`
    case 'word': return `(${spec.a} ${spec.op1} ${spec.b}) ${spec.op2 === '+' ? '+' : '−'} ${spec.c}`
    case 'fraction':
      return spec.form === 'of'
        ? `${fracText(spec.x)} of ${spec.whole}`
        : `${fracText(spec.x)} ${spec.form === 'add' ? '+' : '−'} ${fracText(spec.y)}`
  }
}

export function answerText(answer: MathAnswer): string {
  switch (answer.type) {
    case 'number': return String(answer.value)
    case 'remainder': return answer.remainder ? `${answer.quotient} R${answer.remainder}` : String(answer.quotient)
    case 'fraction': return `${answer.n}/${answer.d}`
  }
}

/** The numbers a story must keep, as they are written. */
export function operandsOf(spec: MathSpec): string[] {
  switch (spec.kind) {
    case 'multiply': return [String(spec.a), String(spec.b)]
    case 'divide': return [String(spec.dividend), String(spec.divisor)]
    case 'addsub': return [String(spec.a), String(spec.b)]
    case 'word': return [String(spec.a), String(spec.b), String(spec.c)]
    case 'fraction': return spec.form === 'of' ? [fracText(spec.x), String(spec.whole)] : [fracText(spec.x), fracText(spec.y)]
  }
}

/** A stored spec read back from the database: shape-checked, else null. */
export function parseSpec(raw: unknown): MathSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const n = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
  const f = (v: unknown) => !!v && typeof v === 'object' && n((v as Frac).n) && n((v as Frac).d) && (v as Frac).d > 0
  switch (r.kind) {
    case 'multiply': return n(r.a) && n(r.b) ? { kind: 'multiply', a: r.a as number, b: r.b as number } : null
    case 'divide':
      return n(r.dividend) && n(r.divisor) && (r.divisor as number) > 0
        ? { kind: 'divide', dividend: r.dividend as number, divisor: r.divisor as number, remainders: r.remainders === true }
        : null
    case 'addsub':
      return n(r.a) && n(r.b) && (r.op === '+' || r.op === '-') ? { kind: 'addsub', op: r.op, a: r.a as number, b: r.b as number } : null
    case 'word':
      return n(r.a) && n(r.b) && n(r.c) && (r.op1 === '×' || r.op1 === '÷') && (r.op2 === '+' || r.op2 === '-') && (r.b as number) > 0
        ? { kind: 'word', a: r.a as number, op1: r.op1, b: r.b as number, op2: r.op2, c: r.c as number }
        : null
    case 'fraction':
      if (r.form === 'of') return f(r.x) && n(r.whole) ? { kind: 'fraction', form: 'of', x: r.x as Frac, whole: r.whole as number } : null
      return (r.form === 'add' || r.form === 'sub') && f(r.x) && f(r.y)
        ? { kind: 'fraction', form: r.form, x: r.x as Frac, y: r.y as Frac }
        : null
    default: return null
  }
}
