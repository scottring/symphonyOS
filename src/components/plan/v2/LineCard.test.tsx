import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LineCard } from './LineCard'
import type { LineActions } from './PlanLine'
import type { Task } from '@/types/task'

const actions = () => ({ done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() }) as unknown as LineActions

// The season's brainstorm and the year's list in large type (2026-10-04):
// a box to tick, the words, and what the level below wrote for it.
describe('LineCard', () => {
  it('ticks, opens, and lists what was written for it by period', () => {
    const a = actions()
    const t = { id: 's1', title: 'Make a money plan', completed: false, createdAt: new Date() } as Task
    render(<LineCard vm={{ task: t, fate: 'open', partOf: null, where: null }} actions={a} nextLabel="Winter"
      did={[{ label: 'Oct', items: [{ id: 'm', title: 'Make a budget', done: false }] }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Make a money plan' }))
    expect(a.done).toHaveBeenCalledWith(t)
    fireEvent.click(screen.getByRole('button', { name: 'Make a money plan' }))
    expect(a.details).toHaveBeenCalledWith(t)
    expect(screen.getByText('Oct')).toBeInTheDocument()
    expect(screen.getByText('Make a budget')).toBeInTheDocument()
  })

  it('a done line is struck, and its box says so', () => {
    const t = { id: 's2', title: 'Decide about extended break time', completed: true, createdAt: new Date() } as Task
    render(<LineCard vm={{ task: t, fate: 'done', partOf: null, where: null }} actions={actions()} nextLabel="Winter" />)
    expect(screen.getByRole('button', { name: 'Mark Decide about extended break time not done' })).toBeInTheDocument()
  })
})
