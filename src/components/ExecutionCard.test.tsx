import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ExecutionCard } from './ExecutionCard'
import type { TimelineItem } from '@/types/timeline'

describe('ExecutionCard', () => {
  const baseTask: TimelineItem = {
    id: 'task-1',
    type: 'task',
    title: 'Test Task',
    startTime: null,
    endTime: null,
    completed: false,
  }

  const baseEvent: TimelineItem = {
    id: 'event-1',
    type: 'event',
    title: 'Test Event',
    startTime: new Date('2024-01-15T10:00:00'),
    endTime: new Date('2024-01-15T11:00:00'),
    completed: false,
  }

  it('renders task title', () => {
    render(<ExecutionCard item={baseTask} />)
    expect(screen.getByText('Test Task')).toBeInTheDocument()
  })

  it('renders event title', () => {
    render(<ExecutionCard item={baseEvent} />)
    expect(screen.getByText('Test Event')).toBeInTheDocument()
  })

  it('shows checkbox for tasks', () => {
    render(<ExecutionCard item={baseTask} />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('does not show checkbox for events', () => {
    render(<ExecutionCard item={baseEvent} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows unscheduled label for tasks without time', () => {
    render(<ExecutionCard item={baseTask} />)
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
  })

  it('shows time range for events', () => {
    render(<ExecutionCard item={baseEvent} />)
    expect(screen.getByText('10:00 AM - 11:00 AM')).toBeInTheDocument()
  })

  it('shows All day for all-day events', () => {
    const allDayEvent: TimelineItem = {
      ...baseEvent,
      allDay: true,
    }
    render(<ExecutionCard item={allDayEvent} />)
    expect(screen.getByText('All day')).toBeInTheDocument()
  })

  it('shows notes when present', () => {
    const taskWithNotes: TimelineItem = {
      ...baseTask,
      notes: 'Important notes here',
    }
    render(<ExecutionCard item={taskWithNotes} />)
    expect(screen.getByText('Important notes here')).toBeInTheDocument()
  })

  it('shows phone number with Call and Text buttons', () => {
    const taskWithPhone: TimelineItem = {
      ...baseTask,
      phoneNumber: '555-1234',
    }
    render(<ExecutionCard item={taskWithPhone} />)
    expect(screen.getByRole('button', { name: /Call 555-1234/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Text 555-1234/i })).toBeInTheDocument()
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })

  it('shows links when present', () => {
    const taskWithLinks: TimelineItem = {
      ...baseTask,
      links: ['https://example.com', 'https://test.org'],
    }
    render(<ExecutionCard item={taskWithLinks} />)
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('test.org')).toBeInTheDocument()
  })

  it('shows location for events', () => {
    const eventWithLocation: TimelineItem = {
      ...baseEvent,
      location: '123 Main St',
    }
    render(<ExecutionCard item={eventWithLocation} />)
    expect(screen.getByText('123 Main St')).toBeInTheDocument()
  })

  it('calls onToggleComplete when checkbox clicked for task', async () => {
    const onToggle = vi.fn()
    const taskWithOriginal: TimelineItem = {
      ...baseTask,
      originalTask: {
        id: 'original-1',
        title: 'Test',
        completed: false,
        createdAt: new Date(),
      },
    }
    const { user } = render(
      <ExecutionCard item={taskWithOriginal} onToggleComplete={onToggle} />
    )

    await user.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('original-1')
  })

  it('calls onDelete when delete button clicked for task', async () => {
    const onDelete = vi.fn()
    const taskWithOriginal: TimelineItem = {
      ...baseTask,
      originalTask: {
        id: 'original-1',
        title: 'Test',
        completed: false,
        createdAt: new Date(),
      },
    }
    const { user } = render(
      <ExecutionCard item={taskWithOriginal} onDelete={onDelete} />
    )

    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('original-1')
  })

  it('applies completed styling when task is completed', () => {
    const completedTask: TimelineItem = {
      ...baseTask,
      completed: true,
    }
    render(<ExecutionCard item={completedTask} />)
    expect(screen.getByText('Test Task')).toHaveClass('line-through')
  })

  it('shows green indicator for tasks', () => {
    const { container } = render(<ExecutionCard item={baseTask} />)
    const indicator = container.querySelector('.bg-primary-500')
    expect(indicator).toBeInTheDocument()
  })

  it('shows blue indicator for events', () => {
    const { container } = render(<ExecutionCard item={baseEvent} />)
    const indicator = container.querySelector('.bg-blue-500')
    expect(indicator).toBeInTheDocument()
  })

  it('shows scheduled time for tasks with scheduledFor', () => {
    const scheduledTask: TimelineItem = {
      ...baseTask,
      startTime: new Date('2024-01-15T14:30:00'),
      originalTask: {
        id: '1',
        title: 'Test Task',
        completed: false,
        createdAt: new Date(),
        scheduledFor: new Date('2024-01-15T14:30:00'),
      },
    }
    render(<ExecutionCard item={scheduledTask} />)
    expect(screen.getByText('2:30 PM')).toBeInTheDocument()
    expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument()
  })

  it('shows schedule input in edit mode', async () => {
    const onUpdate = vi.fn()
    const taskWithOriginal: TimelineItem = {
      ...baseTask,
      originalTask: {
        id: '1',
        title: 'Test Task',
        completed: false,
        createdAt: new Date(),
      },
    }
    const { user } = render(
      <ExecutionCard item={taskWithOriginal} onUpdate={onUpdate} />
    )

    // Click edit button
    await user.click(screen.getByRole('button', { name: 'Edit task' }))

    // Should show schedule input
    expect(screen.getByLabelText('Scheduled For')).toBeInTheDocument()
  })

  it('shows clear button when task is scheduled', async () => {
    const onUpdate = vi.fn()
    const scheduledTask: TimelineItem = {
      ...baseTask,
      startTime: new Date('2024-01-15T14:30:00'),
      originalTask: {
        id: '1',
        title: 'Test Task',
        completed: false,
        createdAt: new Date(),
        scheduledFor: new Date('2024-01-15T14:30:00'),
      },
    }
    const { user } = render(
      <ExecutionCard item={scheduledTask} onUpdate={onUpdate} />
    )

    // Click edit button
    await user.click(screen.getByRole('button', { name: 'Edit task' }))

    // Should show clear button
    expect(screen.getByRole('button', { name: 'Clear schedule' })).toBeInTheDocument()
  })

  it('calls onUpdate with undefined scheduledFor when clear is clicked', async () => {
    const onUpdate = vi.fn()
    const scheduledTask: TimelineItem = {
      ...baseTask,
      startTime: new Date('2024-01-15T14:30:00'),
      originalTask: {
        id: '1',
        title: 'Test Task',
        completed: false,
        createdAt: new Date(),
        scheduledFor: new Date('2024-01-15T14:30:00'),
      },
    }
    const { user } = render(
      <ExecutionCard item={scheduledTask} onUpdate={onUpdate} />
    )

    // Click edit button
    await user.click(screen.getByRole('button', { name: 'Edit task' }))

    // Click clear button
    await user.click(screen.getByRole('button', { name: 'Clear schedule' }))

    expect(onUpdate).toHaveBeenCalledWith('1', { scheduledFor: undefined })
  })
})
