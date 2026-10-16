import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
const h = vi.hoisted(() => ({
  enable: vi.fn(),
  state: {
    householdId: 'h' as string | null,
    address: null as string | null,
    members: [],
    messages: [] as any[],
    loading: false,
    error: null,
  },
}))
vi.mock(
  '@/hooks/useSchoolMail',
  () => ({
    useSchoolMail: () => ({
      ...h.state,
      enable: h.enable,
      refresh: vi.fn(),
      save: vi.fn(),
      retry: vi.fn(),
    }),
  }),
)
import { SchoolMailCard } from './SchoolMailCard'
beforeEach(() => {
  h.enable.mockReset()
  h.state.householdId = 'h'
  h.state.address = null
  h.state.messages = []
  h.state.loading = false
})
describe('school information setup', () => {
  it('starts with one setup action and the review promise', () => {
    render(<SchoolMailCard />)
    expect(screen.getByText('Nothing enters your plans until you save it.'))
      .toBeInTheDocument()
    expect(h.enable).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Get my forwarding address' }),
    )
    expect(h.enable).toHaveBeenCalledOnce()
  })
  it('an address is not evidence of delivered mail', () => {
    h.state.address = 'test-only@symphony.invalid'
    render(<SchoolMailCard />)
    expect(screen.getByText(/Waiting for your first email/)).toBeInTheDocument()
    expect(screen.queryByText(/has received mail/)).not.toBeInTheDocument()
  })
  it('shows received and review states separately', () => {
    h.state.address = 'test-only@symphony.invalid'
    h.state.messages = [{
      id: 'c',
      subject: 'Trip',
      sourceLabel: 'School',
      createdAt: '2026-10-16',
      status: 'processing',
      proposal: null,
    }]
    render(<SchoolMailCard />)
    expect(screen.getByText(/has received mail/)).toBeInTheDocument()
    expect(screen.getByText('Reading…')).toBeInTheDocument()
  })
  it('refreshes an opened processing card when its proposal becomes ready', async () => {
    h.state.address = 'test-only@symphony.invalid'
    h.state.messages = [{
      id: 'c',
      subject: 'Trip',
      sourceLabel: 'School',
      createdAt: '2026-10-16',
      status: 'processing',
      proposal: null,
    }]
    const { rerender } = render(<SchoolMailCard />)
    fireEvent.click(screen.getByRole('button', { name: /Trip/ }))
    h.state.messages = [{
      ...h.state.messages[0],
      status: 'ready',
      proposal: {
        gaps: [],
        items: [{
          id: 'x',
          kind: 'task',
          title: 'Return form',
          date: null,
          time: null,
          memberIds: [],
          quote: 'Return form',
        }],
      },
    }]
    rerender(<SchoolMailCard />)
    await waitFor(() =>
      expect(screen.getByLabelText('Include Return form')).toBeInTheDocument()
    )
  })
  it('requires a household before offering an address', () => {
    h.state.householdId = null
    render(<SchoolMailCard />)
    expect(screen.queryByRole('button', { name: 'Get my forwarding address' }))
      .not.toBeInTheDocument()
    expect(screen.getByText(/Create or join a household/)).toBeInTheDocument()
  })
})
