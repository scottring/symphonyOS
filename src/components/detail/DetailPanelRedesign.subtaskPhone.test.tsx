import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import { DetailPanelRedesign } from './DetailPanelRedesign'

// Subtask phone numbers used to render as a bare <span> — everywhere else in
// the app a phone number is a tap-to-call tel: link. This guards the fix at
// DetailPanelRedesign.tsx (subtask context preview).
//
// DetailPanelRedesign unconditionally calls useEventDiscussionFlags on mount,
// which hits getAuthUser — not part of the global @/lib/supabase test mock.
// Stub it out; this test is only exercising the subtask phone rendering.
vi.mock('@/hooks/useEventDiscussionFlags', () => ({
  useEventDiscussionFlags: () => ({
    flags: [],
    flagsByBaseId: new Map(),
    loading: false,
    isFlagged: () => false,
    getFlag: () => undefined,
    flagEvent: vi.fn(),
    unflagEvent: vi.fn(),
    updateNote: vi.fn(),
  }),
}))

function makeParentTask(subtask: Partial<Task>): Task {
  return {
    id: 'parent-1',
    title: 'Plan the move',
    completed: false,
    subtasks: [
      {
        id: 'sub-1',
        title: 'Call the movers',
        completed: false,
        ...subtask,
      } as Task,
    ],
  } as unknown as Task
}

function makeItem(subtask: Partial<Task>): TimelineItem {
  const originalTask = makeParentTask(subtask)
  return {
    id: `task-${originalTask.id}`,
    type: 'task',
    title: originalTask.title,
    startTime: null,
    endTime: null,
    completed: false,
    originalTask,
  } as TimelineItem
}

describe('DetailPanelRedesign — subtask phone number', () => {
  it('renders the subtask phone number as a tel: link', () => {
    render(
      <DetailPanelRedesign
        item={makeItem({ phoneNumber: '(555) 123-4567' })}
        onClose={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: '(555) 123-4567' })
    expect(link).toHaveAttribute('href', 'tel:5551234567')
  })

  it('strips non-dialable characters the same way PanelReach does, keeping a leading +', () => {
    render(
      <DetailPanelRedesign
        item={makeItem({ phoneNumber: '+1 (555) 123-4567' })}
        onClose={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: '+1 (555) 123-4567' })
    expect(link).toHaveAttribute('href', 'tel:+15551234567')
  })
})
