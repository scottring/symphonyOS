import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationStrip } from './ConversationStrip'
import type { ChatMessage } from '@/types/chat'

vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({ receipt: null, undo: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), proposals: [] }),
}))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => null }))

const voice = { available: true, active: false, status: 'idle', start: vi.fn(), stop: vi.fn(), mute: vi.fn() }
const msg = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({ id, role, content, timestamp: new Date() })

describe('docked conversation bar (approved Season board, 2026-10-10)', () => {
  it('is the one conversation: walk, field and mic, no way off to a side pane', () => {
    const onSend = vi.fn()
    render(<ConversationStrip docked messages={[]} walk={{ label: 'Plan this season with me', message: 'Let us plan' }} onSend={onSend} busy={false} voice={voice} />)
    expect(screen.queryByRole('button', { name: 'Open the conversation' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Talk with Symphony' })).toBeInTheDocument()
    // Send appears once there is something to send.
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message Symphony'), { target: { value: 'Add a picnic' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plan this season with me' }))
    expect(onSend).toHaveBeenCalledWith('Let us plan')
  })

  it('offers the page\'s talk as a suggestion, the mic as an icon, and no page help (2026-10-14)', () => {
    render(<ConversationStrip docked messages={[]} walk={{ label: 'Plan the rest of my week', message: 'Plan the rest of my week.' }} onSend={vi.fn()} busy={false} voice={voice} />)
    expect(screen.getByText(/Suggested:/)).toContainElement(screen.getByRole('button', { name: 'Plan the rest of my week' }))
    expect(screen.getByRole('button', { name: 'Talk with Symphony' })).not.toHaveTextContent('Talk')
    expect(screen.queryByRole('button', { name: 'What is this page?' })).not.toBeInTheDocument()
  })

  it('shows the latest exchange above the field, with Earlier for the rest', () => {
    const messages = [msg('1', 'user', 'First ask'), msg('2', 'assistant', 'First answer'), msg('3', 'user', 'Second ask'), msg('4', 'assistant', 'Second answer')]
    render(<ConversationStrip docked messages={messages} onSend={vi.fn()} busy={false} voice={voice} />)
    expect(screen.getByText('Second ask')).toBeInTheDocument()
    expect(screen.getByText('Second answer')).toBeInTheDocument()
    expect(screen.queryByText('First answer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }))
    expect(screen.getByText('First answer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide the conversation' }))
    expect(screen.queryByText('Second answer')).not.toBeInTheDocument()
  })

  it('says it is thinking while the reply is on its way, and shows live voice words', () => {
    const { rerender } = render(<ConversationStrip docked messages={[msg('1', 'user', 'Ask'), msg('2', 'assistant', '')]} onSend={vi.fn()} busy voice={voice} />)
    expect(screen.getByRole('status')).toHaveTextContent('Symphony is thinking…')
    rerender(<ConversationStrip docked messages={[]} onSend={vi.fn()} busy={false} voice={{ ...voice, active: true, status: 'live', heard: 'Add a picnic', reply: 'Saved.' }} />)
    expect(screen.getByText('Add a picnic')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End voice conversation' })).toBeInTheDocument()
  })
})
