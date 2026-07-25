// src/components/planning/horizon/GoalLedger.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoalLedger } from './GoalLedger'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'

const areas = [{ id: 'a1', name: 'Home' }]

const goals = [
  { id: 'g1', name: 'Every room set up', areaId: 'a1', status: 'active' },
  { id: 'g2', name: 'Untouched goal', areaId: 'a1', status: 'active' },
] as unknown as Goal[]

const tasks = [
  { id: 'p1', goalId: 'g1', bucket: 'quarter', pickedAt: new Date('2026-07-24'), completed: false },
  { id: 'm1', goalId: 'g1', bucket: 'month', completed: false },
  { id: 'm2', goalId: 'g1', bucket: 'month', completed: false },
] as unknown as Task[]

const props = { goals, areas, tasks, domainTasks: tasks }

describe('GoalLedger', () => {
  it('groups goals under their area', () => {
    render(<GoalLedger {...props} onOpenGoal={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Every room set up')).toBeInTheDocument()
  })

  it('counts picks and moves for a worked goal', () => {
    render(<GoalLedger {...props} onOpenGoal={vi.fn()} />)
    const row = screen.getByTestId('ledger-row-g1')
    expect(row).toHaveTextContent('1')
    expect(row).toHaveTextContent('2')
  })

  it('flags the stall when moves exist but none has a week', () => {
    render(<GoalLedger {...props} onOpenGoal={vi.fn()} />)
    expect(screen.getByTestId('ledger-row-g1').querySelector('[data-stall="true"]')).toBeTruthy()
  })

  it('does not flag a stall once a move has a week', () => {
    const placed = [
      ...tasks,
      { id: 'm3', goalId: 'g1', bucket: 'week', weekStart: new Date('2026-07-19'), completed: false },
    ] as unknown as Task[]
    render(<GoalLedger {...props} tasks={placed} domainTasks={placed} onOpenGoal={vi.fn()} />)
    expect(screen.getByTestId('ledger-row-g1').querySelector('[data-stall="true"]')).toBeNull()
  })

  it('dims a goal with nothing under it rather than hiding it', () => {
    render(<GoalLedger {...props} onOpenGoal={vi.fn()} />)
    const row = screen.getByTestId('ledger-row-g2')
    expect(row).toBeInTheDocument()
    expect(row.getAttribute('data-untouched')).toBe('true')
  })

  it('names the stall in a summary line', () => {
    render(<GoalLedger {...props} onOpenGoal={vi.fn()} />)
    expect(screen.getByText(/None has a week/)).toBeInTheDocument()
  })

  it('opens a goal when its row is clicked', async () => {
    const onOpenGoal = vi.fn()
    render(<GoalLedger {...props} onOpenGoal={onOpenGoal} />)
    await userEvent.click(screen.getByText('Every room set up'))
    expect(onOpenGoal).toHaveBeenCalledWith('g1')
  })
})
