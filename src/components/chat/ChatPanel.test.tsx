import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}))

import { ChatPanel } from './ChatPanel'
import type { ChatMessage } from '@/types/chat'

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
