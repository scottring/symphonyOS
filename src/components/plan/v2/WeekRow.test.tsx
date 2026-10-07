import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekRow } from './WeekRow'

const inDnd = (ui: React.ReactElement) => render(<DndContext><ul>{ui}</ul></DndContext>)

// Scott, 2026-10-03: one row style, and "if it can go somewhere else, it drags".
describe('WeekRow', () => {
  it('a calendar event wears a calendar mark, not a check, and has no grip — it does not move', () => {
    inDnd(<WeekRow mark="event" title="Boxing" lane="9a" onOpen={vi.fn()} drag={null} />)
    const row = screen.getByRole('listitem')
    expect(row.dataset.mark).toBe('event')
    expect(row.dataset.movable).toBe('false')
    expect(row.querySelector('.wk-grip')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Done:/ })).toBeNull()
    expect(row.querySelector('.sym-tile.is-event')).not.toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Done: Yard weeding' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yard weeding' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  // Scott, 2026-10-04: a ↻ on every routine row was noise; a routine is
  // something to do, like a task.
  // Scott, 2026-10-04: "make sure the different types of items - routines,
  // tasks, events - are clearly differentiated".
  // The card language (2026-10-07, design B): a task's and a routine's icon
  // tile is its check; an event's tile is a mark that is never a control.
  it('a task and a routine finish from their icon tile; an event has none', () => {
    const task = vi.fn(); const routine = vi.fn(); const event = vi.fn()
    inDnd(<>
      <WeekRow mark="routine" title="Yard weeding" onOpen={vi.fn()} onToggle={routine} drag={null} />
      <WeekRow mark="task" title="Call the plumber" onOpen={vi.fn()} onToggle={task} drag={null} />
      <WeekRow mark="event" title="Jury duty" onOpen={vi.fn()} onToggle={event} drag={null} />
    </>)
    const tile = screen.getByRole('button', { name: 'Done: Call the plumber' })
    expect(tile.className).toMatch(/sym-tile-row/)
    fireEvent.click(tile)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Yard weeding' }))
    expect(task).toHaveBeenCalledTimes(1)
    expect(routine).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Jury duty/ })).not.toHaveAttribute('aria-pressed')
    expect(screen.queryByRole('button', { name: 'Done: Jury duty' })).toBeNull()
  })

  it('draws the time above the title, and the people on the row’s right', () => {
    const people = [{ id: 'el', name: 'Ella', initials: 'EL', color: 'green' }, { id: 'ka', name: 'Kaleb', initials: 'KA', color: 'orange' }] as never
    inDnd(<WeekRow mark="task" title="Homework time" lane="4:15p" people={people} onOpen={vi.fn()} onToggle={vi.fn()} drag={null} dense />)
    const row = screen.getByRole('listitem')
    expect(row.querySelector('.wk-body .wk-time')).toHaveTextContent('4:15p')
    expect(row.querySelector('.wk-lane')).toBeNull()
    const slot = row.querySelector('.wk-people')!
    expect(slot.parentElement).toBe(row)
    expect(slot).toHaveAttribute('aria-label', 'Ella, Kaleb')
  })

  // Scott, 2026-10-04: "should we be able to mark items in the month list on
  // the week page as completed?" — by hand, yes.
  it('a month line given a toggle can be ticked done', () => {
    const onToggle = vi.fn()
    inDnd(<WeekRow mark="line" title="Toss umbrella" onOpen={vi.fn()} onToggle={onToggle} drag={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Toss umbrella' }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('a month line and a goal draw their own marks and no check', () => {
    inDnd(<><WeekRow mark="line" title="fix up the porch" onOpen={vi.fn()} drag={null} /><WeekRow mark="goal" title="Plan sabbatical" onOpen={vi.fn()} drag={null} /></>)
    const [line, goal] = screen.getAllByRole('listitem')
    expect(line.dataset.mark).toBe('line')
    expect(goal.dataset.mark).toBe('goal')
    expect(screen.queryByRole('button', { name: /Complete|^Done:/ })).toBeNull()
  })

  it('a done row reads as done', () => {
    inDnd(<WeekRow mark="task" title="Dentist" completed onOpen={vi.fn()} onToggle={vi.fn()} drag={null} />)
    const tile = screen.getByRole('button', { name: 'Mark not done: Dentist' })
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(tile.className).toMatch(/is-done/)
    expect(screen.getByRole('listitem').dataset.done).toBe('true')
  })
})
