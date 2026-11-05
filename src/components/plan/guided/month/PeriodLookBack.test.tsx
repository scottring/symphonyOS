import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { useState } from 'react'
import { PeriodLookBack } from './PeriodLookBack'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

const review = () => ({ mine: null as ReviewNotes | null, reviewed: null, loading: false, finish: vi.fn(async () => true) })
const OPEN = [{ id: 'a', title: 'Fix the gate' }, { id: 'b', title: 'Call the bank' }]
type Props = Parameters<typeof PeriodLookBack>[0]
// The draft lives with the session (GuidedPeriod); here, a stand-in for it.
function WithDraft(p: Omit<Props, 'draft' | 'onDraft'>) {
  const [draft, setDraft] = useState<ReviewNotes | null>(null)
  return <PeriodLookBack {...p} draft={draft} onDraft={setDraft} />
}
const verbs = () => ({ done: vi.fn(async () => true), to: vi.fn(async () => true), someday: vi.fn(async () => true), letGo: vi.fn(async () => true) })
const setup = (over: Partial<Omit<Props, 'draft' | 'onDraft'>> = {}) => {
  const props = { prevLabel: 'October', review: review(), done: 3, outOf: 5, open: OPEN, verbs: verbs(), toLabel: 'To November', ...over }
  render(<WithDraft {...props} />)
  return props
}
const row = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('PeriodLookBack — look back at the period before', () => {
  it('saves the review notes, and says when they are not saved yet', async () => {
    const p = setup()
    expect(screen.getByRole('article', { name: 'Looking back at October' })).toHaveTextContent(/3 done · 2 open/)
    expect(screen.queryByRole('button', { name: 'Save notes' })).toBeNull()
    fireEvent.change(screen.getByLabelText('What went well'), { target: { value: 'Cabin booked, energy good' } })
    expect(p.review.finish).not.toHaveBeenCalled()
    // Leaving the box saves it.
    await act(async () => { fireEvent.blur(screen.getByLabelText('What went well')) })
    expect(p.review.finish).toHaveBeenCalledWith({ wentWell: 'Cabin booked, energy good', didnt: '' })
  })

  // Naming the carry, Someday and Let go (Scott, 2026-11-04): the choice
  // names where it goes; Someday is "not now", Let go "not ever".
  it('each open line: exactly Done, To November, Someday, Let go — each runs its own writer, and nothing goes back up', async () => {
    const p = setup()
    expect(row('Fix the gate').getAllByRole('button').map((b) => b.textContent)).toEqual(['Done', 'To November', 'Someday', 'Let go'])
    expect(screen.queryByText(/Carry|Table|Back to/)).toBeNull()
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'To November: Fix the gate' })) })
    expect(p.verbs.to).toHaveBeenCalledWith(OPEN[0])
    // Saved: the row says what happened in place; Change brings the calls back.
    expect(row('Fix the gate').getByText('To November')).toBeInTheDocument()
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Someday: Call the bank' })) })
    expect(p.verbs.someday).toHaveBeenCalledWith(OPEN[1])
    expect(row('Call the bank').getByText('Moved to Someday')).toBeInTheDocument()
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Change' }))
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Let go: Fix the gate' })) })
    expect(p.verbs.letGo).toHaveBeenCalledWith(OPEN[0])
    expect(row('Fix the gate').getByText('Let go')).toBeInTheDocument()
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Change' }))
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Done: Fix the gate' })) })
    expect(p.verbs.done).toHaveBeenCalledWith(OPEN[0])
  })

  it('Season and Year: the same four, named for their next period', () => {
    setup({ prevLabel: 'Summer', toLabel: 'To Fall' })
    expect(row('Fix the gate').getAllByRole('button').map((b) => b.textContent)).toEqual(['Done', 'To Fall', 'Someday', 'Let go'])
  })

  it('a write that did not save says so on its row', async () => {
    setup({ verbs: { ...verbs(), to: vi.fn(async () => false) } })
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'To November: Fix the gate' })) })
    expect(row('Fix the gate').getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('nothing left open says so', () => {
    setup({ open: [] })
    expect(screen.getByText('Nothing left open from October.')).toBeInTheDocument()
  })

  // Scott, 2026-11-05: the end is in view.
  it('counts what is decided in its heading', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Open from October · 0 of 2 decided' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Someday: Fix the gate' })) })
    expect(screen.getByRole('heading', { name: 'Open from October · 1 of 2 decided' })).toBeInTheDocument()
  })
})
