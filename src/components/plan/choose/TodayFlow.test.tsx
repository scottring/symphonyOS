import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import { TodayFlow, type TodayActions } from './TodayFlow'
import { LookingBack } from './LookingBack'

const t = (id: string, title: string) => createMockTask({ id, title })
const actions = (): TodayActions => ({
  today: vi.fn(async () => true), undoToday: vi.fn(async () => true), done: vi.fn(async () => true),
  undone: vi.fn(async () => true), tomorrow: vi.fn(async () => true), backToWeek: vi.fn(async () => true),
})

describe('TodayFlow — This week → today', () => {
  it('lists what wasn’t done, then this week’s no-day things by goal; Today stamps the row and puts it on the day', async () => {
    const a = actions()
    const helmet = t('h', 'Buy Ella a helmet'), inv = t('i', 'Inventory all documents')
    render(<TodayFlow mode="plan" dayLabel="Monday" actions={a} goalLabel={() => undefined} onLeave={vi.fn()} onFinish={vi.fn(async () => true)}
      review={{ open: [], done: [] }}
      dayItems={[{ key: 'event-1', time: '9am', title: 'UPM kick-off', kind: 'event' }]}
      choice={{ missed: [{ task: helmet, label: 'Was Sunday' }], groups: [{ title: 'October goal · Organize documents', tasks: [inv] }], otherDays: [{ task: t('d', 'Dentist'), day: 'Thu' }] }} />)
    expect(screen.getByText('This week → today')).toBeTruthy()
    expect(screen.getByText('Buy Ella a helmet').closest('li')).toHaveTextContent('Was Sunday')
    expect(screen.getByText('October goal · Organize documents')).toBeTruthy()
    expect(screen.getByText(/1 has another day:/).closest('p')?.textContent).toContain('Dentist (Thu)')
    fireEvent.click(screen.getByRole('button', { name: 'Today: Inventory all documents' }))
    await waitFor(() => expect(a.today).toHaveBeenCalledWith(inv))
    const day = within(screen.getByRole('complementary', { name: 'Monday, as it stands' }))
    expect(day.getByText('Inventory all documents')).toBeTruthy()
    expect(screen.getByRole('img', { name: /today/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Inventory all documents' }))
    await waitFor(() => expect(a.undoToday).toHaveBeenCalledWith(inv))
  })
})

describe('TodayFlow — Today → tomorrow', () => {
  it('what wasn’t done gets Tomorrow / Back to this week / Done; the win is kept with Done for today', async () => {
    const a = actions()
    const onFinish = vi.fn(async () => true)
    const open = t('c', 'Sign kids up for Coppermine')
    render(<TodayFlow mode="review" dayLabel="Monday" actions={a} goalLabel={() => 'October goal'} onLeave={vi.fn()} onFinish={onFinish}
      choice={{ missed: [], groups: [], otherDays: [] }} dayItems={[]}
      review={{ open: [open], done: [t('k', 'Ask Kaleb about the costume')] }} />)
    expect(screen.getByText('Monday · 1 of 2 done')).toBeTruthy()
    expect(screen.getByText(/Done today:/).closest('p')?.textContent).toContain('Ask Kaleb about the costume')
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.tomorrow).toHaveBeenCalledWith(open))
    fireEvent.change(screen.getByRole('textbox', { name: 'A win today' }), { target: { value: 'Kickoff went well' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done for today' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('Kickoff went well'))
  })
})

describe('LookingBack', () => {
  it('shows the count and two places; moving on saves them, and a failed save says so', async () => {
    const onContinue = vi.fn(async () => false)
    render(<LookingBack kicker="Review September · then plan October" periodWord="September" done={11} outOf={16} notDone={3}
      nextLabel="On to Fall goals → October" onContinue={onContinue} onLeave={vi.fn()} />)
    expect(screen.getByText(/of 16 done · 3 not done/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '11 of 16 done' }).querySelector('span')?.style.width).toBe('68.75%')
    expect(screen.getByText(/The 3 not done come next/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What went well' }), { target: { value: 'Rooms finished' } })
    fireEvent.click(screen.getByRole('button', { name: 'On to Fall goals → October' }))
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith({ wentWell: 'Rooms finished', didnt: '' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn’t save')
  })
})
