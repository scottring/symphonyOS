import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const connect = vi.fn().mockResolvedValue(undefined)
const disconnect = vi.fn().mockResolvedValue(undefined)
const makePrimary = vi.fn().mockResolvedValue(undefined)
const state = { reconnectAccountIds: [] as string[] }

const ACCOUNTS = [
  { id: 'personal', provider: 'google', accountEmail: 'me@gmail.com', isPrimary: true, grantsMail: false },
  { id: 'work', provider: 'google', accountEmail: 'me@work.com', isPrimary: false, grantsMail: true },
]
const CALENDARS = [
  { id: 'me@gmail.com', summary: 'me@gmail.com', email: 'me@gmail.com', accessRole: 'owner', primary: true, provider: 'google', connectionId: 'personal' },
  { id: 'family@group.calendar.google.com', summary: 'Family', email: '', accessRole: 'writer', primary: false, provider: 'google', connectionId: 'personal' },
  { id: 'me@work.com', summary: 'me@work.com', email: 'me@work.com', accessRole: 'owner', primary: true, provider: 'google', connectionId: 'work' },
  { id: 'team@work.com', summary: 'Team', email: '', accessRole: 'owner', primary: false, provider: 'google', connectionId: 'work' },
]

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: true,
    connectedProviders: ['google'],
    accounts: ACCOUNTS,
    reconnectAccountIds: state.reconnectAccountIds,
    needsReconnect: false,
    reconnectProviders: [],
    isLoading: false,
    error: null,
    connect,
    disconnect,
    makePrimary,
    fetchCalendarList: vi.fn().mockResolvedValue(CALENDARS),
    defaultCalendarId: null,
    setDefaultCalendarId: vi.fn(),
  }),
}))

import { CalendarSettings } from './CalendarSettings'

beforeEach(() => {
  connect.mockClear(); disconnect.mockClear(); makePrimary.mockClear()
  state.reconnectAccountIds = []
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

const card = (email: string) => screen.getAllByTestId('calendar-account').find((c) => c.textContent?.includes(email))!

describe('several Google accounts', () => {
  it('shows one card per account, the primary marked', async () => {
    render(<CalendarSettings />)
    await screen.findByLabelText('Create events on')
    expect(screen.getAllByTestId('calendar-account')).toHaveLength(2)
    expect(card('me@gmail.com').textContent).toContain('Primary')
    expect(within(card('me@gmail.com')).queryByRole('button', { name: 'Make primary' })).toBeNull()
  })

  it('Create events on lists every account’s writable calendars, grouped by account', async () => {
    render(<CalendarSettings />)
    const select = await screen.findByLabelText('Create events on')
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)
    expect(labels).toEqual(['Primary (me@gmail.com)', 'Family', 'me@work.com', 'Team'])
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)
    expect(groups).toEqual(['me@gmail.com', 'me@work.com'])
  })

  it('adds another account through the Google sign-in', async () => {
    render(<CalendarSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add another Google account' }))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('google'))
  })

  it('disconnects just the one account', async () => {
    render(<CalendarSettings />)
    await screen.findByLabelText('Create events on')
    fireEvent.click(within(card('me@work.com')).getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith({ connectionId: 'work' }))
  })

  it('makes another account primary', async () => {
    render(<CalendarSettings />)
    await screen.findByLabelText('Create events on')
    fireEvent.click(within(card('me@work.com')).getByRole('button', { name: 'Make primary' }))
    await waitFor(() => expect(makePrimary).toHaveBeenCalledWith('work'))
  })

  it('says which account Gmail is connected through', async () => {
    render(<CalendarSettings />)
    expect(await screen.findByText('Gmail is connected for me@work.com.')).toBeInTheDocument()
  })

  it('a revoked account asks for reconnection on its own card only', async () => {
    state.reconnectAccountIds = ['work']
    render(<CalendarSettings />)
    await screen.findByLabelText('Create events on')
    expect(within(card('me@work.com')).getByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(within(card('me@gmail.com')).queryByRole('button', { name: 'Reconnect' })).toBeNull()
  })
})
