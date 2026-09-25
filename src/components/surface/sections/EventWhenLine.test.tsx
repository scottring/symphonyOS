// Scott's walkthrough request: click the date/time under an event's title to
// edit it in place. These hold the three things that make that safe —
// duration when only the day moves, a cancel that changes nothing, and a
// refused save that keeps the edit instead of swallowing it.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { EventWhenLine, whenEditResult, parseWhenFields } from './EventWhenLine'

// Wed 7 Oct 2026, 1:00–2:30 PM.
const START = new Date(2026, 9, 7, 13, 0)
const END = new Date(2026, 9, 7, 14, 30)
const event = {
  id: 'e1', google_event_id: 'e1', title: 'Dentist',
  start_time: START.toISOString(), end_time: END.toISOString(),
} as unknown as CalendarEvent

const show = (onSave?: (s: Date, e: Date) => void | Promise<boolean | void>, over: Partial<{ spansDays: boolean; endTime: Date | null }> = {}) =>
  render(
    <EventWhenLine
      event={event} startTime={START} endTime={over.endTime === undefined ? END : over.endTime}
      spansDays={over.spansDays ?? false} onSave={onSave}
    >
      <span>Wed, Oct 7 · 1:00 PM – 2:30 PM</span>
    </EventWhenLine>,
  )

const openEditor = () => fireEvent.click(screen.getByRole('button', { name: /Change when this event is/ }))

describe('the when line', () => {
  it('is a plain statement where the calendar may not be written to', () => {
    show(undefined)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Wed, Oct 7/)).toBeInTheDocument()
  })

  it('opens an editor in place, seeded with what the event says', () => {
    show(vi.fn())
    openEditor()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-07')
    expect(screen.getByLabelText('Start time')).toHaveValue('13:00')
    expect(screen.getByLabelText('End time')).toHaveValue('14:30')
    // No second scheduler: this is the line, not a popover.
    expect(screen.queryByText(/Pick date/)).not.toBeInTheDocument()
  })

  it('shows an end DATE only for an event that already spans days', () => {
    show(vi.fn())
    openEditor()
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument()
  })

  it('…and does show one when it does', () => {
    render(
      <EventWhenLine
        event={event} startTime={START} endTime={new Date(2026, 9, 11, 17, 0)}
        spansDays onSave={vi.fn()}
      >
        <span>Wed, Oct 7 – Sun, Oct 11</span>
      </EventWhenLine>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Change when this event is/ })[0])
    expect(screen.getByLabelText('End date')).toHaveValue('2026-10-11')
  })
})

describe('changing the day keeps the duration', () => {
  it('moves both ends by the same amount', async () => {
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const [start, end] = onSave.mock.calls[0]
    expect(start).toEqual(new Date(2026, 9, 9, 13, 0))
    expect(end).toEqual(new Date(2026, 9, 9, 14, 30))
    expect(end.getTime() - start.getTime()).toBe(90 * 60_000)
  })

  it('across a month boundary', async () => {
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const [start, end] = onSave.mock.calls[0]
    expect(start).toEqual(new Date(2026, 10, 2, 13, 0))
    expect(end.getTime() - start.getTime()).toBe(90 * 60_000)
  })

  it('moving only the START also keeps it', async () => {
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const [start, end] = onSave.mock.calls[0]
    expect(start).toEqual(new Date(2026, 9, 7, 9, 15))
    expect(end).toEqual(new Date(2026, 9, 7, 10, 45))
  })

  it('but an end the reader typed is taken literally', async () => {
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][1]).toEqual(new Date(2026, 9, 7, 16, 0))
  })
})

describe('from the keyboard alone', () => {
  const user = () => userEvent.setup({ delay: null })

  it('opens with Enter, saves with Enter, and returns focus to the line', async () => {
    const u = user()
    const onSave = vi.fn()
    show(onSave)
    const line = screen.getByRole('button', { name: /Change when this event is/ })
    line.focus()
    await u.keyboard('{Enter}')
    const date = screen.getByLabelText('Date')
    expect(date).toBe(document.activeElement)

    fireEvent.change(date, { target: { value: '2026-10-09' } })
    await u.keyboard('{Enter}')
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /Change when this event is/ })).toBe(document.activeElement))
  })

  it('Escape cancels, writes nothing, and comes back to the line', async () => {
    const u = user()
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-25' } })
    await u.keyboard('{Escape}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Change when this event is/ })).toBe(document.activeElement))
    // …and reopening shows the event's own time again, not the abandoned edit.
    openEditor()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-07')
  })

  it('Cancel does the same from the button', async () => {
    const onSave = vi.fn()
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument()
  })
})

describe('a save the calendar refuses', () => {
  it('keeps the edit open, says so, and can be retried', async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/didn’t save/)
    expect(alert).toHaveTextContent(/still here/)
    // The edit survives the refusal — the reader does not retype it.
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-09')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByLabelText('Date')).not.toBeInTheDocument())
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('a host that says nothing is taken at its word', async () => {
    const onSave = vi.fn()                 // returns undefined
    show(onSave)
    openEditor()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByLabelText('Date')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// The rule, on its own, because the component is not the only thing that has
// to agree with it.
describe('whenEditResult', () => {
  const edit = { date: '2026-10-07', start: '13:00', end: '14:30', endTouched: false }

  it('keeps the length when the end was not touched', () => {
    const r = whenEditResult(event, { ...edit, date: '2026-10-09' })!
    expect(r.endTime.getTime() - r.startTime.getTime()).toBe(90 * 60_000)
  })

  it('an end at or before its start is the next day, not a negative event', () => {
    const r = whenEditResult(event, { date: '2026-10-07', start: '23:00', end: '01:00', endTouched: true })!
    expect(r.startTime).toEqual(new Date(2026, 9, 7, 23, 0))
    expect(r.endTime).toEqual(new Date(2026, 9, 8, 1, 0))
  })

  it('uses the end DATE when the event spans days', () => {
    const r = whenEditResult(event, { date: '2026-10-07', start: '09:00', end: '17:00', endDate: '2026-10-11', endTouched: true })!
    expect(r.endTime).toEqual(new Date(2026, 9, 11, 17, 0))
  })

  it('refuses an unusable field rather than guessing', () => {
    expect(whenEditResult(event, { ...edit, date: '', endTouched: false })).toBeNull()
    expect(parseWhenFields('2026-10-07', '')).toBeNull()
  })
})
