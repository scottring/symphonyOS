import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgendaStage, AgendaViews } from './AgendaStage'
import type { AgendaDay, AgendaRow } from '@/lib/wall/wallAgenda'
import type { FamilyMember } from '@/types/family'

const members = [{ id: 'sk', name: 'Scott' }] as unknown as FamilyMember[]
const row = (id: string, kind: AgendaRow['kind'], title: string, o: Partial<AgendaRow> = {}): AgendaRow =>
  ({ id, kind, time: '9a', title, sub: null, owners: [], done: false, past: false, checkable: kind !== 'event', on: new Date(2026, 9, 14), ...o })
const today: AgendaDay = {
  key: 't', date: new Date(2026, 9, 14), label: 'Today, Oct 14', isToday: true, allDay: ['Grandma visiting'],
  timed: [row('event-swim', 'event', 'Swim'), row('task-mow', 'task', 'Mow', { owners: ['sk'] })],
  anytime: [row('routine-plants', 'routine', 'Water the plants', { time: null }), row('task-bat', 'task', 'Buy batteries', { time: null, done: true })],
}
const sat: AgendaDay = {
  key: 's', date: new Date(2026, 9, 17), label: 'Saturday, Oct 17', isToday: false, allDay: [], timed: [row('routine-pizza', 'routine', 'Pizza night')],
  anytime: [row('task-gift', 'task', 'Wrap the present', { time: null }), row('task-old', 'task', 'Already wrapped', { time: null, done: true })],
}

function setup(view: 'today' | 'weekend' = 'today') {
  const onSetDone = vi.fn()
  render(<AgendaStage view={view} days={{ today: [today], weekend: [sat] }} members={members} onSetDone={onSetDone} onTapRow={vi.fn()} />)
  return { onSetDone }
}

describe('AgendaStage', () => {
  it('shows all of today, a check on each task and routine, none on an event', () => {
    setup()
    expect(screen.getByText('Grandma visiting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Mow done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Water the plants done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark Swim/ })).toBeNull()
  })

  it('folds done things to one line that opens them, to untick one', () => {
    setup()
    expect(screen.queryByText('Buy batteries')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Done · 1/ }))
    expect(screen.getByRole('button', { name: 'Mark Buy batteries not done' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is two columns; the weekend’s unfinished anytime things sit under today’s', () => {
    setup()
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['On the clock', 'Anytime today'])
    const soon = screen.getByRole('region', { name: 'Anytime today' })
    expect(soon).toHaveTextContent('Anytime · Saturday')
    expect(soon).toHaveTextContent('Wrap the present')
    expect(soon).not.toHaveTextContent('Already wrapped')
    expect(screen.queryByText('Pizza night')).toBeNull()
  })

  it('ticks a row off and back on', () => {
    const { onSetDone } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Mow done' }))
    expect(onSetDone).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task-mow' }), true)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Mow not done' }))
    expect(onSetDone).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task-mow' }), false)
  })

  it('Today · This weekend switch the view', () => {
    const onView = vi.fn()
    render(<AgendaViews view="today" onView={onView} />)
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }))
    expect(onView).toHaveBeenCalledWith('weekend')
  })

  it('weekend view: a routine on Saturday has its check', () => {
    setup('weekend')
    expect(screen.getByRole('region', { name: 'Saturday, Oct 17' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Pizza night done' })).toBeInTheDocument()
  })
})
