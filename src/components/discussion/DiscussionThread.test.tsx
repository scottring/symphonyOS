import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionThread, type DiscussionThreadProps } from './DiscussionThread'

function renderThread(over: Partial<DiscussionThreadProps> = {}) {
  const props: DiscussionThreadProps = {
    title: 'Book the dentist',
    sharedWithLabel: 'Shared with Iris',
    scope: 'compound',
    messages: [],
    loading: false,
    sending: false,
    error: null,
    toolActivity: [],
    currentUserId: 'u1',
    familyMembers: [],
    suggestions: ['Break this into doable steps'],
    onPost: vi.fn(),
    onAsk: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  render(<DiscussionThread {...props} />)
  return props
}

describe('DiscussionThread', () => {
  it('says who is in the room up front', () => {
    renderThread()
    expect(screen.getByRole('heading', { name: 'Discussion' })).toBeInTheDocument()
    expect(screen.getByText('Book the dentist')).toBeInTheDocument()
    expect(screen.getByText('Shared with Iris')).toBeInTheDocument()
    expect(screen.getByText('Talk it through with Iris, or ask Symphony.')).toBeInTheDocument()
  })

  it('reads Only you on a private thread', () => {
    renderThread({ sharedWithLabel: 'Only you', scope: 'individual' })
    expect(screen.getByText('Only you')).toBeInTheDocument()
    expect(screen.getByText('Think it through here, or ask Symphony.')).toBeInTheDocument()
  })

  it('offers to share with the house when onShare is given', () => {
    const onShare = vi.fn()
    renderThread({ sharedWithLabel: 'Only you', scope: 'individual', onShare })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Family and share' }))
    expect(onShare).toHaveBeenCalled()
  })

  it('never offers to share when onShare is absent', () => {
    renderThread({ sharedWithLabel: 'Only you', scope: 'individual' })
    expect(screen.queryByRole('button', { name: 'Move to Family and share' })).not.toBeInTheDocument()
  })

  it('Enter posts to the people in the thread and never wakes Symphony', () => {
    const p = renderThread()
    const box = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(box, { target: { value: 'Can you take this one?' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(p.onPost).toHaveBeenCalledWith('Can you take this one?')
    expect(p.onAsk).not.toHaveBeenCalled()
    expect(box).toHaveValue('')
  })

  it('Ask Symphony sends the draft as a question', () => {
    const p = renderThread()
    const box = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(box, { target: { value: 'What should we do first?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(p.onAsk).toHaveBeenCalledWith('What should we do first?')
    expect(p.onPost).not.toHaveBeenCalled()
  })

  it('@Symphony routes Enter to ask with the mention stripped, and shows the hint', () => {
    const p = renderThread()
    const box = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(box, { target: { value: '@Symphony plan this' } })
    expect(screen.getByText('Symphony will answer')).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(p.onAsk).toHaveBeenCalledWith('plan this')
    expect(p.onPost).not.toHaveBeenCalled()
  })

  it('suggestion chips are Symphony asks', () => {
    const p = renderThread()
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
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalledTimes(2)
  })
})
