import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const connect = vi.fn().mockResolvedValue(undefined)
const disconnect = vi.fn().mockResolvedValue(undefined)
const hookState = {
  connectedProviders: ['google'] as string[],
  calendars: [
    { id: 'me@gmail.com', summary: 'me@gmail.com', email: 'me@gmail.com', accessRole: 'owner', primary: true, provider: 'google' },
    { id: 'AAMk-work', summary: 'Work (Outlook)', email: 'AAMk-work', accessRole: 'reader', primary: true, provider: 'microsoft' },
  ],
}

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: hookState.connectedProviders.length > 0,
    connectedProviders: hookState.connectedProviders,
    needsReconnect: false,
    reconnectProviders: [],
    isLoading: false,
    error: null,
    connect,
    disconnect,
    fetchCalendarList: vi.fn().mockResolvedValue(hookState.calendars),
    defaultCalendarId: null,
    setDefaultCalendarId: vi.fn(),
  }),
}))

import { CalendarSettings } from './CalendarSettings'

beforeEach(() => {
  connect.mockClear()
  disconnect.mockClear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Outlook card', () => {
  it('offers to connect Outlook when only Google is connected, and starts the Microsoft flow', async () => {
    hookState.connectedProviders = ['google']
    render(<CalendarSettings />)
    const button = await screen.findByRole('button', { name: /connect outlook calendar/i })
    fireEvent.click(button)
    await waitFor(() => expect(connect).toHaveBeenCalledWith('microsoft'))
  })

  it('shows the Outlook calendars once connected and can disconnect just Outlook', async () => {
    hookState.connectedProviders = ['google', 'microsoft']
    render(<CalendarSettings />)
    expect(await screen.findByText('Work (Outlook)')).toBeInTheDocument()
    const outlook = screen.getByTestId('outlook-card')
    fireEvent.click(outlook.querySelector('button[data-action="disconnect"]')!)
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('microsoft'))
  })

  it('the Google account line and write-calendar picker never list Outlook calendars', async () => {
    hookState.connectedProviders = ['google', 'microsoft']
    render(<CalendarSettings />)
    await screen.findByText('Work (Outlook)')
    const google = screen.getByTestId('google-card')
    expect(google.textContent).toContain('me@gmail.com')
    expect(google.textContent).not.toContain('Work (Outlook)')
  })

  it('Outlook can be connected on its own, before Google', async () => {
    hookState.connectedProviders = ['microsoft']
    render(<CalendarSettings />)
    expect(await screen.findByText('Work (Outlook)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google calendar/i })).toBeInTheDocument()
  })
})
