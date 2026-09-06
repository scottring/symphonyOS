import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { InboxRow } from '@/lib/discussions/inbox'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const inbox = vi.hoisted(() => ({ rows: [] as InboxRow[], loading: false }))
vi.mock('@/hooks/useDiscussionInbox', () => ({
  useDiscussionInbox: () => ({ rows: inbox.rows, loading: inbox.loading, unreadCount: 0, reload: vi.fn() }),
}))

import { DiscussionsApp, discussionHref } from './DiscussionsApp'

function row(over: Partial<InboxRow>): InboxRow {
  return {
    sessionId: 's1', entityType: 'task', entityId: 't1', title: 'Dentist',
    lastAuthor: 'Iris', lastText: 'Can you take her?', lastAt: new Date(), unread: true,
    ...over,
  }
}

describe('DiscussionsApp', () => {
  beforeEach(() => { mockNavigate.mockClear(); inbox.rows = []; inbox.loading = false })

  it('shows an empty state when nothing has been discussed', () => {
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Discussions' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing to talk about yet/)).toBeInTheDocument()
  })

  it('renders each thread with who said what last and an unread dot', () => {
    inbox.rows = [row({}), row({ sessionId: 's2', entityId: 't2', title: 'Laundry', lastAuthor: 'Scott', lastText: 'done', unread: false })]
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText('Iris:')).toBeInTheDocument()
    expect(screen.getByText('Can you take her?')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Unread')).toHaveLength(1)
  })

  it('opens the item with its Discussion already open', () => {
    inbox.rows = [row({}), row({ sessionId: 's2', entityType: 'event', entityId: 'ev1', title: 'Soccer' })]
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    fireEvent.click(screen.getByText('Dentist'))
    expect(mockNavigate).toHaveBeenCalledWith('/today?detail=task:t1&discuss=1')
    fireEvent.click(screen.getByText('Soccer'))
    expect(mockNavigate).toHaveBeenCalledWith('/today?detail=event:ev1&discuss=1')
  })

  it('builds routine links too', () => {
    expect(discussionHref({ entityType: 'routine', entityId: 'r1' })).toBe('/today?detail=routine:r1&discuss=1')
  })


  it('wears the shared masthead card, like the other rows in the top group', () => {
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'Discussions' })).toBeInTheDocument()
  })
})
