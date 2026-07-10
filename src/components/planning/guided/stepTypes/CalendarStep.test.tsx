import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { CalendarStep } from './CalendarStep'
import { renderStep, makeHost } from './testHarness'
import { GuidedProvider } from '../GuidedContext'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const step = {
  id: 'month-ahead', type: 'calendar' as const, title: 'The month ahead',
  narration: 'Scan the next four to five weeks for conflicts and trips.',
}

const ev = (title: string, day: number): CalendarEvent => ({
  id: `e-${day}`, title, startTime: new Date(2026, 6, day, 10), endTime: new Date(2026, 6, day, 11),
} as unknown as CalendarEvent)

describe('CalendarStep', () => {
  it('fetches the period range on mount and lists events by day', async () => {
    const host = makeHost({ calendarConnected: true, events: [ev('Dentist', 14)] })
    renderStep(<CalendarStep />, { step, host })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date)))
    await waitFor(() => expect(screen.getByText('Dentist')).toBeInTheDocument())
  })

  it('renders events that only carry the edge-function snake_case start_time', async () => {
    const snakeCaseEvent = {
      id: 'e-snake', title: 'Snake Case Checkup', start_time: new Date(2026, 6, 14, 10).toISOString(),
      end_time: new Date(2026, 6, 14, 11).toISOString(),
    } as unknown as CalendarEvent
    const host = makeHost({ calendarConnected: true, events: [snakeCaseEvent] })
    renderStep(<CalendarStep />, { step, host })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date)))
    await waitFor(() => expect(screen.getByText('Snake Case Checkup')).toBeInTheDocument())
  })

  it('reads events from the fetchEvents return value, not host.events (avoids clobbering the shared calendar cache)', async () => {
    // host.events simulates the app-wide cache already holding something
    // else (e.g. Today's events) — the step must render from what its own
    // fetchEvents call resolved with, not this shared array.
    const host = makeHost({ calendarConnected: true, events: [ev('Stale Cached Event', 5)] })
    host.fetchEvents = vi.fn(async () => [ev('Fresh Fetched Event', 14)])
    renderStep(<CalendarStep />, { step, host })
    await waitFor(() => expect(screen.getByText('Fresh Fetched Event')).toBeInTheDocument())
    expect(screen.queryByText('Stale Cached Event')).not.toBeInTheDocument()
  })

  it('disconnected: shows a quiet notice, no fetch', () => {
    const host = makeHost({ calendarConnected: false })
    renderStep(<CalendarStep />, { step, host })
    expect(host.fetchEvents).not.toHaveBeenCalled()
    expect(screen.getByText(/calendar isn't connected/i)).toBeInTheDocument()
  })

  it('shows a checking state while the connection is being validated', () => {
    const host = makeHost({ calendarConnected: false, calendarChecking: true })
    renderStep(<CalendarStep />, { step, host })
    expect(screen.getByText(/Checking your calendar/)).toBeInTheDocument()
    expect(screen.queryByText(/isn't connected/)).toBeNull()
  })

  it('fetches when the connection validates AFTER mount (late flip)', async () => {
    const host = makeHost({ calendarConnected: false, calendarChecking: true })
    const { rerender, value } = renderStep(<CalendarStep />, { step, host })
    expect(host.fetchEvents).not.toHaveBeenCalled()
    const connected = { ...host, calendarConnected: true, calendarChecking: false,
      fetchEvents: vi.fn(async () => [ev('Dentist', 14)]) }
    rerender(
      <GuidedProvider value={{ ...value, host: connected }}>
        <CalendarStep />
      </GuidedProvider>,
    )
    await waitFor(() => expect(connected.fetchEvents).toHaveBeenCalled())
    expect(await screen.findByText('Dentist')).toBeInTheDocument()
  })

  it('renders the notes textarea when notesKey is configured', () => {
    const patchNotes = vi.fn()
    renderStep(<CalendarStep />, {
      step: { ...step, props: { notesKey: 'annualCalendar' } },
      host: makeHost({ calendarConnected: false }), patchNotes,
    })
    expect(screen.getByPlaceholderText(/Worth remembering/)).toBeInTheDocument()
  })
})
