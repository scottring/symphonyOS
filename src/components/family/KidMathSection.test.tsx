import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MathSpec } from '@/lib/wall/math/mathProblem'
import type { MathRow, MathStatus } from '@/lib/wall/math/mathProgress'
import { mathSummary } from '@/lib/wall/math/mathHistory'
import { KidMathSection } from './KidMathSection'

const DIV: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }
let n = 0
const row = (forDate: string, status: MathStatus, tries = 0): MathRow =>
  ({ id: `r${++n}`, memberId: 'ella', forDate, slot: 0, kind: 'divide', level: 3, spec: DIV, wording: null, status, tries, solvedAt: null })

describe('KidMathSection', () => {
  it('shows the streak, the type needing help, the table and recent days', () => {
    const summary = mathSummary([row('2026-10-20', 'solved'), row('2026-10-13', 'revealed', 3), row('2026-10-06', 'solved', 2)], '2026-10-20')
    render(<KidMathSection name="Ella" summary={summary} topics={['space']} loading={false} />)
    expect(screen.getByText('★ 1 day in a row')).toBeInTheDocument()
    expect(screen.getByText(/stories about space/)).toBeInTheDocument()
    expect(screen.getByText(/Long division needs the most help lately/)).toBeInTheDocument()
    expect(screen.getAllByText('Long division: 742 ÷ 6 = 123 R4')).toHaveLength(3)
    expect(screen.getByText('Shown the answer')).toBeInTheDocument()
  })
  it('says where problems come from before there are any', () => {
    render(<KidMathSection name="Kaleb" summary={null} topics={[]} loading={false} />)
    expect(screen.getByText(/Kaleb’s first one appears on the kitchen wall/)).toBeInTheDocument()
  })
})
