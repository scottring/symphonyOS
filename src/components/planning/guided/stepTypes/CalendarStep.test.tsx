import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { CalendarStep } from './CalendarStep'
import { renderStep, makeHost } from './testHarness'
import { GuidedProvider } from '../GuidedContext'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task } from '@/types/task'

const step = {
  id: 'month-ahead', type: 'calendar' as const, title: 'The month ahead',
  narration: 'Scan the next four to five weeks for conflicts and trips.',
}

// The look-ahead clamps its window to today (mid-period sessions never show
// the past), so event fixtures live in NEXT month relative to the real clock
// and the harness period is overridden to match.
const FUT = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1) })()
const FUT_END = new Date(FUT.getFullYear(), FUT.getMonth() + 1, 0, 23, 59, 59)
const futPeriod = { periodStart: FUT, periodEnd: FUT_END }

const ev = (title: string, day: number): CalendarEvent => ({
  id: `e-${day}`, title,
  startTime: new Date(FUT.getFullYear(), FUT.getMonth(), day, 10),
  endTime: new Date(FUT.getFullYear(), FUT.getMonth(), day, 11),
} as unknown as CalendarEvent)

describe('CalendarStep', () => {
  it('fetches the period range on mount and lists events by day', async () => {
    const host = makeHost({ calendarConnected: true, events: [ev('Dentist', 14)] })
    renderStep(<CalendarStep />, { step, host, ...futPeriod })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date)))
    await waitFor(() => expect(screen.getByText('Dentist')).toBeInTheDocument())
  })

  it('renders events that only carry the edge-function snake_case start_time', async () => {
    const snakeCaseEvent = {
      id: 'e-snake', title: 'Snake Case Checkup',
      start_time: new Date(FUT.getFullYear(), FUT.getMonth(), 14, 10).toISOString(),
      end_time: new Date(FUT.getFullYear(), FUT.getMonth(), 14, 11).toISOString(),
    } as unknown as CalendarEvent
    const host = makeHost({ calendarConnected: true, events: [snakeCaseEvent] })
    renderStep(<CalendarStep />, { step, host, ...futPeriod })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date)))
    await waitFor(() => expect(screen.getByText('Snake Case Checkup')).toBeInTheDocument())
  })

  it('reads events from the fetchEvents return value, not host.events (avoids clobbering the shared calendar cache)', async () => {
    // host.events simulates the app-wide cache already holding something
    // else (e.g. Today's events) — the step must render from what its own
    // fetchEvents call resolved with, not this shared array.
    const host = makeHost({ calendarConnected: true, events: [ev('Stale Cached Event', 5)] })
    host.fetchEvents = vi.fn(async () => [ev('Fresh Fetched Event', 14)])
    renderStep(<CalendarStep />, { step, host, ...futPeriod })
    await waitFor(() => expect(screen.getByText('Fresh Fetched Event')).toBeInTheDocument())
    expect(screen.queryByText('Stale Cached Event')).not.toBeInTheDocument()
  })

  it('clamps a mid-period look-ahead to today — past events never render', async () => {
    const past = new Date(); past.setDate(past.getDate() - 3); past.setHours(10, 0, 0, 0)
    const pastEvent = {
      id: 'e-past', title: 'Already Happened', startTime: past,
      endTime: new Date(past.getTime() + 60 * 60 * 1000),
    } as unknown as CalendarEvent
    const monthStart = new Date(past.getFullYear(), past.getMonth(), 1)
    const host = makeHost({ calendarConnected: true, events: [pastEvent] })
    renderStep(<CalendarStep />, { step, host, periodStart: monthStart, periodEnd: FUT_END })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalled())
    // Fetch starts at today, not the period's (past) first day…
    const [fetchStart] = (host.fetchEvents as ReturnType<typeof vi.fn>).mock.calls[0] as [Date, Date]
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0)
    expect(fetchStart.getTime()).toBe(todayMid.getTime())
    // …and an already-past event is filtered even if the fetch returns it.
    expect(screen.queryByText('Already Happened')).not.toBeInTheDocument()
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
    const { rerender, value } = renderStep(<CalendarStep />, { step, host, ...futPeriod })
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

  it('landscape: renders the year ribbon, counting tasks WITHOUT naming them', () => {
    const yearStep = {
      id: 'mountain-ranges', type: 'calendar' as const, title: "The year's mountain ranges",
      narration: 'Map the terrain.', props: { notesKey: 'annualCalendar', landscape: true },
    }
    const septTask = {
      id: 't-sep', title: 'Big launch', completed: false,
      scheduledFor: new Date(2026, 8, 15), bucket: 'timed',
    } as unknown as Task
    renderStep(<CalendarStep />, {
      step: yearStep,
      host: makeHost({ calendarConnected: false, tasks: [septTask] }),
    })
    // The ribbon scales the whole year, so every month tick is present.
    expect(screen.getByText('JAN')).toBeInTheDocument()
    expect(screen.getByText('DEC')).toBeInTheDocument()
    // The task is COUNTED, never named: a dated errand is a Today-altitude
    // detail, and reading it here buries what the year view exists to show.
    // (This is the assertion that "Lay out clothes for the NYSRA interview"
    // should have tripped before it shipped to the year rung.)
    expect(screen.queryByText('Big launch')).not.toBeInTheDocument()
    const counted = screen
      .getAllByTestId('density-bar')
      .filter((b) => (b.getAttribute('title') ?? '').endsWith('— 1'))
    expect(counted).toHaveLength(1)
    // And nothing at year altitude opens a day grid.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
