import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { DiscussionThread, type DiscussionThreadProps } from './DiscussionThread'

function renderThread(over: Partial<DiscussionThreadProps> = {}) {
  const props: DiscussionThreadProps = {
    title: 'Book the dentist',
    scope: 'compound',
    peopleLabel: 'You and Iris',
    stateLabel: 'New',
    others: ['Iris'],
    messages: [],
    loading: false,
    sending: false,
    error: null,
    toolActivity: [],
    currentUserId: 'u1',
    familyMembers: [],
    suggestions: ['Break this into doable steps'],
    choices: [{ id: 'u2', name: 'Iris' }],
    chosen: ['u2'],
    onChoose: vi.fn(),
    onPost: vi.fn(),
    onAsk: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  render(<DiscussionThread {...props} />)
  return props
}

const box = () => screen.getByRole('textbox', { name: /^Message/ })

// Scott, 2026-10-14: "it's not at all clear who I'm chatting with".
describe('DiscussionThread', () => {
  it('names the people, whose turn it is and what it is about; the box says who it goes to', () => {
    renderThread({ stateLabel: 'Waiting on Iris', messages: [
      { id: 'a', role: 'user', content: 'Iris, we need to review these days', timestamp: new Date(), author: { id: 'u1', name: 'Scott', kind: 'member' } },
    ], seen: 'Not seen yet' })
    expect(screen.getByRole('heading', { name: 'You and Iris' })).toBeInTheDocument()
    expect(screen.getByText('Waiting on Iris')).toBeInTheDocument()
    expect(screen.getByText('Book the dentist')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message Iris' })).toHaveAttribute('placeholder', 'Message Iris…')
    expect(screen.getByText('Not seen yet')).toBeInTheDocument()
  })

  it('a new discussion starts by choosing who it is with', () => {
    const p = renderThread()
    expect(screen.getByRole('group', { name: 'Talk about this with' })).toBeInTheDocument()
    const iris = screen.getByRole('button', { name: 'Iris' })
    expect(iris).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(iris)
    expect(p.onChoose).toHaveBeenCalledWith([])
    // A family item's thread is the household's already: no "Just Symphony".
    expect(screen.queryByRole('button', { name: /Just Symphony/ })).toBeNull()
  })

  it('on a private item, says Iris sees the conversation and its name, not the item; Just Symphony keeps it private', () => {
    const p = renderThread({ scope: 'individual' })
    expect(screen.getByText('Iris will see this conversation and the name of this item, not the item itself.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Just Symphony/ }))
    expect(p.onChoose).toHaveBeenCalledWith([])
  })

  it('Mark settled asks what was decided, then settles; settled shows who and Reopen', async () => {
    const onSettle = vi.fn(async () => true)
    const onReopen = vi.fn()
    const msgs = [{ id: 'a', role: 'user' as const, content: 'review these', timestamp: new Date(), author: { id: 'u1', name: 'Scott', kind: 'member' as const } }]
    renderThread({ messages: msgs, onSettle })
    fireEvent.click(screen.getByRole('button', { name: 'Mark settled' }))
    fireEvent.change(screen.getByLabelText(/What did you decide/), { target: { value: 'Nov 6 and 16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark settled' }))
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith('Nov 6 and 16'))
    cleanup()
    renderThread({ messages: msgs, onSettle, onReopen, settled: { by: 'Iris', outcome: 'Nov 6 and 16' } })
    expect(screen.getByText('Settled by Iris')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(onReopen).toHaveBeenCalled()
  })

  it('Enter posts to the people in the thread and never wakes Symphony', () => {
    const p = renderThread()
    fireEvent.change(box(), { target: { value: 'Can you take this one?' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(p.onPost).toHaveBeenCalledWith('Can you take this one?')
    expect(p.onAsk).not.toHaveBeenCalled()
    expect(box()).toHaveValue('')
  })

  it('a send that was not stored puts the draft back', async () => {
    renderThread({ onPost: vi.fn(async () => false) })
    fireEvent.change(box(), { target: { value: 'Can you take this one?' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(box()).toHaveValue('Can you take this one?'))
  })

  it('Ask Symphony sends the draft as a question', () => {
    const p = renderThread()
    fireEvent.change(box(), { target: { value: 'What should we do first?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(p.onAsk).toHaveBeenCalledWith('What should we do first?')
    expect(p.onPost).not.toHaveBeenCalled()
  })

  it('@Symphony routes Enter to ask with the mention stripped, and shows the hint', () => {
    const p = renderThread()
    fireEvent.change(box(), { target: { value: '@Symphony plan this' } })
    expect(screen.getByText('Symphony will answer')).toBeInTheDocument()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(p.onAsk).toHaveBeenCalledWith('plan this')
    expect(p.onPost).not.toHaveBeenCalled()
  })

  it('suggestion chips are Symphony asks', () => {
    const p = renderThread({ others: [], choices: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Break this into doable steps' }))
    expect(p.onAsk).toHaveBeenCalledWith('Break this into doable steps')
  })

  it('renders the partner message on the left with a name and mine on the right', () => {
    renderThread({
      messages: [
        { id: 'a', role: 'user', content: 'Can you grab bulbs?', timestamp: new Date(), author: { id: 'u2', name: 'Iris', kind: 'member' } },
        { id: 'b', role: 'user', content: 'On it.', timestamp: new Date(), author: { id: 'u1', name: 'Scott', kind: 'member' } },
      ],
    })
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('Can you grab bulbs?').closest('.flex')?.className).toContain('justify-start')
    expect(screen.getByText('On it.').closest('.flex')?.className).toContain('justify-end')
  })

  it('shows Symphony thinking only after an ask, while the reply is pending', () => {
    renderThread({
      sending: true,
      messages: [
        { id: 'a', role: 'user', content: 'plan this', timestamp: new Date(), author: { id: 'u1', name: 'Scott', kind: 'member' }, askedSymphony: true },
      ],
    })
    expect(screen.getByLabelText('Symphony is thinking')).toBeInTheDocument()
  })

  it('does not show thinking after a plain post', () => {
    renderThread({
      sending: true,
      messages: [
        { id: 'a', role: 'user', content: 'hi', timestamp: new Date(), author: { id: 'u1', name: 'Scott', kind: 'member' } },
      ],
    })
    expect(screen.queryByLabelText('Symphony is thinking')).toBeNull()
  })

  it('closes from the header and on Escape', () => {
    const p = renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Close discussion' }))
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalledTimes(2)
  })
})
