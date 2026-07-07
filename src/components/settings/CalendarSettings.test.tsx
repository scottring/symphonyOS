import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setDefaultCalendarId = vi.fn().mockResolvedValue(undefined)
const CALENDARS = [
  { id: 'smkaufman@gmail.com', summary: 'smkaufman@gmail.com', email: 'smkaufman@gmail.com', accessRole: 'owner', primary: true },
  { id: 'family@group.calendar.google.com', summary: 'Family calendar', email: '', accessRole: 'owner', primary: false },
  { id: 'work@stacksdata.com', summary: 'Work (view only)', email: '', accessRole: 'reader', primary: false },
]

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: true,
    needsReconnect: false,
    isLoading: false,
    error: null,
    disconnect: vi.fn(),
    fetchCalendarList: vi.fn().mockResolvedValue(CALENDARS),
    defaultCalendarId: null,
    setDefaultCalendarId,
  }),
}))

import { pickAccountEmail, CalendarSettings } from './CalendarSettings'

describe('CalendarSettings default write calendar', () => {
  it('lists only writable calendars and saves the choice', async () => {
    render(<CalendarSettings />)
    const select = await screen.findByLabelText('Create events on')
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)
    expect(labels.some((l) => l?.includes('Family calendar'))).toBe(true)
    expect(labels.some((l) => l?.includes('Work (view only)'))).toBe(false)
    expect(labels.some((l) => l?.includes('Primary'))).toBe(true)

    fireEvent.change(select, { target: { value: 'family@group.calendar.google.com' } })
    await waitFor(() =>
      expect(setDefaultCalendarId).toHaveBeenCalledWith('family@group.calendar.google.com'))
  })
})

describe('pickAccountEmail', () => {
  it('returns the primary calendar email', () => {
    const calendars = [
      { email: 'shared@group.calendar.google.com', primary: false },
      { email: 'smkaufman@gmail.com', primary: true },
    ]
    expect(pickAccountEmail(calendars)).toBe('smkaufman@gmail.com')
  })

  it('falls back to the first calendar when none is flagged primary', () => {
    const calendars = [
      { email: 'first@gmail.com' },
      { email: 'second@gmail.com' },
    ]
    expect(pickAccountEmail(calendars)).toBe('first@gmail.com')
  })

  it('returns null for an empty list', () => {
    expect(pickAccountEmail([])).toBeNull()
  })

  it('returns null when the chosen calendar has no email', () => {
    expect(pickAccountEmail([{ primary: true }])).toBeNull()
  })
})
