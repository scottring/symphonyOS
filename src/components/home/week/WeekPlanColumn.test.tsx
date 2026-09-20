import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekPlanColumn } from './WeekPlanColumn'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import type { Task } from '@/types/task'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 'x', title: over.title ?? 'T', completed: false,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Task
}

const actions: DayPlanPanelActions = {
  choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), schedule: vi.fn(), commit: vi.fn(),
}

const weekStart = new Date(2026, 8, 13)

beforeEach(() => { localStorage.clear() })

describe('WeekPlanColumn', () => {
  // One list: these are the same rows, from the same selector, that the Today
  // pin draws. /week does not keep a second, wider copy of them any more.
  it('shows the week list, including a legacy row with no week of its own', () => {
    render(<WeekPlanColumn
      tasks={[
        task({ id: 'a', title: 'Couples therapist', bucket: 'week', weekStart }),
        task({ id: 'b', title: 'call the guitar shop', bucket: 'week' }),
        task({ id: 'c', title: 'Next week', bucket: 'week', weekStart: new Date(2026, 8, 20) }),
        task({ id: 'd', title: 'A month thing', bucket: 'month' }),
      ]}
      weekStart={weekStart} meId={null} actions={actions} />)
    expect(screen.getByText('Couples therapist')).toBeInTheDocument()
    expect(screen.getByText('call the guitar shop')).toBeInTheDocument()
    expect(screen.queryByText('Next week')).not.toBeInTheDocument()
    expect(screen.queryByText('A month thing')).not.toBeInTheDocument()
  })

  // It replaced the page's own list, so it cannot depend on being switched on
  // — and folding it must never leave the page with nothing to plan from.
  it('opens by default and folds to its own header, remembering the fold', () => {
    // The live current week, so the fold's header reads "This week" — an older
    // week is named for itself (weekListTitle), which is its own test.
    const current = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)
    const tasks = [task({ id: 'a', title: 'Couples therapist', bucket: 'week', weekStart: current })]
    const { unmount } = render(<WeekPlanColumn tasks={tasks} weekStart={current} meId={null} actions={actions} />)
    const header = screen.getByRole('button', { name: /this week/i })
    expect(header).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(header)
    expect(screen.queryByText('Couples therapist')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /this week/i })).toBeInTheDocument()

    unmount()
    render(<WeekPlanColumn tasks={tasks} weekStart={current} meId={null} actions={actions} />)
    expect(screen.getByRole('button', { name: /this week/i })).toHaveAttribute('aria-expanded', 'false')
  })

  // Paging back and being offered "This week" is how you plan into a week that
  // has already gone.
  it('names an older week for itself', () => {
    const old = new Date(2026, 8, 13)
    render(<WeekPlanColumn tasks={[task({ id: 'a', title: 'Old row', bucket: 'week', weekStart: old })]}
      weekStart={old} meId={null} actions={actions} />)
    expect(screen.getByRole('button', { name: /week of sep 13/i })).toBeInTheDocument()
  })

  it('offers only what the planning member could do', () => {
    render(<WeekPlanColumn
      tasks={[
        task({ id: 'a', title: 'Mine', bucket: 'week', weekStart }),
        task({ id: 'b', title: 'Hers alone', bucket: 'week', weekStart, assignedTo: 'her' }),
      ]}
      weekStart={weekStart} meId="me" actions={actions} />)
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Hers alone')).not.toBeInTheDocument()
  })
})
