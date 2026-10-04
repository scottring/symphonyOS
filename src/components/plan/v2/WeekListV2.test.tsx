import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekListV2 } from './WeekListV2'
import type { Task } from '@/types/task'
import type { LineActions } from './PlanLine'

const task = (x: Partial<Task>): Task => ({ id: 't', title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), ...x }) as Task
const actions = { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions
const base = { title: 'This week', weekStart: new Date(2026, 8, 27), members: [], actions, onContext: vi.fn(), onAdd: vi.fn() }

// Scott, 2026-10-04: lists above the week are for looking, not linking. A
// week row is the week's own work: it names no month line or goal.
describe('WeekListV2 — the week’s own list', () => {
  it('a row that came from a month line is just a row', () => {
    const step = task({ id: 's', title: 'Buy hooks', goalTaskId: 'g', sourceId: 'm' })
    render(<WeekListV2 {...base} lines={[{ task: step, fate: 'open', partOf: null, where: null }]} />)
    expect(screen.getByText('Buy hooks')).toBeInTheDocument()
    expect(screen.queryByText(/Step toward|From “/)).toBeNull()
  })

  it('says what the list is for, and adds from its own row', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<WeekListV2 {...base} onAdd={onAdd} lines={[]} hint="What we mean to get done. Give it a day only if it needs one." />)
    expect(screen.getByText(/What we mean to get done/)).toBeInTheDocument()
    const input = screen.getByLabelText('Add to this week')
    fireEvent.change(input, { target: { value: 'Fix the porch step' } })
    fireEvent.submit(input.closest('form')!)
    expect(onAdd).toHaveBeenCalledWith('Fix the porch step')
  })

  it('done rows sit behind “Show done”, with no count', () => {
    const done = task({ id: 'd', title: 'Toss umbrella', completed: true })
    render(<WeekListV2 {...base} lines={[{ task: done, fate: 'done', partOf: null, where: null }]} />)
    expect(screen.queryByText(/Completed ·/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
    expect(screen.getByText('Toss umbrella')).toBeInTheDocument()
  })

  it('a row written for a month line says so', () => {
    const t = task({ id: 'w', title: 'Book Thanksgiving flights' })
    render(<WeekListV2 {...base} lines={[{ task: t, fate: 'open', partOf: null, where: null }]} forLine={() => ({ id: 'm', title: 'Plan Thanksgiving', month: 'October' })} />)
    expect(screen.getByText('for October: Plan Thanksgiving')).toBeInTheDocument()
  })

  it('a new line can be written for an October line, optionally', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<WeekListV2 {...base} onAdd={onAdd} lines={[]} forOptions={{ month: 'October', lines: [{ id: 'm', title: 'Plan Thanksgiving' }] }} />)
    fireEvent.change(screen.getByLabelText('For an October line'), { target: { value: 'm' } })
    const input = screen.getByLabelText('Add to this week')
    fireEvent.change(input, { target: { value: 'Book flights' } })
    fireEvent.submit(input.closest('form')!)
    expect(onAdd).toHaveBeenCalledWith('Book flights', 'm')
  })

  it('a thing whose day passed undone comes back, asking for another day', () => {
    const t = task({ id: 'p', title: 'Return library books', scheduledFor: new Date(2026, 8, 28), isAllDay: true })
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 1, 9))
    render(<WeekListV2 {...base} lines={[{ task: t, fate: 'open', partOf: null, where: null }]} />)
    vi.useRealTimers()
    expect(screen.getByText('Return library books')).toBeInTheDocument()
    expect(screen.getByText('Monday passed — give it another day?')).toBeInTheDocument()
  })
})
