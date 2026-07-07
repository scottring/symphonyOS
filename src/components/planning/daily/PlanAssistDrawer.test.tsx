import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const sendMessage = vi.fn()
const hookSpy = vi.fn()

vi.mock('@/hooks/useSymphonyAssistant', () => ({
  useSymphonyAssistant: (opts: unknown) => {
    hookSpy(opts)
    return {
      messages: [],
      loading: false,
      error: null,
      toolActivity: [],
      sendMessage,
      resetSession: vi.fn(),
    }
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}))

import { PlanAssistDrawer } from './PlanAssistDrawer'

const task = { id: 't1', title: 'Replace kitchen light bulbs', notes: null, projectName: null }

describe('PlanAssistDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes the assistant to the task and shows its title', () => {
    const onMutate = vi.fn()
    render(<PlanAssistDrawer task={task} onClose={vi.fn()} onMutate={onMutate} />)
    expect(hookSpy).toHaveBeenCalledWith(expect.objectContaining({ taskContext: task, onMutate }))
    expect(screen.getByText('Replace kitchen light bulbs')).toBeInTheDocument()
  })

  it('offers planning suggestion chips that send', () => {
    render(<PlanAssistDrawer task={task} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Break this into doable steps' }))
    expect(sendMessage).toHaveBeenCalledWith('Break this into doable steps')
  })

  it('closes via the backdrop', () => {
    const onClose = vi.fn()
    render(<PlanAssistDrawer task={task} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close planning assistant' }))
    expect(onClose).toHaveBeenCalled()
  })
})
