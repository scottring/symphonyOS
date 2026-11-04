import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { useState } from 'react'
import { WeekLookBack, type LooseEnd } from './WeekLookBack'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

const end = (title: string, over: Partial<LooseEnd> = {}): LooseEnd => ({
  key: title, title, note: 'Carried 1 week',
  done: vi.fn(async () => true), nextWeek: vi.fn(async () => true), someday: vi.fn(async () => true), letGo: vi.fn(async () => true),
  ...over,
})
const review = () => ({ mine: null as ReviewNotes | null, reviewed: null, loading: false, finish: vi.fn(async () => true) })
type Props = Parameters<typeof WeekLookBack>[0]
// The draft lives with the session (WeekSession); here, a stand-in for it.
function WithDraft(p: Omit<Props, 'draft' | 'onDraft'>) {
  const [draft, setDraft] = useState<ReviewNotes | null>(null)
  return <WeekLookBack {...p} draft={draft} onDraft={setDraft} />
}
const setup = (over: Partial<Omit<Props, 'draft' | 'onDraft'>> = {}) => {
  const props = { review: review(), done: 3, outOf: 5, notDone: 2, looseEnds: [end('Fix the gate'), end('Call the bank')], aged: 0, onSeeAged: vi.fn(), ...over }
  const r = render(<WithDraft {...props} />)
  return { ...props, rerender: (looseEnds: LooseEnd[]) => r.rerender(<WithDraft {...props} looseEnds={looseEnds} />) }
}
const row = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('WeekLookBack — step 1, look back at last week', () => {
  it('saving the two notes records last week’s review', async () => {
    const p = setup()
    expect(screen.getByText(/of 5 done · 2 not done/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What went well'), { target: { value: 'Shipped the deck' } })
    fireEvent.change(screen.getByLabelText('What didn’t'), { target: { value: 'Too many evenings out' } })
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save notes' })) })
    expect(p.review.finish).toHaveBeenCalledWith({ wentWell: 'Shipped the deck', didnt: 'Too many evenings out' })
    expect(screen.getByText('Saved.')).toBeInTheDocument()
    expect(screen.queryByText('Not saved yet')).toBeNull()
  })

  it('opens on what was already said', () => {
    setup({ review: { ...review(), mine: { wentWell: 'Rested', didnt: '' } } })
    expect(screen.getByLabelText('What went well')).toHaveValue('Rested')
  })

  // A week leftover is Done, Next week, Someday or Let go (settled after the
  // builder check, 2026-11-04): nothing goes back to the month.
  it('each loose end offers exactly Done, Next week, Someday and Let go, and each runs its own write', async () => {
    const p = setup()
    for (const t of ['Fix the gate', 'Call the bank']) {
      expect(row(t).getAllByRole('button').map((b) => b.textContent)).toEqual(['Done', 'Next week', 'Someday', 'Let go'])
    }
    expect(screen.queryByText(/Back to|Smaller|Hand off/)).toBeNull()
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Next week: Fix the gate' })) })
    expect(p.looseEnds[0].nextWeek).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Someday: Call the bank' })) })
    expect(p.looseEnds[1].someday).toHaveBeenCalledTimes(1)
    expect(p.looseEnds[0].someday).not.toHaveBeenCalled()
  })

  it('Let go and Done say what happened on the row', async () => {
    const p = setup()
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Let go: Fix the gate' })) })
    expect(p.looseEnds[0].letGo).toHaveBeenCalledTimes(1)
    expect(row('Fix the gate').getByText('Let go')).toBeInTheDocument()
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Done: Call the bank' })) })
    expect(p.looseEnds[1].done).toHaveBeenCalledTimes(1)
    expect(row('Call the bank').getByText('Marked done')).toBeInTheDocument()
  })

  it('a write that did not save says so on its row', async () => {
    setup({ looseEnds: [end('Fix the gate', { someday: vi.fn(async () => false) })] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Someday: Fix the gate' })) })
    expect(row('Fix the gate').getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('while a row saves, its other buttons wait too', async () => {
    let finish!: (ok: boolean) => void
    setup({ looseEnds: [end('Fix the gate', { nextWeek: vi.fn(() => new Promise<boolean>((r) => { finish = r })) })] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next week: Fix the gate' })) })
    for (const v of ['Done', 'Someday', 'Let go']) expect(screen.getByRole('button', { name: `${v}: Fix the gate` })).toBeDisabled()
    await act(async () => { finish(true) })
    // Saved: the row says so in place, and Change brings the calls back.
    expect(screen.getByText('On next week')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('button', { name: 'Someday: Fix the gate' })).toBeEnabled()
  })

  it('a row the call took off the list stays in its place as what happened', async () => {
    const p = setup({ looseEnds: [end('Fix the gate'), end('Call the bank')] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Someday: Fix the gate' })) })
    p.rerender([end('Call the bank')])
    const rows = within(screen.getByRole('list', { name: 'Not done last week' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Fix the gate')
    expect(rows[0]).toHaveTextContent('Moved to Someday')
    expect(within(rows[0]).queryByRole('button', { name: 'Change' })).toBeNull()
    expect(rows[1]).toHaveTextContent('Call the bank')
  })

  it('says what the opening sweep moved to Later, with a way to see them', () => {
    const p = setup({ aged: 2 })
    expect(screen.getByText(/Moved 2 untouched things to Later/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See them' }))
    expect(p.onSeeAged).toHaveBeenCalled()
  })

  it('nothing left open says so', () => {
    setup({ looseEnds: [], notDone: 0 })
    expect(screen.getByText('Nothing left open from last week.')).toBeInTheDocument()
  })
})
