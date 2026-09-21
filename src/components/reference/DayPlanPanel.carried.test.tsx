import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DayPlanPanel, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'

afterEach(cleanup)

const actions: DayPlanPanelActions = {
  choose: () => {}, unchoose: () => {}, complete: () => {},
  schedule: () => {}, commit: () => {},
}

function carried(n: number): DayPlanEntry {
  return { key: `task:c${n}`, kind: 'task', id: `c${n}`, title: `Left behind ${n}`, completed: false, planned: false, group: 'carried' }
}

const plan = {
  carried: [carried(1), carried(2), carried(3)], scheduled: [], available: [], week: [], month: [],
  counts: { scheduled: 0, available: 0 },
} as unknown as DayPlan

// Yesterday's unfinished work lives here, beside the other things you might
// choose (Scott, 2026-09-21). Findable, open by default, never scored.
describe('DayPlanPanel — Carried over', () => {
  it('lists the rows, open, with no count on the heading', () => {
    render(<DayPlanPanel plan={plan} day={new Date(2026, 8, 21)} actions={actions} />)
    const heading = screen.getByRole('button', { name: /carried over/i })
    expect(heading).toHaveAttribute('aria-expanded', 'true')
    expect(heading.textContent).toBe('Carried over')
    expect(screen.getByText('Left behind 3')).toBeInTheDocument()
  })
})
