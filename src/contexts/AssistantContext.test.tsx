import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { AssistantProvider, useAssistant } from './AssistantContext'

// Drive the agent without touching the network: resolve one assistant turn.
vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(async (_messages, handlers) => {
    handlers.onText('pack sunscreen')
    handlers.onDone('pack sunscreen', 'session-1', undefined)
  }),
}))

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

/** Two independent consumers of the context, to prove they share one instance. */
function ConsumerA() {
  const { messages, sendMessage, open, setOpen } = useAssistant()
  return (
    <div>
      <button onClick={() => void sendMessage('what should I pack?')}>send-a</button>
      <button onClick={() => setOpen(true)}>open-a</button>
      <span data-testid="a-count">{messages.length}</span>
      <span data-testid="a-open">{String(open)}</span>
    </div>
  )
}

function ConsumerB() {
  const { messages, open } = useAssistant()
  return (
    <div>
      <span data-testid="b-count">{messages.length}</span>
      <span data-testid="b-open">{String(open)}</span>
      <span data-testid="b-text">{messages.map((m) => m.content).join('|')}</span>
    </div>
  )
}

function renderShared() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <AssistantProvider>
        <ConsumerA />
        <ConsumerB />
      </AssistantProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => { localStorage.clear() })

describe('AssistantProvider', () => {
  it('shares one conversation across consumers', async () => {
    renderShared()
    expect(screen.getByTestId('b-count').textContent).toBe('0')
    await act(async () => { screen.getByText('send-a').click() })
    // user turn + assistant turn, visible to the consumer that never sent.
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    expect(screen.getByTestId('b-text').textContent).toContain('pack sunscreen')
    expect(screen.getByTestId('a-count').textContent).toBe('2')
  })

  it('shares the open state across consumers', async () => {
    renderShared()
    expect(screen.getByTestId('b-open').textContent).toBe('false')
    await act(async () => { screen.getByText('open-a').click() })
    expect(screen.getByTestId('b-open').textContent).toBe('true')
  })

  it('persists desktop open state to the existing scratchpad key', async () => {
    renderShared()
    await act(async () => { screen.getByText('open-a').click() })
    expect(localStorage.getItem('symphony-scratchpad-hidden')).toBe('0')
  })

  it('starts closed when the key is absent', () => {
    renderShared()
    expect(screen.getByTestId('a-open').textContent).toBe('false')
  })

  it('keeps the conversation across a route change', async () => {
    function Navigator() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/projects')}>go</button>
    }
    render(
      <MemoryRouter initialEntries={['/today']}>
        <AssistantProvider>
          <ConsumerA />
          <Navigator />
          <Routes>
            <Route path="/today" element={<ConsumerB />} />
            <Route path="/projects" element={<ConsumerB />} />
          </Routes>
        </AssistantProvider>
      </MemoryRouter>,
    )
    await act(async () => { screen.getByText('send-a').click() })
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    await act(async () => { screen.getByText('go').click() })
    // THE BUG THIS FIXES: the transcript survives navigation.
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    expect(screen.getByTestId('b-text').textContent).toContain('pack sunscreen')
  })
})

describe('useAssistant outside the provider', () => {
  it('throws', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ConsumerB />)).toThrow(/AssistantProvider/)
    quiet.mockRestore()
  })
})
