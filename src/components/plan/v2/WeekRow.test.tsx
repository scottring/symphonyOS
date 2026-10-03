import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekRow } from './WeekRow'

const inDnd = (ui: React.ReactElement) => render(<DndContext><ul>{ui}</ul></DndContext>)

// Scott, 2026-10-03: one row style, and "if it can go somewhere else, it drags".
describe('WeekRow', () => {
  it('a calendar event is a dash with no grip — it does not move', () => {
    inDnd(<WeekRow mark="event" title="Boxing" lane="9a" onOpen={vi.fn()} drag={null} />)
    const row = screen.getByRole('listitem')
    expect(row.dataset.mark).toBe('event')
    expect(row.dataset.movable).toBe('false')
    expect(row.querySelector('.wk-grip')).toBeNull()
    expect(screen.queryByRole('button', { name: /Complete/ })).toBeNull()
  })

  it('a movable task carries the drag and shows a grip', () => {
    inDnd(<WeekRow mark="task" title="Dentist" onOpen={vi.fn()} onToggle={vi.fn()} drag={{ id: 'journal:t1', data: { kind: 'chip', taskId: 't1' } }} />)
    const row = screen.getByRole('listitem')
    expect(row.dataset.movable).toBe('true')
    expect(row.querySelector('.wk-grip')).not.toBeNull()
  })

  it('ticking completes it, and opening opens it', () => {
    const onToggle = vi.fn(); const onOpen = vi.fn()
    inDnd(<WeekRow mark="routine" title="Yard weeding" onOpen={onOpen} onToggle={onToggle} drag={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Yard weeding' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yard weeding' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('a routine says so beside its title', () => {
    inDnd(<WeekRow mark="routine" title="Yard weeding" onOpen={vi.fn()} onToggle={vi.fn()} drag={null} />)
    expect(screen.getByLabelText('repeats')).toBeInTheDocument()
  })

  it('a month line and a goal draw their own marks and no check', () => {
    inDnd(<><WeekRow mark="line" title="fix up the porch" onOpen={vi.fn()} drag={null} /><WeekRow mark="goal" title="Plan sabbatical" onOpen={vi.fn()} drag={null} /></>)
    const [line, goal] = screen.getAllByRole('listitem')
    expect(line.dataset.mark).toBe('line')
    expect(goal.dataset.mark).toBe('goal')
    expect(screen.queryByRole('button', { name: /Complete/ })).toBeNull()
  })

  it('a done row reads as done', () => {
    inDnd(<WeekRow mark="task" title="Dentist" completed onOpen={vi.fn()} onToggle={vi.fn()} drag={null} />)
    expect(screen.getByRole('button', { name: 'Mark Dentist not done' })).toBeInTheDocument()
    expect(screen.getByRole('listitem').dataset.done).toBe('true')
  })
})
