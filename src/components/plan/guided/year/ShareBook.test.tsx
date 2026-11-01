import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { ShareBook } from './ShareBook'

const GOALS = [{ id: 'w', title: 'Ship the new site', context: 'work' as const }, { id: 'p', title: 'Learn to sail', context: 'personal' as const }]
const setup = () => {
  const p = { goals: GOALS, seasonWord: 'Spring', onShare: vi.fn(async () => true), onBook: vi.fn(async () => true) }
  render(<ShareBook {...p} />)
  return p
}
const goal = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('ShareBook — share with the family, and book the season session', () => {
  it('lists the Work and Personal year goals, each with its space', () => {
    setup()
    expect(goal('Ship the new site').getByText('Work')).toBeInTheDocument()
    expect(goal('Learn to sail').getByText('Personal')).toBeInTheDocument()
  })

  it('Share with the family asks on the page first, then shares', async () => {
    const p = setup()
    fireEvent.click(goal('Learn to sail').getByRole('button', { name: 'Share with the family: Learn to sail' }))
    expect(p.onShare).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(goal('Learn to sail').getByText(/Everyone in the family will see it/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(goal('Learn to sail').getByRole('button', { name: 'Share it' })) })
    expect(p.onShare).toHaveBeenCalledWith(GOALS[1])
  })

  it('Not now backs out of sharing without a write', () => {
    const p = setup()
    fireEvent.click(goal('Ship the new site').getByRole('button', { name: 'Share with the family: Ship the new site' }))
    fireEvent.click(goal('Ship the new site').getByRole('button', { name: 'Not now' }))
    expect(p.onShare).not.toHaveBeenCalled()
    expect(goal('Ship the new site').getByRole('button', { name: 'Share with the family: Ship the new site' })).toBeInTheDocument()
  })

  it('the season session: the date starts empty; Book it adds “Plan Spring” on the date picked', async () => {
    const p = setup()
    const date = screen.getByLabelText('First season session')
    expect(date).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Book it' })).toBeDisabled()
    expect(screen.getByText(/Plan Spring/)).toBeInTheDocument()
    fireEvent.change(date, { target: { value: '2027-02-27' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Book it' })) })
    const when = p.onBook.mock.calls[0][0] as Date
    expect([when.getFullYear(), when.getMonth(), when.getDate(), when.getHours()]).toEqual([2027, 1, 27, 0])
    expect(screen.getByRole('status')).toHaveTextContent('Booked: Plan Spring, Sat, Feb 27')
  })

  it('says when booking did not save, and keeps the date', async () => {
    const p = setup()
    p.onBook.mockResolvedValueOnce(false)
    fireEvent.change(screen.getByLabelText('First season session'), { target: { value: '2027-02-27' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Book it' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
    expect(screen.getByLabelText('First season session')).toHaveValue('2027-02-27')
  })

  it('with no Work or Personal goals, says so', () => {
    render(<ShareBook goals={[]} seasonWord="Spring" onShare={vi.fn()} onBook={vi.fn()} />)
    expect(screen.getByText('No Work or Personal goals for this year.')).toBeInTheDocument()
  })
})
