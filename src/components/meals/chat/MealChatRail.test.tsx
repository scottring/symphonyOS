import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MealChatRail } from './MealChatRail'
import type { ChatMsg } from '@/hooks/useMealPlannerChat'

describe('MealChatRail', () => {
  it('disables the input and send button while busy', () => {
    render(<MealChatRail messages={[]} busy toolActivity={null} onSend={vi.fn()} />)
    expect(screen.getByLabelText('Message the meal planner')).toBeDisabled()
    expect(screen.getByLabelText('Send')).toBeDisabled()
  })

  it('renders a fallback when a finished assistant message has empty content', () => {
    const messages: ChatMsg[] = [
      { role: 'user', content: 'plan the week' },
      { role: 'assistant', content: '', pending: false },
    ]
    render(<MealChatRail messages={messages} busy={false} toolActivity={null} onSend={vi.fn()} />)
    expect(screen.getByText('Done — check the plan.')).toBeInTheDocument()
  })

  it('shows a thinking spinner for a pending message with no content yet', () => {
    const messages: ChatMsg[] = [
      { role: 'user', content: 'plan the week' },
      { role: 'assistant', content: '', pending: true },
    ]
    render(<MealChatRail messages={messages} busy toolActivity={null} onSend={vi.fn()} />)
    expect(screen.getByLabelText('Thinking…')).toBeInTheDocument()
  })

  it('shows an "updating the plan" indicator while a tool is active', () => {
    render(<MealChatRail messages={[]} busy toolActivity="set_slot" onSend={vi.fn()} />)
    expect(screen.getByText(/updating the plan/)).toBeInTheDocument()
  })

  it('calls onSend with the trimmed draft and clears the input', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<MealChatRail messages={[]} busy={false} toolActivity={null} onSend={onSend} />)
    const input = screen.getByLabelText('Message the meal planner')
    await user.type(input, '  taco tuesday  ')
    await user.click(screen.getByLabelText('Send'))
    expect(onSend).toHaveBeenCalledWith('taco tuesday')
    expect(input).toHaveValue('')
  })

  it('renders a "Plan my week" button in the empty state', () => {
    render(<MealChatRail messages={[]} busy={false} toolActivity={null} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /plan my week/i })).toBeInTheDocument()
  })

  it('calls onSend with a planning message when "Plan my week" is clicked', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<MealChatRail messages={[]} busy={false} toolActivity={null} onSend={onSend} />)
    await user.click(screen.getByRole('button', { name: /plan my week/i }))
    expect(onSend).toHaveBeenCalledWith('Plan my week — propose a seasonal menu for the week.')
  })

  it('hides the "Plan my week" button once the conversation has messages', () => {
    const messages: ChatMsg[] = [{ role: 'user', content: 'taco tuesday' }]
    render(<MealChatRail messages={messages} busy={false} toolActivity={null} onSend={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /plan my week/i })).not.toBeInTheDocument()
  })

  it('disables the "Plan my week" button while busy', () => {
    render(<MealChatRail messages={[]} busy toolActivity={null} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /plan my week/i })).toBeDisabled()
  })
})
