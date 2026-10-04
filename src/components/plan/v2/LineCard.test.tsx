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

  // Scott, 2026-10-04: "expanded functionality … such as ability to add
  // freeform notes, assign to individual people".
  it('takes a freeform note in place, saved when you leave the box', () => {
    const a = actions(); const setNotes = vi.fn(); (a as LineActions & { setNotes: unknown }).setNotes = setNotes
    const t = { id: 's3', title: 'Plan winter vacation', completed: false, createdAt: new Date() } as Task
    render(<LineCard vm={{ task: t, fate: 'open', partOf: null, where: null }} actions={a} nextLabel="Winter" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a note to Plan winter vacation' }))
    const box = screen.getByRole('textbox', { name: 'Note for Plan winter vacation' })
    fireEvent.change(box, { target: { value: 'Somewhere warm, after Christmas' } })
    fireEvent.blur(box)
    expect(setNotes).toHaveBeenCalledWith(t, 'Somewhere warm, after Christmas')
  })

  it('shows its note, and a formatted note opens in details rather than being flattened', () => {
    const a = actions(); (a as LineActions & { setNotes: unknown }).setNotes = vi.fn()
    const t = { id: 's4', title: 'Make a money plan', completed: false, createdAt: new Date(), notes: '<p>Talk to <b>Corey</b> first</p>' } as Task
    render(<LineCard vm={{ task: t, fate: 'open', partOf: null, where: null }} actions={a} nextLabel="Winter" />)
    fireEvent.click(screen.getByText('Talk to Corey first'))
    expect(a.details).toHaveBeenCalledWith(t)
  })

  it('says who carries it, and assigns people', () => {
    const t = { id: 's5', title: 'Create kids chore chart', completed: false, createdAt: new Date(), assignedToAll: ['ir'] } as Task
    const members = [{ id: 'sk', name: 'Scott', initials: 'S', color: 'blue' }, { id: 'ir', name: 'Iris', initials: 'I', color: 'purple' }] as never
    render(<LineCard vm={{ task: t, fate: 'open', partOf: null, where: null }} actions={actions()} nextLabel="Winter" members={members} />)
    expect(screen.getByRole('button', { name: 'Assign people to Create kids chore chart. Assigned: Iris' })).toBeInTheDocument()
  })
})
