import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DayPlanPanel, PLAN_GROUP_CAP, planningSubtitle, routinePlaceDay, type DayPlanPanelActions } from './DayPlanPanel'
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

  // Scott, 2026-09-21: a routine with no day of its own has no occurrence to
  // choose or tick. "Give it a day" places THIS week's occurrence; changing
  // the repeating schedule is a separate, explicit action.
  it('a routine with no day offers "Give it a day" (this week) and "Change repeating schedule", nothing else', () => {
    const p = plan(0)
    p.toPlan = [{ key: 'routine:v', kind: 'routine', id: 'v', title: 'Vacuum', completed: false, planned: false, group: 'plan',
      routine: { id: 'v', name: 'Vacuum', recurrence_pattern: { type: 'weekly', days: [] } } as never, context: 'Weekly routine · no set day' }]
    const changeRoutineRule = vi.fn()
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, changeRoutineRule }} weekPage={thisWeek} />)
    expect(screen.getByRole('button', { name: 'Give Vacuum a day' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change repeating schedule for Vacuum' }))
    expect(changeRoutineRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'v' }))
    expect(screen.queryByRole('button', { name: 'Plan Vacuum for today' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Complete Vacuum' })).toBeNull()
  })

  it('points at the Expired list for older unfinished work, without listing or counting it', () => {
    const p = plan(1)
    p.olderUnfinished = 3
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByRole('link', { name: /Older unfinished work is in Inbox/ })).toHaveAttribute('href', '/inbox#expired')
    expect(screen.queryByText(/3/)).toBeNull()
  })

  // The occurrence lands in the week on screen: beside a future week the
  // picker opens on that week's first day, not on today.
  it('"Give it a day" opens on the viewed week when today is not in it', () => {
    const today = new Date(2026, 8, 21)
    const current = weekStartAnchor(today, readCadenceConfig().weekStartsOn)
    const next = new Date(current); next.setDate(next.getDate() + 7)
    expect(routinePlaceDay(today, null)).toBe(today)
    expect(routinePlaceDay(today, current)).toBe(today)
    expect(routinePlaceDay(today, next)).toBe(next)
  })

  it('says what it is planning: the week on screen, or the day', () => {
    expect(planningSubtitle(new Date(2026, 8, 21), new Date(2026, 8, 20))).toBe('Sep 20 – Sep 26')
    expect(planningSubtitle(new Date(2026, 8, 21), null)).toBe('Monday, September 21')
  })
})
