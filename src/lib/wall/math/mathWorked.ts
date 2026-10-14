// Worked solutions for Math of the day: the problem as it is printed on the
// grid paper, and the walkthrough a kid sees after three misses, one step at
// a time. Built from the numbers in code, so the walkthrough is always right.
//
// Positions are grid squares (col, row) on the paper; the stage turns them
// into pixels. Long division, multiplication and column + / − are laid out
// the way they are written by hand; fractions and word problems are steps in
// words on a blank sheet.
//
// PURE.

import { answerOf, fracText, gcd, lcm, type Frac, type MathSpec } from './mathProblem'

export type CellTone = 'given' | 'work' | 'carry'

export interface WorkCell {
  col: number
  row: number
  text: string
  tone: CellTone
  /** Design px to shift sideways (the divisor tucks against the bracket). */
  nudge?: number
}

/** A rule drawn under `row`, across `span` squares from `col`. */
export interface WorkBar { col: number; row: number; span: number }

export interface WorkStep {
  say: string
  cells: WorkCell[]
  bars: WorkBar[]
}

export interface Worked {
  /** Printed on the paper from the start. Empty for fractions and word problems. */
  given: WorkCell[]
  givenBars: WorkBar[]
  /** The long-division bracket over these squares. */
  bracket: { col: number; row: number; span: number } | null
  /** Rows the layout uses, top to bottom (the stage sizes squares to fit). */
  rows: number
  steps: WorkStep[]
}

const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands']

const digitsOf = (n: number) => String(n).split('').map(Number)

/** Cells for `text` written right-aligned so its last character sits in `endCol`. */
function rightAligned(text: string, endCol: number, row: number, tone: CellTone): WorkCell[] {
  return text.split('').map((ch, i) => ({ col: endCol - text.length + 1 + i, row, text: ch, tone }))
}

// ─── Long division ───

interface DivStep { i: number; cur: number; q: number; product: number; rem: number }

export function longDivisionSteps(dividend: number, divisor: number): DivStep[] {
  const digits = digitsOf(dividend)
  const steps: DivStep[] = []
  let rem = 0
  let started = false
  digits.forEach((d, i) => {
    const cur = rem * 10 + d
    const q = Math.floor(cur / divisor)
    if (!started && q === 0 && i < digits.length - 1) { rem = cur; return }
    started = true
    const product = q * divisor
    steps.push({ i, cur, q, product, rem: cur - product })
    rem = cur - product
  })
  return steps
}

function workedDivision(spec: Extract<MathSpec, { kind: 'divide' }>): Worked {
  const { dividend, divisor } = spec
  const digits = digitsOf(dividend)
  const dv = String(divisor)
  const col0 = dv.length + 2
  const ROW_Q = 0, ROW_P = 1
  const given: WorkCell[] = [
    ...dv.split('').map((ch, j) => ({ col: col0 - dv.length + j, row: ROW_P, text: ch, tone: 'given' as const, nudge: -12 })),
    ...digits.map((d, j) => ({ col: col0 + j, row: ROW_P, text: String(d), tone: 'given' as const })),
  ]
  const raw = longDivisionSteps(dividend, divisor)
  const quotient = Math.floor(dividend / divisor)
  const remainder = dividend % divisor
  const steps: WorkStep[] = raw.map((s, k) => {
    const end = col0 + s.i
    const row = ROW_P + 1 + k * 2
    const prod = String(s.product)
    const last = k === raw.length - 1
    const cells: WorkCell[] = [
      { col: end, row: ROW_Q, text: String(s.q), tone: 'work' },
      { col: end - prod.length, row, text: '−', tone: 'work' },
      ...rightAligned(prod, end, row, 'work'),
    ]
    const diff = last ? String(s.rem) : String(s.rem * 10 + digits[s.i + 1])
    cells.push(...rightAligned(diff, last ? end : end + 1, row + 1, 'work'))
    if (last && spec.remainders && remainder > 0) {
      cells.push({ col: col0 + digits.length, row: ROW_Q, text: `R${remainder}`, tone: 'work' })
    }

    let say = ''
    if (k === 0 && s.i > 0) say += `${divisor} doesn’t fit in ${digits.slice(0, s.i).join('')}, so start with ${s.cur}. `
    say += `How many ${divisor}s fit in ${s.cur}? ${s.q}. Write ${s.q} on top. ${s.q} × ${divisor} = ${s.product}, and ${s.cur} − ${s.product} = ${s.rem}.`
    if (!last) {
      const next = digits[s.i + 1]
      say += ` Bring down the ${next} to make ${s.rem * 10 + next}.`
    } else if (remainder > 0) {
      say += ` Nothing left to bring down, so ${s.rem} is left over: ${dividend} ÷ ${divisor} = ${quotient} R${remainder}.`
    } else {
      say += ` Nothing left over: ${dividend} ÷ ${divisor} = ${quotient}.`
    }
    return { say, cells, bars: [{ col: end - prod.length, row, span: prod.length + 1 }] }
  })
  return {
    given,
    givenBars: [],
    bracket: { col: col0, row: ROW_P, span: digits.length },
    rows: ROW_P + 1 + raw.length * 2,
    steps,
  }
}

// ─── Multiplication ───

const R_COL = 7

function workedMultiply(spec: Extract<MathSpec, { kind: 'multiply' }>): Worked {
  const { a, b } = spec
  const given: WorkCell[] = [
    ...rightAligned(String(a), R_COL, 1, 'given'),
    ...rightAligned(String(b), R_COL, 2, 'given'),
  ]
  const width = Math.max(String(a).length, String(b).length) + 1
  given.push({ col: R_COL - width + 1, row: 2, text: '×', tone: 'given' })
  const givenBars = [{ col: R_COL - width + 1, row: 2, span: width }]

  if (b < 10) {
    const ad = digitsOf(a).reverse()
    let carry = 0
    const steps: WorkStep[] = ad.map((d, i) => {
      const total = d * b + carry
      const last = i === ad.length - 1
      const col = R_COL - i
      const cells: WorkCell[] = last
        ? rightAligned(String(total), col, 3, 'work')
        : [{ col, row: 3, text: String(total % 10), tone: 'work' }]
      const plus = carry ? ` + the ${carry} you carried = ${total}` : ''
      let say = `${PLACE[i][0].toUpperCase()}${PLACE[i].slice(1)}: ${d} × ${b} = ${d * b}${plus}.`
      if (last) say += ` Write ${total}. So ${a} × ${b} = ${a * b}.`
      else if (total >= 10) {
        say += ` Write the ${total % 10} and carry the ${Math.floor(total / 10)} to the ${PLACE[i + 1]}.`
        cells.push({ col: col - 1, row: 0, text: String(Math.floor(total / 10)), tone: 'carry' })
      } else say += ` Write ${total}.`
      carry = Math.floor(total / 10)
      return { say, cells, bars: [] }
    })
    return { given, givenBars, bracket: null, rows: 4, steps }
  }

  // Two-digit (or more) bottom number: one partial product per digit, then add.
  const bd = digitsOf(b).reverse()
  const partials = bd.map((d, i) => a * d * 10 ** i)
  const steps: WorkStep[] = bd.map((d, i) => {
    const p = partials[i]
    const say = i === 0
      ? `Multiply ${a} by the ${d} in the ones: ${a} × ${d} = ${p}.`
      : `Multiply ${a} by the ${d} in the ${PLACE[i]}: ${a} × ${d * 10 ** i} = ${p}. (Put a 0 in the ones first.)`
    return { say, cells: rightAligned(String(p), R_COL, 3 + i, 'work'), bars: [] }
  })
  const sumRow = 3 + bd.length
  const lastPartialRow = sumRow - 1
  const sumWidth = Math.max(...partials.map((p) => String(p).length), String(a * b).length) + 1
  steps.push({
    say: `Add the rows: ${partials.join(' + ')} = ${a * b}. So ${a} × ${b} = ${a * b}.`,
    cells: [
      { col: R_COL - sumWidth + 1, row: lastPartialRow, text: '+', tone: 'work' },
      ...rightAligned(String(a * b), R_COL, sumRow, 'work'),
    ],
    bars: [{ col: R_COL - sumWidth + 1, row: lastPartialRow, span: sumWidth }],
  })
  return { given, givenBars, bracket: null, rows: sumRow + 1, steps }
}

// ─── Column adding and subtracting ───

function workedAddSub(spec: Extract<MathSpec, { kind: 'addsub' }>): Worked {
  const { a, b, op } = spec
  const width = Math.max(String(a).length, String(b).length) + 1
  const given: WorkCell[] = [
    ...rightAligned(String(a), R_COL, 1, 'given'),
    ...rightAligned(String(b), R_COL, 2, 'given'),
    { col: R_COL - width + 1, row: 2, text: op === '+' ? '+' : '−', tone: 'given' },
  ]
  const givenBars = [{ col: R_COL - width + 1, row: 2, span: width }]
  const ad = digitsOf(a).reverse()
  const bd = digitsOf(b).reverse()
  const result = op === '+' ? a + b : a - b
  const steps: WorkStep[] = []

  if (op === '+') {
    let carry = 0
    for (let i = 0; i < ad.length || i < bd.length; i++) {
      const x = ad[i] ?? 0, y = bd[i] ?? 0
      const total = x + y + carry
      const lastCol = i === Math.max(ad.length, bd.length) - 1
      const col = R_COL - i
      const plus = carry ? ` + the ${carry} you carried` : ''
      const name = `${PLACE[i][0].toUpperCase()}${PLACE[i].slice(1)}`
      const cells: WorkCell[] = lastCol ? rightAligned(String(total), col, 3, 'work') : [{ col, row: 3, text: String(total % 10), tone: 'work' }]
      let say = `${name}: ${x} + ${y}${plus} = ${total}.`
      if (lastCol) say += ` Write ${total}. So ${a} + ${b} = ${result}.`
      else if (total >= 10) {
        say += ` Write the ${total % 10} and carry the 1 to the ${PLACE[i + 1]}.`
        cells.push({ col: col - 1, row: 0, text: '1', tone: 'carry' })
      } else say += ` Write ${total}.`
      carry = total >= 10 ? 1 : 0
      steps.push({ say, cells, bars: [] })
    }
  } else {
    // Borrowing, column by column; a column the borrow passed through shows its new top digit.
    const top = [...ad]
    for (let i = 0; i < ad.length; i++) {
      const y = bd[i] ?? 0
      const col = R_COL - i
      const name = `${PLACE[i][0].toUpperCase()}${PLACE[i].slice(1)}`
      const cells: WorkCell[] = []
      let say = ''
      const changed = top[i] !== ad[i]
      if (changed) say += `The ${ad[i]} is now ${top[i]} after the borrow. `
      if (top[i] < y) {
        // Find the next column with something to lend; zeros in between become 9.
        let j = i + 1
        while (top[j] === 0) j++
        top[j] -= 1
        cells.push({ col: R_COL - j, row: 0, text: String(top[j]), tone: 'carry' })
        for (let k = i + 1; k < j; k++) {
          top[k] = 9
          cells.push({ col: R_COL - k, row: 0, text: '9', tone: 'carry' })
        }
        const lender = PLACE[j]
        const through = j > i + 1 ? ` (the 0s on the way become 9s)` : ''
        top[i] += 10
        cells.push({ col, row: 0, text: String(top[i]), tone: 'carry' })
        say += `${name}: ${top[i] - 10} − ${y} doesn’t work, so borrow from the ${lender}${through}. ${top[i]} − ${y} = ${top[i] - y}.`
      } else {
        say += `${name}: ${top[i]} − ${y} = ${top[i] - y}.`
      }
      const lastCol = i === ad.length - 1
      const digit = top[i] - y
      // Leading zeros aren't written (2,004 − 1,987 = 17, not 0017).
      if (i < String(result).length) cells.push({ col, row: 3, text: String(digit), tone: 'work' })
      if (lastCol) say += ` So ${a} − ${b} = ${result}.`
      steps.push({ say, cells, bars: [] })
    }
  }
  return { given, givenBars, bracket: null, rows: 4, steps }
}

// ─── Fractions, in words ───

function simplestNote(n: number, d: number): string {
  const g = gcd(n, d)
  if (g === 1 || n === 0) return ''
  return ` That’s the same as ${n / g}/${d / g}.`
}

function workedFraction(spec: Extract<MathSpec, { kind: 'fraction' }>): Worked {
  const steps: WorkStep[] = []
  const say = (s: string) => steps.push({ say: s, cells: [], bars: [] })
  if (spec.form === 'of') {
    const { x, whole } = spec
    const group = whole / x.d
    say(`The bottom number says how many equal groups: split ${whole} into ${x.d} groups. ${whole} ÷ ${x.d} = ${group} in each.`)
    say(`The top number says how many groups to take: ${x.n} × ${group} = ${x.n * group}. So ${fracText(x)} of ${whole} is ${x.n * group}.`)
  } else {
    const { x, y } = spec
    const word = spec.form === 'add' ? 'add' : 'take away'
    const sign = spec.form === 'add' ? '+' : '−'
    const ans = answerOf(spec)
    if (ans.type !== 'fraction') return { given: [], givenBars: [], bracket: null, rows: 0, steps }
    if (x.d === y.d) {
      say(`The bottoms are the same, so the pieces are the same size. Keep the bottom: ${x.d}.`)
      say(`Now ${word} the tops: ${x.n} ${sign} ${y.n} = ${ans.n}. So the answer is ${ans.n}/${ans.d}.${simplestNote(ans.n, ans.d)}`)
    } else {
      const d = lcm(x.d, y.d)
      const ex: Frac = { n: x.n * (d / x.d), d }
      const ey: Frac = { n: y.n * (d / y.d), d }
      const parts = [x.d !== d ? `${fracText(x)} = ${fracText(ex)}` : null, y.d !== d ? `${fracText(y)} = ${fracText(ey)}` : null].filter(Boolean).join(' and ')
      say(`The bottoms are different, so make them match. Both ${x.d} and ${y.d} go into ${d}.`)
      say(`Change to ${d}ths: ${parts}.`)
      say(`Now ${word} the tops: ${ex.n} ${sign} ${ey.n} = ${ans.n}. So the answer is ${ans.n}/${ans.d}.${simplestNote(ans.n, ans.d)}`)
    }
  }
  return { given: [], givenBars: [], bracket: null, rows: 0, steps }
}

function workedWord(spec: Extract<MathSpec, { kind: 'word' }>): Worked {
  const first = spec.op1 === '×' ? spec.a * spec.b : spec.a / spec.b
  const ans = spec.op2 === '+' ? first + spec.c : first - spec.c
  const steps: WorkStep[] = [
    { say: `Two steps. First: ${spec.a} ${spec.op1} ${spec.b} = ${first}.`, cells: [], bars: [] },
    { say: `Then: ${first} ${spec.op2 === '+' ? '+' : '−'} ${spec.c} = ${ans}. The answer is ${ans}.`, cells: [], bars: [] },
  ]
  return { given: [], givenBars: [], bracket: null, rows: 0, steps }
}

export function workedSolution(spec: MathSpec): Worked {
  switch (spec.kind) {
    case 'divide': return workedDivision(spec)
    case 'multiply': return workedMultiply(spec)
    case 'addsub': return workedAddSub(spec)
    case 'fraction': return workedFraction(spec)
    case 'word': return workedWord(spec)
  }
}

// ─── Sizing the paper ───

/** Empty squares above the problem: room to write over the top row by finger
 *  (Scott, 2026-10-14: "a little more space at the top"). */
export const TOP_ROOM = 1.5
/** Squares are as big as the problem allows, between these (design px). */
export const MIN_CELL = 48
export const MAX_CELL = 104
/** A blank sheet (fractions, word problems): big squares for big writing. */
export const BLANK_CELL = 96

export interface PaperGeometry {
  /** One grid square, in design px. */
  cell: number
  /** Where square (0, 0) starts, in design px from the paper's top left. */
  offX: number
  offY: number
}

/** How big the squares can be on a paper `width` × `height` (design px) so the
 *  whole worked solution fits under the room at the top, with half a square
 *  to spare at the right and the bottom. */
export function paperGeometry(w: Worked, width: number, height: number): PaperGeometry {
  if (w.rows === 0) return { cell: BLANK_CELL, offX: 0, offY: 0 }
  const cells = [...w.given, ...w.steps.flatMap((s) => s.cells)]
  const lastCol = Math.max(
    0,
    ...cells.map((c) => c.col + (c.text.length > 1 ? 1 : 0)),
    ...[...w.givenBars, ...w.steps.flatMap((s) => s.bars)].map((b) => b.col + b.span - 1),
    w.bracket ? w.bracket.col + w.bracket.span - 1 : 0,
  )
  const fit = Math.min(width / (lastCol + 1.5), height / (w.rows + TOP_ROOM + 0.5))
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(fit)))
  return { cell, offX: 0, offY: Math.round(TOP_ROOM * cell) }
}

/** Everything written on the paper through step `step` (-1 = none): where a
 *  square was written twice (a borrowed-from digit borrowed again), the later
 *  one shows. */
export function cellsThrough(w: Worked, step: number): { cells: WorkCell[]; bars: WorkBar[] } {
  const byPos = new Map<string, WorkCell>()
  const bars: WorkBar[] = []
  w.steps.slice(0, step + 1).forEach((s) => {
    s.cells.forEach((c) => byPos.set(`${c.col}:${c.row}`, c))
    bars.push(...s.bars)
  })
  return { cells: [...byPos.values()], bars }
}

/** The first-step hint shown after two misses (Claude may reword it). */
export function defaultHint(spec: MathSpec): string {
  switch (spec.kind) {
    case 'divide': {
      const s = longDivisionSteps(spec.dividend, spec.divisor)[0]
      const lead = s.i > 0 ? `${spec.divisor} doesn’t fit in the first digit, so start with ${s.cur}. ` : `Start with the ${s.cur}. `
      return `${lead}How many ${spec.divisor}s fit in ${s.cur}? Write that on top, take it away, then bring down the next digit.`
    }
    case 'multiply':
      return spec.b < 10
        ? `Start with the ones: ${spec.a % 10} × ${spec.b}. Write the ones digit and carry the rest to the tens.`
        : `Do it in two rows: first ${spec.a} × ${spec.b % 10}, then ${spec.a} × ${spec.b - (spec.b % 10)}. Then add the rows.`
    case 'addsub':
      return spec.op === '+'
        ? `Start with the ones: ${spec.a % 10} + ${spec.b % 10}. If it’s 10 or more, carry the 1 to the tens.`
        : `Start with the ones: ${spec.a % 10} − ${spec.b % 10}. If the top is smaller, borrow from the next column.`
    case 'fraction':
      if (spec.form === 'of') return `Split ${spec.whole} into ${spec.x.d} equal groups first. How many are in each group?`
      return spec.x.d === spec.y.d
        ? `The bottoms match, so keep the bottom and just ${spec.form === 'add' ? 'add' : 'subtract'} the tops.`
        : `Make the bottoms match first. What number do ${spec.x.d} and ${spec.y.d} both go into?`
    case 'word':
      return `This one has two steps. Start with ${spec.a} ${spec.op1} ${spec.b}.`
  }
}
