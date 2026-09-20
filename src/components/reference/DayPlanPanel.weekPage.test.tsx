import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DayPlanPanel, PLAN_GROUP_CAP, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

afterEach(cleanup)

const actions: DayPlanPanelActions = {
  choose: () => {}, unchoose: () => {}, complete: () => {},
  schedule: () => {}, commit: () => {},
}

function entry(n: number): DayPlanEntry {
  return { key: `task:w${n}`, kind: 'task', id: `w${n}`, title: `Week item ${n}`, completed: false, planned: false, group: 'week' }
}

function plan(weekCount: number): DayPlan {
  return {
    scheduled: [], available: [],
    week: Array.from({ length: weekCount }, (_, i) => entry(i + 1)),
    month: [],
    counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan
}

const day = new Date(2026, 8, 19)
const thisWeek = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)

describe('DayPlanPanel beside a week page', () => {
  // Beside /week the week list IS the work. Closed-by-default and capped at 6
  // made the pin a summary of the thing you came to the page to do.
  it('opens the week group and drops the cap', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByRole('button', { name: /this week/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(`Week item ${n}`)).toBeInTheDocument()
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument()
  })

  it('stays a folded, capped reference beside every other page', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} />)
    expect(screen.getByRole('button', { name: /this week/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(`Week item ${n}`)).not.toBeInTheDocument()
  })

  // Paging back to a week that has gone and being offered "This week" is how
  // you plan into the past without noticing.
  it('names the week when it is not the current one', () => {
    const past = new Date(thisWeek)
    past.setDate(past.getDate() - 7)
    render(<DayPlanPanel plan={plan(2)} day={day} actions={actions} weekPage={past} />)
    expect(screen.getByRole('button', { name: /week of /i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^this week/i })).not.toBeInTheDocument()
  })
})
