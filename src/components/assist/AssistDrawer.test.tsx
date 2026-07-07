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

import { AssistDrawer } from './AssistDrawer'

const task = { id: 't1', title: 'Replace kitchen light bulbs', notes: null, projectName: null }

describe('AssistDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes the assistant to the item and shows its title', () => {
    const onMutate = vi.fn()
    render(<AssistDrawer item={task} onClose={vi.fn()} onMutate={onMutate} />)
    expect(hookSpy).toHaveBeenCalledWith(expect.objectContaining({ taskContext: task, onMutate }))
    expect(screen.getByText('Replace kitchen light bulbs')).toBeInTheDocument()
  })

  it('offers task planning suggestion chips that send', () => {
    render(<AssistDrawer item={task} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Break this into doable steps' }))
    expect(sendMessage).toHaveBeenCalledWith('Break this into doable steps')
  })

  it('offers routine suggestions for routine items', () => {
    render(<AssistDrawer item={{ id: 'r1', title: 'Kids laundry', kind: 'routine' }} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'What would make this routine stick?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Break this into doable steps' })).toBeNull()
  })

  it('closes via the backdrop', () => {
    const onClose = vi.fn()
    render(<AssistDrawer item={task} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close planning assistant' }))
    expect(onClose).toHaveBeenCalled()
  })
})
