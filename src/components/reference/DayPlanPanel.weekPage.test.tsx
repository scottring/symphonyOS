import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DayPlanPanel, PLAN_GROUP_CAP, planningSubtitle, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

afterEach(cleanup)

const actions: DayPlanPanelActions = {
  choose: () => {}, unchoose: () => {}, complete: () => {},
  schedule: () => {}, commit: () => {},
}

function entry(n: number, context?: string): DayPlanEntry {
  return { key: `task:w${n}`, kind: 'task', id: `w${n}`, title: `Item ${n}`, completed: false, planned: false, group: 'plan', context }
}

function plan(toPlanCount: number, month: DayPlanEntry[] = []): DayPlan {
  return {
    toPlan: Array.from({ length: toPlanCount }, (_, i) => entry(i + 1)),
    carried: [], scheduled: [], available: [], week: [],
    month,
    counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan
}

const day = new Date(2026, 8, 19)
const thisWeek = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)

// ONE list, "To plan" (Scott, 2026-09-21). Beside /week it IS the work, so
// every row shows; beside a day it is a capped reference. The month plan
// opens on request rather than standing beside the list.
describe('DayPlanPanel — the Planning panel', () => {
  it('beside a week page, shows every row of the one list', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} weekPage={thisWeek} />)
    const list = screen.getByRole('button', { name: /^To plan$/ })
    expect(list).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(`Item ${n}`)).toBeInTheDocument()
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument()
    // No count on the heading — no scoreboard.
    expect(list.textContent).toBe('To plan')
  })

  it('beside a day, stays a capped reference', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} />)
    expect(screen.getByRole('button', { name: /^To plan$/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText(`Item ${n}`)).not.toBeInTheDocument()
    expect(screen.getByText(/\+4 more/)).toBeInTheDocument()
  })

  it('a row carries its context line, never a second category', () => {
    const p = plan(0)
    p.toPlan = [entry(1, 'Originally Saturday'), entry(2, 'Weekly routine'), entry(3)]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Originally Saturday')).toBeInTheDocument()
    expect(screen.getByText('Weekly routine')).toBeInTheDocument()
    expect(screen.queryByText(/Carried over|Available today|Needs a day|Didn.t happen/)).toBeNull()
  })

  it('the month plan opens on request', () => {
    const monthRow: DayPlanEntry = { key: 'task:m', kind: 'task', id: 'm', title: 'Repaint the porch', completed: false, planned: false, group: 'month' }
    render(<DayPlanPanel plan={plan(1, [monthRow])} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByText('Repaint the porch')).not.toBeInTheDocument()
    const browse = screen.getByRole('button', { name: /Browse month plan/ })
    expect(browse).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(browse)
    expect(screen.getByText('Repaint the porch')).toBeInTheDocument()
  })

  it('says what it is planning: the week on screen, or the day', () => {
    expect(planningSubtitle(new Date(2026, 8, 21), new Date(2026, 8, 20))).toBe('Sep 20 – Sep 26')
    expect(planningSubtitle(new Date(2026, 8, 21), null)).toBe('Monday, September 21')
  })
})
