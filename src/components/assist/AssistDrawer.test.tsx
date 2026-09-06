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

const discussPost = vi.fn()
const discussAsk = vi.fn()
const discussSpy = vi.fn()
const discussState = vi.hoisted(() => ({
  threadId: 'thr-1' as string | null,
  error: null as string | null,
  messages: [] as Array<Record<string, unknown>>,
  participants: [] as string[],
  sharedWith: [] as string[],
  selfAuthId: 'u1' as string | null,
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
      post: discussPost,
      ask: discussAsk,
      participants: discussState.participants,
      sharedWith: discussState.sharedWith,
      selfAuthId: discussState.selfAuthId,
      reload: vi.fn(),
    }
  },
}))

const familyMembersState = vi.hoisted(() => ({
  members: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    // The household creator's own row carries a NULL auth_user_id — the drawer
    // must not use it to decide which bubbles are the viewer's own.
    members: familyMembersState.members,
    getCurrentUserMember: () => ({ id: 'm1', name: 'Scott', auth_user_id: null, user_id: 'u1' }),
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
    discussState.sharedWith = []
    discussState.selfAuthId = 'u1'
    familyMembersState.members = []
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

    it('marks the thread read while it is open', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(discussSpy).toHaveBeenCalledWith(discuss, expect.objectContaining({ markRead: true }))
    })

    it('suggestion chips ask Symphony in the shared thread, not the solo assistant', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      fireEvent.click(screen.getByRole('button', { name: 'Break this into doable steps' }))
      expect(discussAsk).toHaveBeenCalledWith('Break this into doable steps')
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('a typed message posts to the people in the thread and never wakes Symphony', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      const box = screen.getByRole('textbox', { name: 'Message' })
      fireEvent.change(box, { target: { value: 'Iris, can you grab these?' } })
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(discussPost).toHaveBeenCalledWith('Iris, can you grab these?')
      expect(discussAsk).not.toHaveBeenCalled()
    })

    it("says the discussion isn't available yet when the ensure RPC failed", () => {
      discussState.threadId = null
      discussState.error = "Discussion isn't available yet"
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(screen.getByText("Discussion isn't available yet")).toBeInTheDocument()
      // No chat surface behind it — a broken chat is worse than a clear notice.
      expect(screen.queryByRole('heading', { name: 'Discussion' })).toBeNull()
    })

    it('renders the shared thread with its authors and says who can see it', () => {
      discussState.sharedWith = ['Iris']
      discussState.messages = [{
        id: 'm-0', role: 'user', content: 'Can you grab bulbs?', timestamp: new Date(),
        author: { id: 'u2', name: 'Iris', kind: 'member' },
      }]
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(screen.getByText('Can you grab bulbs?')).toBeInTheDocument()
      expect(screen.getByText('Iris')).toBeInTheDocument()
      expect(screen.getByText('Shared with Iris')).toBeInTheDocument()
    })

    it('keeps the solo planning label when no discuss entity is given', () => {
      render(<AssistDrawer item={task} onClose={vi.fn()} />)
      expect(screen.getByRole('dialog', { name: 'Plan Replace kitchen light bulbs' })).toBeInTheDocument()
      expect(discussSpy).toHaveBeenCalledWith(null, expect.anything())
    })

    it("puts the viewer's own messages on the right, even as the household creator", () => {
      // Scott's member row has auth_user_id null; his auth id is u1. Reading
      // "mine" off the member row would put his own words on the partner side.
      discussState.messages = [{
        id: 'm-0', role: 'user', content: 'On it.', timestamp: new Date(),
        author: { id: 'u1', name: 'Scott', kind: 'member' },
      }]
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} />)
      expect(screen.getByText('On it.').closest('.flex')?.className).toContain('justify-end')
    })

    it('offers to share a private thread with the house when the host supplies onShare', () => {
      familyMembersState.members = [
        { id: 'm1', name: 'Scott', auth_user_id: null, user_id: 'u1', is_full_user: true },
        { id: 'm2', name: 'Iris', auth_user_id: 'u2', user_id: 'u1', is_full_user: false },
      ]
      const onShare = vi.fn()
      render(
        <AssistDrawer
          item={task}
          onClose={vi.fn()}
          discuss={{ ...discuss, scope: 'individual' }}
          onShare={onShare}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Share with the house' }))
      expect(onShare).toHaveBeenCalled()
    })

    it('does not offer to share when the thread is already shared', () => {
      familyMembersState.members = [
        { id: 'm1', name: 'Scott', auth_user_id: null, user_id: 'u1', is_full_user: true },
        { id: 'm2', name: 'Iris', auth_user_id: 'u2', user_id: 'u1', is_full_user: false },
      ]
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={discuss} onShare={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Share with the house' })).not.toBeInTheDocument()
    })

    it('does not offer to share when nobody else in the house has a login', () => {
      familyMembersState.members = [
        { id: 'm1', name: 'Scott', auth_user_id: null, user_id: 'u1', is_full_user: true },
      ]
      render(
        <AssistDrawer
          item={task}
          onClose={vi.fn()}
          discuss={{ ...discuss, scope: 'individual' }}
          onShare={vi.fn()}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Share with the house' })).not.toBeInTheDocument()
    })

    it('does not offer to share when the host gives no onShare handler', () => {
      familyMembersState.members = [
        { id: 'm1', name: 'Scott', auth_user_id: null, user_id: 'u1', is_full_user: true },
        { id: 'm2', name: 'Iris', auth_user_id: 'u2', user_id: 'u1', is_full_user: false },
      ]
      render(<AssistDrawer item={task} onClose={vi.fn()} discuss={{ ...discuss, scope: 'individual' }} />)
      expect(screen.queryByRole('button', { name: 'Share with the house' })).not.toBeInTheDocument()
    })
  })
})
