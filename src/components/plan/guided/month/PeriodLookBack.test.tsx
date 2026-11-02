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
const verbs = () => ({ carry: vi.fn(async () => true), up: vi.fn(async () => true), drop: vi.fn(async () => true), done: vi.fn(async () => true) })
const setup = (over: Partial<Omit<Props, 'draft' | 'onDraft'>> = {}) => {
  const props = { prevLabel: 'October', review: review(), done: 3, outOf: 5, open: OPEN, verbs: verbs(), upLabel: 'Back to Fall', ...over }
  render(<WithDraft {...props} />)
  return props
}
const row = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('PeriodLookBack — look back at the period before', () => {
  it('saves the review notes, and says when they are not saved yet', async () => {
    const p = setup()
    expect(screen.getByRole('article', { name: 'Looking back at October' })).toHaveTextContent(/of 5 done · 2 not done/)
    fireEvent.change(screen.getByLabelText('What went well'), { target: { value: 'Cabin booked, energy good' } })
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save notes' })) })
    expect(p.review.finish).toHaveBeenCalledWith({ wentWell: 'Cabin booked, energy good', didnt: '' })
    expect(screen.queryByText('Not saved yet')).toBeNull()
  })

  it('Month: each open line can be carried, sent back to the season, dropped or marked done — each runs its own writer', async () => {
    const p = setup()
    expect(row('Fix the gate').getAllByRole('button').map((b) => b.textContent)).toEqual(['Carry', 'Back to Fall', 'Drop', 'Done'])
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Carry: Fix the gate' })) })
    expect(p.verbs.carry).toHaveBeenCalledWith(OPEN[0])
    // Saved: the row says what happened in place; Change brings the calls back.
    expect(row('Fix the gate').getByText('Carried forward')).toBeInTheDocument()
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Back to Fall: Call the bank' })) })
    expect(p.verbs.up).toHaveBeenCalledWith(OPEN[1])
    expect(row('Call the bank').getByText('Back to Fall')).toBeInTheDocument()
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Change' }))
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Drop: Fix the gate' })) })
    expect(p.verbs.drop).toHaveBeenCalledWith(OPEN[0])
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Change' }))
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Done: Fix the gate' })) })
    expect(p.verbs.done).toHaveBeenCalledWith(OPEN[0])
  })

  it('Season: Table (to Someday) instead of back up, and Let go, in the season’s own words', async () => {
    const table = vi.fn(async () => true), drop = vi.fn(async () => true)
    setup({ prevLabel: 'Summer', upLabel: undefined, labels: { table: 'Table', drop: 'Let go' }, verbs: { carry: vi.fn(async () => true), table, drop } })
    expect(row('Fix the gate').getAllByRole('button').map((b) => b.textContent)).toEqual(['Carry', 'Table', 'Let go'])
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Table: Fix the gate' })) })
    expect(table).toHaveBeenCalledWith(OPEN[0])
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Let go: Call the bank' })) })
    expect(drop).toHaveBeenCalledWith(OPEN[1])
  })

  it('a write that did not save says so on its row', async () => {
    setup({ verbs: { ...verbs(), carry: vi.fn(async () => false) } })
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Carry: Fix the gate' })) })
    expect(row('Fix the gate').getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('nothing left open says so', () => {
    setup({ open: [] })
    expect(screen.getByText('Nothing left open from October.')).toBeInTheDocument()
  })
})
