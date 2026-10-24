import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationStrip } from './ConversationStrip'
import type { ChatMessage } from '@/types/chat'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))
vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({ receipt: null, undo: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), proposals: [] }),
}))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => null }))

const voice = { available: false, active: false, status: 'idle', start: vi.fn(), stop: vi.fn() }
const msg = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({ id, role, content, timestamp: new Date() })
const asked = [
  msg('1', 'user', 'Make me a weekly paper mail routine.'),
  msg('2', 'assistant', 'A couple of questions before I build this out:\n\n1. What day and time do you want to do the weekly processing?\n2. What are the steps you follow?'),
]

describe('ideas for a question Symphony asked (the lightbulb, 2026-10-24)', () => {
  beforeEach(() => invoke.mockReset())

  it('nothing is suggested until the lightbulb is tapped; a tapped idea goes into the reply', async () => {
    invoke.mockResolvedValue({ data: { ideas: [{ answer: 'Sunday at 7pm', why: 'Start the week clear' }, { answer: 'Friday after work', why: 'Close out the week' }] }, error: null })
    render(<ConversationStrip chatOnly panel messages={asked} onSend={vi.fn()} busy={false} voice={voice} />)
    const bulbs = screen.getAllByRole('button', { name: /^Ideas for/ })
    expect(bulbs).toHaveLength(2)
    expect(invoke).not.toHaveBeenCalled()

    fireEvent.click(bulbs[0])
    expect(invoke).toHaveBeenCalledWith('question-ideas', { body: expect.objectContaining({
      question: 'What day and time do you want to do the weekly processing?',
      conversation: [{ role: 'user', content: 'Make me a weekly paper mail routine.' }, { role: 'assistant', content: asked[1].content }],
    }) })
    fireEvent.click(await screen.findByRole('button', { name: /Sunday at 7pm/ }))
    expect(screen.getByLabelText('Message Symphony')).toHaveValue('1. Sunday at 7pm')
  })

  it('only the latest reply, and not while Symphony is still answering', () => {
    const later = [...asked, msg('3', 'user', 'Sunday'), msg('4', 'assistant', 'Thanks. What comes first?')]
    const { rerender } = render(<ConversationStrip chatOnly panel messages={later} onSend={vi.fn()} busy={false} voice={voice} />)
    expect(screen.getAllByRole('button', { name: /^Ideas for/ })).toHaveLength(1)
    rerender(<ConversationStrip chatOnly panel messages={later} onSend={vi.fn()} busy voice={voice} />)
    expect(screen.queryByRole('button', { name: /^Ideas for/ })).not.toBeInTheDocument()
  })

  it('says so when no ideas come back, with Try again', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('429') })
    render(<ConversationStrip chatOnly panel messages={asked} onSend={vi.fn()} busy={false} voice={voice} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Ideas for/ })[1])
    expect(await screen.findByText(/No ideas just now/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
