import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SchoolMailReview } from './SchoolMailReview'
import type { SchoolMailMessage } from '@/lib/schoolMail'
const save = vi.fn(), retry = vi.fn()
const message: SchoolMailMessage = {
  id: 'email-1',
  subject: 'School update',
  sourceLabel: 'Test School',
  createdAt: '2026-10-16',
  status: 'ready',
  sourceText: 'Picture day is Tuesday. <script>never run this</script>',
  error: null,
  result: null,
  proposal: {
    gaps: ['The attachment has not been read.'],
    items: [
      {
        id: 'a',
        kind: 'event',
        title: 'Picture day',
        date: '2026-10-20',
        time: null,
        memberIds: ['child'],
        quote: 'Picture day is Tuesday.',
      },
      {
        id: 'b',
        kind: 'task',
        title: 'Bring a book',
        date: null,
        time: null,
        memberIds: [],
        quote: 'Bring a book.',
      },
    ],
  },
}
const renderReview = (m = message) =>
  render(
    <SchoolMailReview
      message={m}
      members={[{ id: 'child', name: 'Casey' }]}
      onSave={save}
      onRetry={retry}
    />,
  )
beforeEach(() => {
  save.mockReset()
  retry.mockReset()
  save.mockResolvedValue({
    status: 'saved',
    count: 1,
    items: [{ id: 'saved-a', kind: 'event', title: 'School pictures' }],
  })
})
describe('school email review', () => {
  it('does not save on open and displays source, gaps and destinations', () => {
    const { container } = renderReview()
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText(/Nothing is saved until/)).toBeInTheDocument()
    expect(screen.getByText('Inbox · no day chosen')).toBeInTheDocument()
    expect(screen.getByText('The attachment has not been read.'))
      .toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })
  it('saves only checked items with the parent’s corrections', async () => {
    renderReview()
    fireEvent.click(screen.getByLabelText('Include Bring a book'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0])
    fireEvent.change(screen.getByLabelText('Title for Picture day'), {
      target: { value: 'School pictures' },
    })
    fireEvent.change(screen.getByLabelText('Date for School pictures'), {
      target: { value: '2026-10-21' },
    })
    fireEvent.change(screen.getByLabelText('Time for School pictures'), {
      target: { value: '15:00' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save 1 selected item' }),
    )
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('email-1', [
        expect.objectContaining({
          id: 'a',
          title: 'School pictures',
          date: '2026-10-21',
          time: '15:00',
        }),
      ])
    )
    expect(await screen.findByText('Saved 1 item.')).toBeInTheDocument()
  })
  it('retains selected corrections after an uncertain save for safe retry', async () => {
    save.mockRejectedValueOnce(new Error('Save not confirmed; retry safely.'))
    renderReview()
    fireEvent.click(screen.getByLabelText('Include Bring a book'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save 1 selected item' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('retry safely')
    expect(screen.queryByText('Saved 1 item.')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save 1 selected item' }),
    )
    await screen.findByText('Saved 1 item.')
    expect(save.mock.calls[0]).toEqual(save.mock.calls[1])
  })
  it('finishing with nothing checked sends an empty selection', async () => {
    save.mockResolvedValue({ status: 'dismissed', count: 0, items: [] })
    renderReview()
    fireEvent.click(screen.getByLabelText('Include Picture day'))
    fireEvent.click(screen.getByLabelText('Include Bring a book'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish without adding anything' }),
    )
    await waitFor(() => expect(save).toHaveBeenCalledWith('email-1', []))
    expect(await screen.findByText('Reviewed. Nothing added.'))
      .toBeInTheDocument()
  })
  it('never automatically confirms a forwarding request', () => {
    renderReview({
      ...message,
      proposal: { items: [], gaps: [], confirmation: true },
    })
    expect(screen.getByText(/use its code in Gmail/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Save/ })).not
      .toBeInTheDocument()
  })
  it('keeps routine visibility and recurrence under parent control', async () => {
    renderReview({
      ...message,
      proposal: {
        gaps: [],
        items: [{
          id: 'r',
          kind: 'routine',
          title: 'Bring the folder',
          date: null,
          time: null,
          memberIds: [],
          quote: 'Every weekday',
          repeat: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          showOnTimeline: true,
        }],
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(
      screen.getByLabelText('Show this routine in Today and Week'),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save 1 selected item' }),
    )
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('email-1', [
        expect.objectContaining({
          showOnTimeline: false,
          repeat: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        }),
      ])
    )
  })
  it('a received email still being read cannot be saved', () => {
    renderReview({ ...message, status: 'processing', proposal: null })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nothing has been added',
    )
    expect(screen.queryByRole('button', { name: /Save/ })).not
      .toBeInTheDocument()
  })
  it('lets a parent recover an extraction whose dispatch stalled', async () => {
    renderReview({
      ...message,
      status: 'processing',
      proposal: null,
      createdAt: new Date(Date.now() - 360000).toISOString(),
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Taking too long? Try reading again',
      }),
    )
    await waitFor(() => expect(retry).toHaveBeenCalledWith('email-1'))
    expect(save).not.toHaveBeenCalled()
  })
})
