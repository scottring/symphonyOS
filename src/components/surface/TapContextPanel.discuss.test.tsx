// The Discussion action on the task panel: it says "Discussion", and the scope it
// hands the drawer is DERIVED from the task (scopeForDomain), never a literal.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { createMockTask } from '@/test/mocks/factories'

const drawerProps = vi.fn()

vi.mock('@/components/assist/AssistDrawer', () => ({
  AssistDrawer: (props: Record<string, unknown>) => {
    drawerProps(props)
    return <div data-testid="assist-drawer" />
  },
}))

vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [],
    getMember: () => undefined,
    getCurrentUserMember: () => ({ id: 'm-self', name: 'Scott', auth_user_id: 'u1' }),
  }),
}))

import { TapContextPanel } from './TapContextPanel'

const handlers = {
  onClose: vi.fn(),
  onTitleChange: vi.fn(),
  onNotesChange: vi.fn(),
  onToggleComplete: vi.fn(),
  onSchedule: vi.fn(),
  isPinned: false,
  onTogglePin: vi.fn(),
  onDelete: vi.fn(),
  onOpenContact: vi.fn(),
  onOpenMember: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenEvent: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenRelated: vi.fn(),
  onToggleSubtask: vi.fn(),
  onAddSubtask: vi.fn(),
  onAddLink: vi.fn(),
  onContextChange: vi.fn(),
  onAssigneesChange: vi.fn(),
  onAssistMutate: vi.fn(),
}

function renderPanel(task: ReturnType<typeof createMockTask>) {
  return render(<TapContextPanel
    task={task}
    contacts={[]} projects={[]} events={[]} familyMembers={[]}
    siblingTaskCandidates={[]} allTasks={[task]}
    {...handlers}
  />)
}

describe('TapContextPanel Discuss action', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('labels the action Discuss', () => {
    renderPanel(createMockTask({ title: 'Book the dentist' }))
    expect(screen.getByRole('button', { name: 'Discussion' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Help me plan' })).toBeNull()
  })

  it('passes compound scope for a family task', () => {
    const task = createMockTask({ id: 't1', title: 'Book the dentist', context: 'family' })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    expect(drawerProps).toHaveBeenCalledWith(expect.objectContaining({
      discuss: { type: 'task', id: 't1', title: 'Book the dentist', scope: 'compound' },
    }))
  })

  it('passes individual scope for a personal task assigned only to self', () => {
    const task = createMockTask({
      id: 't2', title: 'Renew passport', context: 'personal', assignedTo: 'm-self',
    })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    expect(drawerProps).toHaveBeenCalledWith(expect.objectContaining({
      discuss: expect.objectContaining({ scope: 'individual' }),
    }))
  })

  it('passes couple scope for a personal task handed to the partner', () => {
    const task = createMockTask({
      id: 't3', title: 'Call the plumber', context: 'personal', assignedTo: 'm-iris',
    })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    expect(drawerProps).toHaveBeenCalledWith(expect.objectContaining({
      discuss: expect.objectContaining({ scope: 'couple' }),
    }))
  })

  // Sharing a private thread MOVES the task into Family — that is what lets
  // the house read it. So the offer only exists where a domain change is not
  // a surprise, and the button says what it does ("Move to Family and share").
  const lastDrawerProps = () =>
    drawerProps.mock.calls[drawerProps.mock.calls.length - 1][0] as { onShare?: () => void }

  it('offers the move on a task tagged Family', () => {
    const task = createMockTask({ id: 't4', title: 'Renew passport', context: 'family', assignedTo: 'm-self' })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    lastDrawerProps().onShare?.()
    expect(handlers.onContextChange).toHaveBeenCalledWith('family')
  })

  it('offers the move on an untagged task', () => {
    const task = createMockTask({ id: 't5', title: 'Renew passport', context: null, assignedTo: 'm-self' })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    lastDrawerProps().onShare?.()
    expect(handlers.onContextChange).toHaveBeenCalledWith('family')
  })

  it('makes NO offer on a Personal task — its domain is not ours to change', () => {
    const task = createMockTask({ id: 't6', title: 'Renew passport', context: 'personal', assignedTo: 'm-self' })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    expect(lastDrawerProps().onShare).toBeUndefined()
    expect(handlers.onContextChange).not.toHaveBeenCalled()
  })

  it('makes NO offer on a Work task', () => {
    const task = createMockTask({ id: 't7', title: 'Renew passport', context: 'work', assignedTo: 'm-self' })
    renderPanel(task)
    fireEvent.click(screen.getByRole('button', { name: 'Discussion' }))
    expect(lastDrawerProps().onShare).toBeUndefined()
  })
})
