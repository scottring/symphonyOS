import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}))

import { ChatPanel } from './ChatPanel'
import type { ChatMessage } from '@/types/chat'
import type { FamilyMember } from '@/types/family'

const baseProps = {
  messages: [] as ChatMessage[],
  loading: false,
  error: null,
  entityContext: null,
  onSend: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
}

describe('ChatPanel suggestions', () => {
  it('renders suggestion chips in the empty state and sends on click', () => {
    const onSend = vi.fn()
    render(
      <ChatPanel
        {...baseProps}
        onSend={onSend}
        suggestions={['Break this into doable steps', 'What do I need before I can start?']}
      />,
    )
    const chip = screen.getByRole('button', { name: 'Break this into doable steps' })
    fireEvent.click(chip)
    expect(onSend).toHaveBeenCalledWith('Break this into doable steps')
  })

  it('hides suggestions once the conversation has messages', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hi', timestamp: new Date() },
    ]
    render(
      <ChatPanel {...baseProps} messages={messages} suggestions={['Break this into doable steps']} />,
    )
    expect(screen.queryByRole('button', { name: 'Break this into doable steps' })).toBeNull()
  })
})

describe('ChatPanel authorship (shared Discuss thread)', () => {
  const iris: FamilyMember = {
    id: 'm2', user_id: 'u1', auth_user_id: 'u2', name: 'Iris', initials: 'IK',
    color: 'purple', avatar_url: null, is_full_user: true, display_order: 1,
    member_type: 'core', created_at: '2026-01-01T00:00:00Z',
  }

  const thread: ChatMessage[] = [
    {
      id: '1', role: 'user', content: 'Can you take her Thursday?', timestamp: new Date(),
      author: { id: 'u2', name: 'Iris', kind: 'member' },
    },
    {
      id: '2', role: 'user', content: 'Yes, after 3.', timestamp: new Date(),
      author: { id: 'u1', name: 'Scott', kind: 'member' },
    },
    {
      id: '3', role: 'assistant', content: 'Booked for 3:30.', timestamp: new Date(),
      author: { id: null, name: 'Symphony', kind: 'symphony' },
    },
  ]

  function renderThread() {
    return render(
      <ChatPanel {...baseProps} messages={thread} currentUserId="u1" familyMembers={[iris]} />,
    )
  }

  it("renders a partner's message on the left, named, with an avatar", () => {
    const { container } = renderThread()
    const bubble = screen.getByText('Can you take her Thursday?').closest('.flex')
    expect(bubble?.className).toContain('justify-start')
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(container.querySelector('[title="Iris"]')).toBeTruthy()
  })

  it("renders the viewer's own message on the right, unlabelled", () => {
    renderThread()
    const bubble = screen.getByText('Yes, after 3.').closest('.flex')
    expect(bubble?.className).toContain('justify-end')
    expect(screen.queryByText('Scott')).toBeNull()
  })

  it('labels the assistant Symphony', () => {
    renderThread()
    const bubble = screen.getByText('Booked for 3:30.').closest('.flex')
    expect(bubble?.className).toContain('justify-start')
    expect(screen.getByText('Symphony')).toBeInTheDocument()
  })

  it('leaves an author-less (solo) conversation rendering as before', () => {
    const solo: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hi', timestamp: new Date() },
      { id: '2', role: 'assistant', content: 'hello', timestamp: new Date() },
    ]
    render(<ChatPanel {...baseProps} messages={solo} currentUserId="u1" />)
    expect(screen.getByText('hi').closest('.flex')?.className).toContain('justify-end')
    expect(screen.queryByText('Symphony')).toBeNull()
  })

  it('shows the participants in the header', () => {
    render(
      <ChatPanel
        {...baseProps}
        messages={thread}
        currentUserId="u1"
        familyMembers={[iris]}
        participants={['Scott', 'Iris']}
        heading="Discussion"
      />,
    )
    const header = screen.getByLabelText('Participants')
    expect(header.textContent).toBe('SI')
    expect(screen.getByRole('heading', { name: 'Discussion' })).toBeInTheDocument()
  })
})

describe('ChatPanel assistant markdown rendering', () => {
  it("renders an assistant message's markdown, not the literal asterisks", () => {
    const messages: ChatMessage[] = [
      {
        id: '1', role: 'assistant',
        content: 'Let’s look at **which scenario you and Iris prefer**.',
        timestamp: new Date(),
      },
    ]
    const { container } = render(<ChatPanel {...baseProps} messages={messages} />)
    const strong = container.querySelector('strong')
    expect(strong).toBeTruthy()
    expect(strong?.textContent).toBe('which scenario you and Iris prefer')
    expect(screen.queryByText(/\*\*/)).toBeNull()
  })

  it('leaves a user message with markdown-looking text unrendered', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'is **this** urgent?', timestamp: new Date() },
    ]
    const { container } = render(<ChatPanel {...baseProps} messages={messages} />)
    expect(container.querySelector('strong')).toBeNull()
    expect(screen.getByText('is **this** urgent?')).toBeInTheDocument()
  })
})
