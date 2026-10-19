import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const connect = vi.fn().mockResolvedValue(undefined)
const disconnect = vi.fn().mockResolvedValue(undefined)
const GOOGLE = { id: 'g1', provider: 'google', accountEmail: null, isPrimary: true, grantsMail: false }
const OUTLOOK = { id: 'ms1', provider: 'microsoft', accountEmail: 'me@outlook.com', isPrimary: true, grantsMail: false }
const hookState = {
  connectedProviders: ['google'] as string[],
  calendars: [
    { id: 'me@gmail.com', summary: 'me@gmail.com', email: 'me@gmail.com', accessRole: 'owner', primary: true, provider: 'google', connectionId: 'g1' },
    { id: 'AAMk-work', summary: 'Work (Outlook)', email: 'AAMk-work', accessRole: 'reader', primary: true, provider: 'microsoft', connectionId: 'ms1' },
  ],
}
const READ_ONLY_OUTLOOK = hookState.calendars
const WRITABLE_OUTLOOK = hookState.calendars.map((c) => (c.provider === 'microsoft' ? { ...c, accessRole: 'owner' } : c))
const accountsFor = (providers: string[]) => [GOOGLE, OUTLOOK].filter((a) => providers.includes(a.provider))

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: hookState.connectedProviders.length > 0,
    connectedProviders: hookState.connectedProviders,
    accounts: accountsFor(hookState.connectedProviders),
    reconnectAccountIds: [],
    makePrimary: vi.fn(),
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
  vi.stubEnv('VITE_MICROSOFT_CALENDAR_ENABLED', '1')
  hookState.calendars = READ_ONLY_OUTLOOK
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
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith({ connectionId: 'ms1' }))
  })

  it('a view-only Outlook calendar is never offered for new events, and its account says so', async () => {
    hookState.connectedProviders = ['google', 'microsoft']
    render(<CalendarSettings />)
    await screen.findByText('Work (Outlook)')
    const google = screen.getByTestId('google-card')
    expect(google.textContent).toContain('me@gmail.com')
    expect(google.textContent).not.toContain('Work (Outlook)')
    expect(screen.getByTestId('outlook-card').textContent).toContain('View only')
  })

  it('a writable Outlook calendar is offered for new events, under its account', async () => {
    hookState.connectedProviders = ['google', 'microsoft']
    hookState.calendars = WRITABLE_OUTLOOK
    render(<CalendarSettings />)
    const select = await screen.findByLabelText('Create events on')
    await waitFor(() => expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Primary (me@gmail.com)', 'Work (Outlook)']))
    expect(Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['me@outlook.com'])
    expect(screen.getByTestId('outlook-card').textContent).not.toContain('View only')
  })

  it('with only Outlook connected, Create events on sits with the Outlook account', async () => {
    hookState.connectedProviders = ['microsoft']
    hookState.calendars = WRITABLE_OUTLOOK
    render(<CalendarSettings />)
    const select = await screen.findByLabelText('Create events on')
    expect(screen.getByTestId('outlook-card').contains(select)).toBe(true)
    expect((select as HTMLSelectElement).options[0].textContent).toBe('Primary (me@outlook.com)')
  })

  it('Outlook can be connected on its own, before Google', async () => {
    hookState.connectedProviders = ['microsoft']
    render(<CalendarSettings />)
    expect(await screen.findByText('Work (Outlook)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google calendar/i })).toBeInTheDocument()
  })
})
