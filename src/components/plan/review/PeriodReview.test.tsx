import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PeriodReview, type PeriodReviewProps, type ReviewLine } from './PeriodReview'

const line = (key: string, title: string, state: ReviewLine['state'], run = vi.fn(async () => true)): ReviewLine =>
  ({ key, title, state, verbs: state === 'open' ? [{ label: 'Done', run }, { label: 'Move to November', run }, { label: 'Remove from October', run }] : [] })

function mount(over: Partial<PeriodReviewProps> = {}) {
  const props: PeriodReviewProps = {
    periodWord: 'October', loading: false, reviewed: null, mine: null, byWhom: () => 'you',
    lines: [line('a', 'Book the cabin', 'open'), line('b', 'Fix the gate', 'open'), line('c', 'Pay taxes', 'done'), line('d', 'Plan sabbatical', 'moved')],
    onFinish: vi.fn(async () => true), onClose: vi.fn(), ...over,
  }
  const view = render(<PeriodReview {...props} />)
  return { props, view, rerender: (next: Partial<PeriodReviewProps>) => view.rerender(<PeriodReview {...props} {...next} />) }
}

describe('PeriodReview', () => {
  it('lists the open lines with their verbs always in view, and what was decided', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Review October' })).toBeInTheDocument()
    expect(screen.getByText('Two still open. One done and one moved on.')).toBeInTheDocument()
    const open = screen.getByRole('list', { name: 'Still open in October' })
    expect(within(open).getByText('Book the cabin')).toBeInTheDocument()
    expect(within(open).getByRole('button', { name: 'Move to November: Fix the gate' })).toBeVisible()
    expect(within(open).queryByText('Pay taxes')).toBeNull()
    expect(screen.getByText('Plan sabbatical').closest('li')).toHaveTextContent('Moved on')
    expect(screen.getByRole('button', { name: /1 done in October/ })).toBeInTheDocument()
  })

  it('a verb saves at once; a line that leaves the list says what happened, and Undo brings it back', async () => {
    const run = vi.fn(async () => true)
    const { props, rerender } = mount({ lines: [line('a', 'Book the cabin', 'open', run)] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove from October: Book the cabin' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    rerender({ lines: [] }) // the data: it is off October's list
    expect(screen.getByText('Book the cabin').closest('li')).toHaveTextContent('Remove from October')
    expect(screen.getByText('Nothing left open. One let go.')).toBeInTheDocument()
    rerender({ lines: props.lines }) // Undo put it back
    expect(within(screen.getByRole('list', { name: 'Still open in October' })).getByText('Book the cabin')).toBeInTheDocument()
    expect(screen.queryByText('Decided')).toBeNull()
  })

  it('a skipped routine occurrence is decided', () => {
    mount({ lines: [line('r', 'Trash night · Sun', 'skipped')] })
    expect(screen.getByText('Trash night · Sun').closest('li')).toHaveTextContent('Skipped')
    expect(screen.getByText('Nothing left open. One skipped.')).toBeInTheDocument()
  })

  it('a verb that fails leaves the line open and says so', async () => {
    mount({ lines: [line('a', 'Book the cabin', 'open', vi.fn(async () => false))] })
    fireEvent.click(screen.getByRole('button', { name: 'Done: Book the cabin' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn’t save. It is still open.')
    expect(screen.queryByText('Decided')).toBeNull()
  })

  it('Finish records the notes; what was left open stays on the period', async () => {
    const onFinish = vi.fn(async () => true)
    mount({ onFinish, next: { label: 'Go to November →', onClick: vi.fn() } })
    expect(screen.getByText('2 lines are still open. Finishing leaves them on October.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What went well?'), { target: { value: '  Ran twice a week ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ wentWell: 'Ran twice a week', didnt: '' }))
    expect(await screen.findByText('October reviewed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to November →' })).toBeInTheDocument()
  })

  it('a failed Finish keeps the notes and offers it again', async () => {
    mount({ onFinish: vi.fn(async () => false) })
    fireEvent.change(screen.getByLabelText('What didn’t?'), { target: { value: 'Sleep' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }))
    expect(await screen.findByText('Couldn’t save the review. Try again.')).toBeInTheDocument()
    expect(screen.getByLabelText('What didn’t?')).toHaveValue('Sleep')
  })

  it('an earlier review fills the notes and reads as reviewed', async () => {
    const { rerender } = mount({ mine: null })
    rerender({ mine: { wentWell: 'Ran twice', didnt: '' }, reviewed: { wentWell: 'Ran twice', didnt: '', at: new Date(2026, 9, 31), authorId: 'u1' } })
    await waitFor(() => expect(screen.getByLabelText('What went well?')).toHaveValue('Ran twice'))
    expect(screen.getByText(/Reviewed Oct 31 by you/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update review' })).toBeInTheDocument()
  })
})
