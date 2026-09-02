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
      sessions: [],
      sessionsLoading: false,
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      activeSessionId: null,
    }
  },
}))

const discussSend = vi.fn()
const discussSpy = vi.fn()
const discussState = vi.hoisted(() => ({
  threadId: 'thr-1' as string | null,
  error: null as string | null,
  messages: [] as Array<Record<string, unknown>>,
  participants: [] as string[],
}))

vi.mock('@/hooks/useDiscussThread', () => ({
  DISCUSS_UNAVAILABLE: "Discussion isn't available yet",
  useDiscussThread: (entity: unknown, opts: unknown) => {
    discussSpy(entity, opts)
    return {
      threadId: discussState.threadId,
      messages: discussState.messages,
      loading: false,
      sending: false,
      error: discussState.error,
      toolActivity: [],
      send: discussSend,
      participants: discussState.participants,
      reload: vi.fn(),
    }
  },
}))

vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [],
    getCurrentUserMember: () => ({ id: 'm1', name: 'Scott', auth_user_id: 'u1' }),
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}))

import { AssistDrawer } from './AssistDrawer'

const task = { id: 't1', title: 'Replace kitchen light bulbs', notes: null, projectName: null }
const discuss = { type: 'task' as const, id: 't1', title: 'Replace kitchen light bulbs', scope: 'compound' as const }

describe('AssistDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    discussState.threadId = 'thr-1'
    discussState.error = null
    discussState.messages = []
    discussState.participants = []
  })

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

  describe('Discuss mode', () => {
    it('opens the item shared thread with the scope it was handed', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(discussSpy).toHaveBeenCalledWith(discuss, expect.objectContaining({ taskContext: task }))
      expect(screen.getByRole('dialog', { name: 'Discuss Replace kitchen light bulbs' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Discussion' })).toBeInTheDocument()
    })

    it('sends into the shared thread, not the solo assistant', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      fireEvent.click(screen.getByRole('button', { name: 'Break this into doable steps' }))
      expect(discussSend).toHaveBeenCalledWith('Break this into doable steps')
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it("says the discussion isn't available yet when the ensure RPC failed", () => {
      discussState.threadId = null
      discussState.error = "Discussion isn't available yet"
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(screen.getByText("Discussion isn't available yet")).toBeInTheDocument()
      // No chat surface behind it — a broken chat is worse than a clear notice.
      expect(screen.queryByRole('heading', { name: 'Discussion' })).toBeNull()
    })

    it('renders the shared thread with its authors and participants', () => {
      discussState.participants = ['Scott', 'Iris']
      discussState.messages = [{
        id: 'm-0', role: 'user', content: 'Can you grab bulbs?', timestamp: new Date(),
        author: { id: 'u2', name: 'Iris', kind: 'member' },
      }]
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(screen.getByText('Can you grab bulbs?')).toBeInTheDocument()
      expect(screen.getByText('Iris')).toBeInTheDocument()
      expect(screen.getByLabelText('Participants').textContent).toBe('SI')
    })

    it('keeps the solo planning label when no discuss entity is given', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} />)
      expect(screen.getByRole('dialog', { name: 'Plan Replace kitchen light bulbs' })).toBeInTheDocument()
      expect(discussSpy).toHaveBeenCalledWith(null, expect.anything())
    })
  })
})
