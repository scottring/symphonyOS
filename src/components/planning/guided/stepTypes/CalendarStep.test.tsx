import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { CalendarStep } from './CalendarStep'
import { renderStep, makeHost } from './testHarness'
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
    expect(screen.getByText('Dentist')).toBeInTheDocument()
  })

  it('disconnected: shows a quiet notice, no fetch', () => {
    const host = makeHost({ calendarConnected: false })
    renderStep(<CalendarStep />, { step, host })
    expect(host.fetchEvents).not.toHaveBeenCalled()
    expect(screen.getByText(/calendar isn't connected/i)).toBeInTheDocument()
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
