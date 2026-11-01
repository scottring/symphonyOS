import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { createMockTask } from '@/test/mocks/factories'
import type { DayActions } from './DayRows'
import { DayLookBack } from './DayLookBack'

const actions = (): DayActions => ({
  place: vi.fn(async () => true), unplace: vi.fn(async () => true), done: vi.fn(async () => true),
  undone: vi.fn(async () => true), backToWeek: vi.fn(async () => true),
})
const SUN = new Date(2026, 10, 1), MON = new Date(2026, 10, 2), TUE = new Date(2026, 10, 3)
const open = createMockTask({ id: 'c', title: 'Sign kids up for Coppermine' })
const done = createMockTask({ id: 'k', title: 'Ask Kaleb about the costume', completed: true })

function Harness({ a, isTomorrow = false, review }: { a: DayActions; isTomorrow?: boolean; review: { mine: { wentWell: string; didnt: string } | null; finish: (n: { wentWell: string; didnt: string }) => Promise<boolean> } }) {
  const [draft, setDraft] = useState<string | null>(null)
  return <DayLookBack isTomorrow={isTomorrow} target={isTomorrow ? TUE : MON} lookBackOn={isTomorrow ? MON : SUN}
    lookBack={{ open: [open], done: [done] }} actions={a} goalLabel={() => 'November goal'}
    review={{ ...review, loading: false }} draft={draft} onDraft={setDraft} />
}

describe('DayLookBack', () => {
  it('in the morning: what yesterday left gets Today / Back to this week / Done, each on the right day', async () => {
    const a = actions()
    render(<Harness a={a} review={{ mine: null, finish: vi.fn(async () => true) }} />)
    expect(screen.getByText('Yesterday · 1 of 2 done')).toBeInTheDocument()
    expect(screen.getByText(/Done yesterday:/).closest('p')).toHaveTextContent('Ask Kaleb about the costume')
    const row = within(screen.getByRole('listitem', { name: 'Sign kids up for Coppermine' }))
    expect(row.getByText('November goal')).toBeInTheDocument()
    expect(row.getAllByRole('button').map((b) => b.textContent)).toEqual(['Today', 'Back to this week', 'Done'])
    fireEvent.click(row.getByRole('button', { name: 'Back to this week: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.backToWeek).toHaveBeenCalledWith(open, SUN))
    // Stamped, with Undo: it goes back on the day it was on.
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.place).toHaveBeenCalledWith(open, SUN))
    fireEvent.click(screen.getByRole('button', { name: 'Today: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.place).toHaveBeenLastCalledWith(open, MON))
  })

  it('in the evening the look back is today and its verb is Tomorrow', async () => {
    const a = actions()
    render(<Harness a={a} isTomorrow review={{ mine: null, finish: vi.fn(async () => true) }} />)
    expect(screen.getByText('Today · 1 of 2 done')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.place).toHaveBeenCalledWith(open, TUE))
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.place).toHaveBeenLastCalledWith(open, MON))
    expect(screen.getByLabelText('A win today')).toBeInTheDocument()
  })

  it('Done marks it done, with Undo; a write that fails says so', async () => {
    const a = actions()
    ;(a.done as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)
    render(<Harness a={a} review={{ mine: null, finish: vi.fn(async () => true) }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Sign kids up for Coppermine' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn’t save')
    fireEvent.click(screen.getByRole('button', { name: 'Done: Sign kids up for Coppermine' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo: Sign kids up for Coppermine' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Sign kids up for Coppermine' }))
    await waitFor(() => expect(a.undone).toHaveBeenCalledWith(open))
  })

  it('the one-line win is kept as the day’s review; typed and not saved, it says so', async () => {
    const finish = vi.fn(async () => true)
    render(<Harness a={actions()} review={{ mine: { wentWell: '', didnt: 'Too much' }, finish }} />)
    fireEvent.change(screen.getByLabelText('A win yesterday'), { target: { value: 'Kickoff went well ' } })
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save the win' }))
    await waitFor(() => expect(finish).toHaveBeenCalledWith({ wentWell: 'Kickoff went well', didnt: 'Too much' }))
    await waitFor(() => expect(screen.queryByText('Not saved yet')).toBeNull())
  })

  it('says so when nothing was left open', () => {
    render(<DayLookBack isTomorrow={false} target={MON} lookBackOn={SUN} lookBack={{ open: [], done: [] }} actions={actions()} goalLabel={() => undefined}
      review={{ mine: null, loading: false, finish: vi.fn(async () => true) }} draft={null} onDraft={vi.fn()} />)
    expect(screen.getByText('Nothing left open from yesterday.')).toBeInTheDocument()
  })
})
