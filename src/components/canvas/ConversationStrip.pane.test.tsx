import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationStrip } from './ConversationStrip'
import type { ChatMessage, ChatSession } from '@/types/chat'

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getUser: vi.fn() } } }))
vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({ receipt: null, undo: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), proposals: [] }),
}))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => null }))

const voice = { available: false, active: false, status: 'idle', start: vi.fn(), stop: vi.fn() }
const msg = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({ id, role, content, timestamp: new Date() })
const session = (id: string, title: string): ChatSession =>
  ({ id, title, entityType: null, entityId: null, mode: 'chat', messages: [msg('m', 'user', title)], createdAt: new Date(), updatedAt: new Date() } as ChatSession)

describe('one chat pane on every page (2026-10-24)', () => {
  it('past conversations open from the clock, and New chat starts over', () => {
    const onLoad = vi.fn(), onNew = vi.fn()
    render(<ConversationStrip chatOnly panel messages={[msg('1', 'user', 'Hi'), msg('2', 'assistant', 'Hello.')]} onSend={vi.fn()} busy={false} voice={voice}
      history={{ sessions: [session('s1', 'Talk to Iris about Monday'), session('s2', 'Bathroom permit')], activeSessionId: 's1', onLoad, onNew }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
    fireEvent.click(screen.getByRole('button', { name: /Bathroom permit/ }))
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(onNew).toHaveBeenCalled()
  })

  it('the panel takes a file; the bar at a page’s foot does not', () => {
    const { rerender } = render(<ConversationStrip chatOnly panel messages={[]} onSend={vi.fn()} busy={false} voice={voice} />)
    expect(screen.getByRole('button', { name: 'Attach file' })).toBeInTheDocument()
    rerender(<ConversationStrip chatOnly docked messages={[]} onSend={vi.fn()} busy={false} voice={voice} />)
    expect(screen.queryByRole('button', { name: 'Attach file' })).not.toBeInTheDocument()
  })

  it('says what it is doing while it answers, and what an empty chat is about', () => {
    const { rerender } = render(<ConversationStrip chatOnly panel messages={[msg('1', 'user', 'Plan my week'), msg('2', 'assistant', '')]} onSend={vi.fn()} busy voice={voice}
      toolActivity={['symphony_read_week']} />)
    expect(screen.getByRole('status')).toHaveTextContent('read week…')
    rerender(<ConversationStrip chatOnly panel messages={[]} onSend={vi.fn()} busy={false} voice={voice} emptyHint="Ask about Call the plumber" />)
    expect(screen.getByText('Ask about Call the plumber')).toBeInTheDocument()
  })
})
