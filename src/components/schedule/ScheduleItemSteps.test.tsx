import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// The subtask chip is desktop-only (`hidden md:inline-flex`) and lives in the
// desktop render branch. ScheduleItem.test.tsx mocks useMobile to TRUE for the
// swipe-card tests, so the steps disclosure needs its own file on the desktop
// path.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

// The desktop branch reads the schedule-actions context; same stub the
// SkipButton desktop tests use.
vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({}),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const withSteps = {
  id: 'task-parent',
  type: 'task',
  title: 'Brainstorm vacation ideas + start exploring',
  completed: false,
  subtaskCount: 3,
  subtaskCompletedCount: 1,
  originalTask: {
    subtasks: [
      { id: 's1', title: 'Talk with Iris about the trip', completed: true },
      { id: 's2', title: 'Everyone writes down 2-3 ideas', completed: false },
      { id: 's3', title: 'Research top 3 destinations', completed: false },
    ],
  },
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const onSelect = vi.fn()
  const utils = render(
    <ScheduleItem
      item={{ ...withSteps, ...overrides }}
      onSelect={onSelect}
      onToggleComplete={vi.fn()}
    />,
  )
  return { ...utils, onSelect }
}

describe('ScheduleItem subtask steps', () => {
  it('is collapsed by default', () => {
    const { queryByText } = renderRow()
    expect(queryByText('Talk with Iris about the trip')).toBeNull()
  })

  it('shows the progress count on the toggle', () => {
    const { getByRole } = renderRow()
    expect(getByRole('button', { name: /3 steps/i })).toHaveTextContent('1/3')
  })

  it('expands and collapses the step list', () => {
    const { getByRole, getByText, queryByText } = renderRow()
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(getByText('Talk with Iris about the trip')).toBeInTheDocument()
    expect(getByText('Research top 3 destinations')).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(queryByText('Talk with Iris about the trip')).toBeNull()
  })

  it('expanding does not also open the detail panel', () => {
    const { getByRole, onSelect } = renderRow()
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders no toggle when the task has no steps', () => {
    const { queryByRole } = renderRow({
      subtaskCount: 0, subtaskCompletedCount: 0,
    } as Partial<TimelineItem>)
    expect(queryByRole('button', { name: /steps/i })).toBeNull()
  })
})

// Per-person items (spec §4.4) are always-open, never a disclosure: the point
// of the block is who has to do what. They replace the steps chip on the rows
// that have them; plain steps rows (above) are untouched.
describe('ScheduleItem per-person items (desktop)', () => {
  const emailBlock = {
    ...withSteps,
    id: 'task-picture-day',
    title: 'Picture Day',
    captureId: 'cap-1',
    subtaskCount: 2,
    subtaskCompletedCount: 0,
    originalTask: {
      id: 'picture-day',
      subtasks: [
        { id: 's1', title: 'Wear a collared shirt', completed: false, assignedTo: 'm-liam' },
        { id: 's2', title: 'Bring the order form', completed: false, assignedTo: 'm-mia' },
      ],
    },
  } as unknown as TimelineItem

  it('renders the items without any disclosure, and drops the steps chip', () => {
    const { getByText, queryByRole } = render(
      <ScheduleItem item={emailBlock} onSelect={vi.fn()} onToggleComplete={vi.fn()} />,
    )
    expect(getByText('Wear a collared shirt')).toBeInTheDocument()
    expect(getByText('Bring the order form')).toBeInTheDocument()
    expect(queryByRole('button', { name: /steps/i })).toBeNull()
  })

  it('shows the "From an email" badge', () => {
    const { getByText } = render(
      <ScheduleItem item={emailBlock} onSelect={vi.fn()} onToggleComplete={vi.fn()} />,
    )
    expect(getByText('From an email')).toBeInTheDocument()
  })
})
