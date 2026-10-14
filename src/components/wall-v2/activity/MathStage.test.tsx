import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FamilyMember } from '@/types/family'
import type { MathSpec } from '@/lib/wall/math/mathProblem'
import type { MathRow } from '@/lib/wall/math/mathProgress'
import { MathStage } from './MathStage'
import { useLocalKidMath } from './useLocalKidMath'

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
  return { id: `r${++n}`, memberId, forDate: TODAY, slot: 0, kind: spec.kind, level: 3, spec, wording: null, status: 'open', tries: 0, solvedAt: null, ...over }
}
/** Ella solved six school days in a row before today. */
const ellaStreak = ['2026-10-19', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12']
  .map((d) => row('ella', { kind: 'multiply', a: 48, b: 7 }, { forDate: d, status: 'solved' }))

/** The stage on the in-memory stand-in for useKidMath: same rules, no database. */
function Harness({ initial, topics, flash }: { initial: MathRow[]; topics?: Record<string, string[]>; flash?: (m: string) => void }) {
  const math = useLocalKidMath([ella, kaleb], initial, TODAY, topics)
  return <div className="kiosk-canvas is-v1"><MathStage math={math} now={new Date(2026, 9, 20, 16, 0)} flash={flash} /></div>
}

const DIV: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }
const FRAC: MathSpec = { kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 1, d: 4 } }

const pad = () => within(document.querySelector('.km-pad') as HTMLElement)
function enter(digits: string) {
  for (const d of digits) fireEvent.click(pad().getByRole('button', { name: d }))
}
const check = () => fireEvent.click(pad().getByRole('button', { name: 'Check' }))
function solveDiv() {
  enter('123')
  fireEvent.click(screen.getByRole('button', { name: /^Remainder/ }))
  enter('4')
  check()
}
function hold(name: RegExp) {
  vi.useFakeTimers()
  const b = screen.getByRole('button', { name })
  fireEvent.pointerDown(b)
  act(() => { vi.advanceTimersByTime(800) })
  vi.useRealTimers()
}

describe('Math of the day on the wall', () => {
  it('shows the problem, printed on the paper, with a box for the remainder', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    expect(screen.getByText('Work out 742 ÷ 6. Put what’s left over in the R box.')).toBeInTheDocument()
    expect(screen.getByText('3-digit ÷ 1-digit, remainders')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remainder' })).toBeInTheDocument()
    expect([...document.querySelectorAll('.km-printed .km-cell')].map((c) => c.textContent).join('')).toBe('6742')
    expect(pad().getByRole('button', { name: 'Check' })).toBeDisabled()
  })

  it('a solve celebrates and counts the day', () => {
    confetti.mockClear()
    render(<Harness initial={[row('ella', DIV), ...ellaStreak]} />)
    solveDiv()
    expect(screen.getByText('You got it!')).toBeInTheDocument()
    expect(screen.getByText(/The answer is 123 R4/)).toBeInTheDocument()
    expect(screen.getByText('★ 7 days in a row')).toBeInTheDocument()
    expect(confetti).toHaveBeenCalled()
  })

  it('retries, then hints, then walks through it on the paper', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    enter('120')
    check()
    expect(screen.getByText('Not quite. Check your work and try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Answer: 120' })).toBeInTheDocument()
    check()
    expect(screen.getByText('Not quite · here’s a hint')).toBeInTheDocument()
    expect(screen.getByText(/How many 6s fit in 7\?/)).toBeInTheDocument()
    check()
    expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument()
    expect(document.querySelector('.km-paper')).toHaveClass('is-revealed')
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

  it('uses Claude’s story and box names when there are any', () => {
    render(<Harness initial={[row('ella', DIV, { wording: { story: 'The bakery made 742 cookies and packs them in boxes of 6.', hint: null, labels: ['Full boxes', 'Left over'] } })]} />)
    expect(screen.getByText('The bakery made 742 cookies and packs them in boxes of 6.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Full boxes' })).toBeInTheDocument()
  })
})

describe('bonus problems', () => {
  it('after a solve, “Want another?” gives a harder one of the same type, up to three', async () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    solveDiv()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Want another\?/ })) })
    expect(screen.getByText(/Bonus 1 of 3 · Long division/)).toBeInTheDocument()
    expect(screen.getByText('4-digit ÷ 1-digit, remainders')).toBeInTheDocument()
    // The daily problem's streak doesn't move for a bonus.
    expect(screen.getByRole('button', { name: /Ella/ })).toHaveTextContent('Bonus 1')
  })
})

describe('topics', () => {
  it('a kid picks up to three, by tapping', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    // Picked after a solve: they're for the next stories.
    solveDiv()
    fireEvent.click(screen.getByRole('button', { name: 'What should your stories be about?' }))
    for (const t of ['Dinosaurs', 'Space', 'Soccer', 'Art']) fireEvent.click(screen.getByRole('button', { name: t }))
    // A fourth replaces the oldest.
    expect(screen.getByRole('button', { name: 'Dinosaurs' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Picked: Space, Soccer, Art')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Next stories: space, soccer, art' })).toBeInTheDocument()
  })
})

describe('the Grown-ups corner', () => {
  it('opens only on a press and hold', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Grown-ups/ }))
    fireEvent.pointerUp(screen.getByRole('button', { name: /Grown-ups/ }))
    expect(screen.queryByText('Start practice')).toBeNull()
    hold(/Grown-ups/)
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeInTheDocument()
  })

  it('practice: any type and level, “Show me how”, nothing saved', () => {
    render(<Harness initial={[row('ella', DIV)]} />)
    hold(/Grown-ups/)
    fireEvent.click(screen.getByRole('button', { name: 'Multiplication' }))
    fireEvent.click(screen.getByRole('button', { name: 'Harder' }))
    expect(screen.getByText('2-digit × 2-digit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))
    expect(screen.getByText(/Practice · Multiplication/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show me how' }))
    expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    // Ella's real problem is untouched.
    expect(screen.getByRole('button', { name: /Ella/ })).toHaveTextContent('Not started')
  })

  it('reset gives a kid today’s problem back, after a second tap', async () => {
    const flash = vi.fn()
    render(<Harness initial={[row('ella', DIV, { status: 'solved', tries: 1 }), row('ella', DIV, { slot: 1, status: 'open' })]} flash={flash} />)
    hold(/Grown-ups/)
    expect(screen.getByText('Solved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset Ella’s' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tap again to reset' })) })
    expect(flash).toHaveBeenCalledWith('Ella’s problem is back to the start')
    expect(screen.getByText('Not started')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText(/Bonus 1 of 3/)).toBeNull()
    expect(pad().getByRole('button', { name: 'Check' })).toBeInTheDocument()
  })
})
