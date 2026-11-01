import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import type { DayActions } from '@/lib/planning/dayActions'
import { DayPick } from './DayPick'

const actions = (): DayActions => ({
  place: vi.fn(async () => true), done: vi.fn(async () => true),
  undone: vi.fn(async () => true), backToWeek: vi.fn(async () => true), restore: vi.fn(async () => true),
})
const MON = new Date(2026, 10, 2), TUE = new Date(2026, 10, 3)
const helmet = createMockTask({ id: 'h', title: 'Buy Ella a helmet' })
const inv = createMockTask({ id: 'i', title: 'Inventory all documents' })
const call = createMockTask({ id: 'c', title: 'Call the plumber' })
const choice = {
  missed: [{ task: helmet, label: 'Was Saturday' }, { task: call, label: 'Was Sunday' }],
  groups: [{ title: 'November goal · Organize documents', tasks: [inv] }],
  otherDays: [{ task: createMockTask({ id: 'd', title: 'Dentist' }), day: 'Thu' }],
}

describe('DayPick', () => {
  it('shows the count "{n} of 3–5" and this week’s no-day tasks grouped by goal', () => {
    render(<DayPick count={2} isTomorrow={false} target={MON} choice={choice} skip={new Set()} actions={actions()} />)
    expect(screen.getByText('That’s 2 of 3–5.')).toBeInTheDocument()
    expect(screen.getByText('November goal · Organize documents')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'This week, no day yet' })).getByText('Inventory all documents')).toBeInTheDocument()
    expect(screen.getByText('Buy Ella a helmet').closest('li')).toHaveTextContent('Was Saturday')
    expect(screen.getByText(/1 has another day:/).closest('p')).toHaveTextContent('Dentist (Thu)')
  })

  it('leaves out what the look back already shows', () => {
    render(<DayPick count={0} isTomorrow={false} target={MON} choice={choice} skip={new Set(['c'])} actions={actions()} />)
    expect(screen.queryByText('Call the plumber')).toBeNull()
    expect(screen.getByText('Buy Ella a helmet')).toBeInTheDocument()
  })

  it('places a task on the target day; the pick is stamped and can be undone', async () => {
    const a = actions()
    render(<DayPick count={0} isTomorrow target={TUE} choice={choice} skip={new Set()} actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow: Inventory all documents' }))
    await waitFor(() => expect(a.place).toHaveBeenCalledWith(inv, TUE))
    const picked = within(screen.getByRole('region', { name: 'Picked for tomorrow' }))
    expect(picked.getByText('Inventory all documents')).toBeInTheDocument()
    fireEvent.click(picked.getByRole('button', { name: 'Undo: Inventory all documents' }))
    await waitFor(() => expect(a.restore).toHaveBeenCalledWith(inv))
    expect(screen.queryByRole('region', { name: 'Picked for tomorrow' })).toBeNull()
  })

  it('a time is optional: "At a time" places it at that time on the day', async () => {
    const a = actions()
    render(<DayPick count={0} isTomorrow={false} target={MON} choice={choice} skip={new Set()} actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'At a time: Inventory all documents' }))
    fireEvent.change(screen.getByLabelText('Time for Inventory all documents'), { target: { value: '14:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Place Inventory all documents at that time' }))
    await waitFor(() => expect(a.place).toHaveBeenCalledWith(inv, MON, '14:30'))
  })

  it('says so when the week has nothing waiting for a day', () => {
    render(<DayPick count={0} isTomorrow={false} target={MON} choice={{ missed: [], groups: [], otherDays: [] }} skip={new Set()} actions={actions()} />)
    expect(screen.getByText('Nothing on this week is waiting for a day.')).toBeInTheDocument()
  })
})
