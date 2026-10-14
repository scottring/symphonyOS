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
const drawer = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/components/assist/AssistDrawer', () => ({
  AssistDrawer: (p: Record<string, unknown>) => { drawer.props = p; return <div role="dialog" aria-label="Discussion drawer" /> },
}))
vi.mock('@/hooks/useDiscussionInbox', () => ({
  useDiscussionInbox: () => ({ rows: inbox.rows, loading: inbox.loading, unreadCount: 0, reload: vi.fn() }),
}))

import { DiscussionsApp, discussionHref } from './DiscussionsApp'

function row(over: Partial<InboxRow>): InboxRow {
  return {
    sessionId: 's1', entityType: 'task', entityId: 't1', title: 'Dentist',
    lastAuthor: 'Iris', lastText: 'Can you take her?', lastAt: new Date(), unread: true,
    state: { kind: 'waiting-on-you' }, others: ['Iris'], waitingOn: ['Scott'], scope: 'compound',
    settledAt: null, settledBy: null, outcome: null,
    ...over,
  }
}

describe('DiscussionsApp', () => {
  beforeEach(() => { mockNavigate.mockClear(); inbox.rows = []; inbox.loading = false; drawer.props = null })

  it('shows an empty state when nothing has been discussed', () => {
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Discussions' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing to talk about yet/)).toBeInTheDocument()
  })

  // Scott, 2026-10-14: discussions by whose turn it is.
  it('groups by whose turn it is, with who it is with, who said what last and an unread dot', () => {
    inbox.rows = [
      row({}),
      row({ sessionId: 's2', entityId: 't2', title: 'Laundry', lastAuthor: 'Scott', lastText: 'done', unread: false, state: { kind: 'waiting-on-them', names: ['Iris'] } }),
      row({ sessionId: 's3', entityId: 't3', title: 'Bagels', lastAuthor: 'Symphony', lastText: '6pm', unread: false, state: { kind: 'just-you' }, others: [] }),
      row({ sessionId: 's4', entityId: 't4', title: 'Front gate', unread: false, state: { kind: 'settled' }, settledAt: new Date(), outcome: 'Matt comes Tuesday' }),
    ]
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    expect(within(screen.getByRole('region', { name: 'Waiting on you' })).getByText('Dentist')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Waiting on Iris' })).getByText('Laundry')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Just you and Symphony' })).getByText('Bagels')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Settled this week' })).getByText('Settled: Matt comes Tuesday')).toBeInTheDocument()
    expect(screen.getAllByText(/With Iris/).length).toBeGreaterThan(0)
    expect(screen.getByText('Iris:')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Unread')).toHaveLength(1)
  })

  it('opens a discussion right here; About opens the item', () => {
    inbox.rows = [row({}), row({ sessionId: 's2', entityType: 'event', entityId: 'ev1', title: 'Soccer' })]
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    fireEvent.click(screen.getByText('Dentist'))
    expect(drawer.props).toMatchObject({ discuss: { type: 'task', id: 't1', title: 'Dentist', scope: 'compound' } })
    ;(drawer.props!.onOpenItem as () => void)()
    expect(mockNavigate).toHaveBeenCalledWith('/today?detail=task:t1&discuss=1')
  })

  it('?open= opens that discussion (the phone’s Waiting on you)', () => {
    inbox.rows = [row({})]
    render(<MemoryRouter initialEntries={['/discussions?open=s1']}><DiscussionsApp /></MemoryRouter>)
    expect(drawer.props).toMatchObject({ discuss: { id: 't1' } })
  })

  it('builds routine links too', () => {
    expect(discussionHref({ entityType: 'routine', entityId: 'r1' })).toBe('/today?detail=routine:r1&discuss=1')
  })


  it('wears the shared masthead card, like the other rows in the top group', () => {
    render(<MemoryRouter><DiscussionsApp /></MemoryRouter>)
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'Discussions' })).toBeInTheDocument()
    // Same column as the rest of the group, so the cards line up page to page.
    expect(card.parentElement?.className).toMatch(/max-w-\[1152px\]/)
  })
})
