import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FamilyMember } from '@/types/family'
import type { KidMath } from '@/hooks/useKidMath'
import type { MathSpec } from '@/lib/wall/math/mathProblem'
import { attempt, type MathRow } from '@/lib/wall/math/mathProgress'
import { MathStage } from './MathStage'

const confetti = vi.hoisted(() => vi.fn())
vi.mock('canvas-confetti', () => ({ default: confetti }))

beforeAll(() => {
  // jsdom has no 2D canvas; the paper skips drawing without one.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

const member = (id: string, name: string) => ({ id, name, initials: name[0], color: '#0a7' }) as FamilyMember
const ella = member('ella', 'Ella'), kaleb = member('kaleb', 'Kaleb')
const TODAY = '2026-10-20'

let n = 0
function row(memberId: string, spec: MathSpec, over: Partial<MathRow> = {}): MathRow {
  return { id: `r${++n}`, memberId, forDate: TODAY, kind: spec.kind, level: 3, spec, wording: null, status: 'open', tries: 0, solvedAt: null, ...over }
}

/** The stage with a stand-in for useKidMath: same verdicts, no database. */
function Harness({ initial, kids = [ella, kaleb] }: { initial: MathRow[]; kids?: FamilyMember[] }) {
  const [rows, setRows] = useState(initial)
  const [selected, setSelected] = useState(kids[0].id)
  const math: KidMath = {
    kids: kids.map((m) => ({ member: m, today: rows.find((r) => r.memberId === m.id) ?? null, streak: m.id === 'ella' ? 6 : 0 })),
    selectedId: selected,
    select: setSelected,
    check: (memberId, input) => {
      const r = rows.find((x) => x.memberId === memberId)!
      const res = attempt(r, input)
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: res.status, tries: res.tries } : x)))
      return res.verdict
    },
  }
  return <div className="kiosk-canvas is-v1"><MathStage math={math} now={new Date(2026, 9, 20, 16, 0)} /></div>
}

const DIV: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }
const FRAC: MathSpec = { kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 1, d: 4 } }

const pad = () => within(document.querySelector('.km-pad') as HTMLElement)
function enter(digits: string) {
  for (const d of digits) fireEvent.click(pad().getByRole('button', { name: d }))
}
const check = () => fireEvent.click(pad().getByRole('button', { name: 'Check' }))

describe('Math of the day on the wall', () => {
  it('shows the problem, printed on the paper, with a box for the remainder', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    expect(screen.getByText('Work out 742 ÷ 6. Put what’s left over in the R box.')).toBeInTheDocument()
    expect(screen.getByText('3-digit ÷ 1-digit, remainders')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remainder' })).toBeInTheDocument()
    // The divisor and dividend are printed on the grid.
    expect([...document.querySelectorAll('.km-printed .km-cell')].map((c) => c.textContent).join('')).toBe('6742')
    expect(pad().getByRole('button', { name: 'Check' })).toBeDisabled()
  })

  it('a solve celebrates', () => {
    confetti.mockClear()
    render(<Harness initial={[row('ella', DIV)]} />)
    enter('123')
    fireEvent.click(screen.getByRole('button', { name: /^Remainder/ }))
    enter('4')
    check()
    expect(screen.getByText('You got it!')).toBeInTheDocument()
    expect(screen.getByText(/The answer is 123 R4/)).toBeInTheDocument()
    expect(confetti).toHaveBeenCalled()
  })

  it('retries, then hints, then walks through it on the paper', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    enter('120')
    check()
    expect(screen.getByText('Not quite. Check your work and try again.')).toBeInTheDocument()
    // The answer stays in the box after a miss.
    expect(screen.getByRole('button', { name: 'Answer: 120' })).toBeInTheDocument()
    check()
    expect(screen.getByText('Not quite · here’s a hint')).toBeInTheDocument()
    expect(screen.getByText(/How many 6s fit in 7\?/)).toBeInTheDocument()
    check()
    expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument()
    expect(document.querySelector('.km-paper')).toHaveClass('is-revealed')
    expect([...document.querySelectorAll('.km-overlay .km-cell')].map((c) => c.textContent)).toContain('1')
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(screen.getByText(/742 ÷ 6 = 123 R4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled()
  })

  it('takes a fraction as top and bottom, and any equal fraction is right', () => {
    render(<Harness initial={[row('ella', FRAC)]} />)
    expect(document.querySelector('.km-printed .km-cell')).toBeNull()
    enter('1')
    expect(pad().getByRole('button', { name: 'Check' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Bottom' }))
    enter('2')
    check()
    expect(screen.getByText('You got it!')).toBeInTheDocument()
  })

  it('each kid has their own problem, and what they typed waits for them', () => {
    render(<Harness initial={[row('ella', DIV), row('kaleb', { kind: 'multiply', a: 48, b: 7 })]} />)
    enter('12')
    fireEvent.click(screen.getByRole('button', { name: /Kaleb/ }))
    expect(screen.getByText('Work out 48 × 7.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remainder' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ella/ }))
    expect(screen.getByRole('button', { name: 'Answer: 12' })).toBeInTheDocument()
  })

  it('shows each kid’s streak on their button', () => {
    render(<Harness initial={[row('ella', DIV), row('kaleb', DIV)]} />)
    expect(screen.getByLabelText('6 days in a row')).toBeInTheDocument()
  })

  it('uses Claude’s story and box names when there are any', () => {
    render(<Harness initial={[row('ella', DIV, { wording: { story: 'The bakery made 742 cookies and packs them in boxes of 6.', hint: null, labels: ['Full boxes', 'Left over'] } })]} />)
    expect(screen.getByText('The bakery made 742 cookies and packs them in boxes of 6.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Full boxes' })).toBeInTheDocument()
    expect(screen.getByText('Left over')).toBeInTheDocument()
  })
})
