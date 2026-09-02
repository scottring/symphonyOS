import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailReviewSheet } from './EmailReviewSheet'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { UnreviewedCapture } from '@/hooks/useUnreviewedCaptures'

const captures: UnreviewedCapture[] = [
  {
    id: 'cap-1',
    subject: 'Hillside Weekly Update',
    sourceLabel: 'Hillside Elementary',
    createdAt: new Date('2026-09-02T11:00:00Z'),
  },
  {
    id: 'cap-2',
    subject: 'Soccer sign-ups',
    sourceLabel: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
  },
]

const members: FamilyMember[] = [
  { id: 'm1', name: 'Liam', initials: 'LI', color: 'blue' } as unknown as FamilyMember,
]

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'x', completed: false,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Task
}

const tasks: Task[] = [
  task({
    id: 'p1', title: 'Field trip to the aquarium', captureId: 'cap-1',
    scheduledFor: new Date('2026-09-09T09:00:00'),
    subtasks: [
      task({ id: 's1', title: 'Pack a bag lunch', captureId: 'cap-1', parentTaskId: 'p1', assignedTo: 'm1' }),
    ],
  }),
  task({ id: 'p2', title: 'Sign the permission slip', captureId: 'cap-1' }),
  task({ id: 'p3', title: 'Register for soccer', captureId: 'cap-2' }),
  task({ id: 'other', title: 'Unrelated errand' }),
]

function renderSheet(over: Partial<Parameters<typeof EmailReviewSheet>[0]> = {}) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: members, lists: [],
  } as unknown as ScheduleActionsValue

  const props = {
    open: true,
    captures,
    tasks,
    members,
    onClose: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  }

  return {
    ...render(
      <ScheduleActionsProvider value={value}>
        <EmailReviewSheet {...props} />
      </ScheduleActionsProvider>,
    ),
    props,
    user: userEvent.setup(),
  }
}

describe('EmailReviewSheet', () => {
  it('renders nothing while closed', () => {
    const { container } = renderSheet({ open: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('groups rows under their capture, source label first', () => {
    renderSheet()

    const first = screen.getByRole('group', { name: /Hillside Elementary/ })
    expect(within(first).getByText('Field trip to the aquarium')).toBeInTheDocument()
    expect(within(first).getByText('Sign the permission slip')).toBeInTheDocument()
    expect(within(first).queryByText('Register for soccer')).not.toBeInTheDocument()

    // A capture with no source label falls back to its subject alone.
    const second = screen.getByRole('group', { name: 'Soccer sign-ups' })
    expect(within(second).getByText('Register for soccer')).toBeInTheDocument()
  })

  it('shows subtasks under their parent, never as top-level rows', () => {
    renderSheet()
    const parent = screen.getByTestId('email-review-row-p1')
    expect(within(parent).getByText('Pack a bag lunch')).toBeInTheDocument()
    expect(screen.queryByTestId('email-review-row-s1')).not.toBeInTheDocument()
  })

  it('leaves tasks from other sources out entirely', () => {
    renderSheet()
    expect(screen.queryByText('Unrelated errand')).not.toBeInTheDocument()
  })

  it('Dismiss reports the row to the host', async () => {
    const { props, user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Dismiss Field trip to the aquarium' }))
    expect(props.onDismiss).toHaveBeenCalledWith('p1')
  })

  it('hides a row the host is holding for undo', () => {
    renderSheet({ dismissedIds: ['p1'] })
    expect(screen.queryByTestId('email-review-row-p1')).not.toBeInTheDocument()
    expect(screen.getByTestId('email-review-row-p2')).toBeInTheDocument()
  })

  it('closing calls onClose', async () => {
    const { props, user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('offers the row rail’s own date control per row', () => {
    renderSheet()
    const parent = screen.getByTestId('email-review-row-p1')
    expect(within(parent).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
  })

  it('says where a row landed, and names the inbox when it has no date', () => {
    renderSheet()
    expect(within(screen.getByTestId('email-review-row-p2')).getByText('Inbox')).toBeInTheDocument()
  })
})
