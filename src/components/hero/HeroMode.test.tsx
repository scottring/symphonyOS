import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@/test/test-utils'
import { HeroMode } from './HeroMode'
import type { TimelineItem } from '@/types/timeline'

// Mock the child components to isolate HeroMode testing
vi.mock('./HeroCard', () => ({
  HeroCard: ({ task, onSwipeComplete, onSwipeDefer, onSwipeExit }: {
    task: TimelineItem
    onSwipeComplete: () => void
    onSwipeDefer: () => void
    onSwipeExit: () => void
  }) => (
    <div data-testid="hero-card">
      <span data-testid="task-title">{task.title}</span>
      <button data-testid="swipe-complete" onClick={onSwipeComplete}>Swipe Complete</button>
      <button data-testid="swipe-defer" onClick={onSwipeDefer}>Swipe Defer</button>
      <button data-testid="swipe-exit" onClick={onSwipeExit}>Swipe Exit</button>
    </div>
  ),
}))

vi.mock('./HeroActions', () => ({
  HeroActions: ({ onComplete, onDefer, onMore, onSkip, onArchive, onDelete }: {
    onComplete: () => void
    onDefer: (date: Date) => void
    onMore: () => void
    onSkip: () => void
    onArchive: () => void
    onDelete: () => void
  }) => (
    <div data-testid="hero-actions">
      <button data-testid="action-complete" onClick={onComplete}>Done</button>
      <button data-testid="action-defer" onClick={() => onDefer(new Date())}>Later</button>
      <button data-testid="action-more" onClick={onMore}>More</button>
      <button data-testid="action-skip" onClick={onSkip}>Skip</button>
      <button data-testid="action-archive" onClick={onArchive}>Archive</button>
      <button data-testid="action-delete" onClick={onDelete}>Delete</button>
    </div>
  ),
}))

vi.mock('./HeroProgress', () => ({
  HeroProgress: ({ total, current, completedCount }: {
    total: number
    current: number
    completedCount: number
  }) => (
    <div data-testid="hero-progress">
      <span data-testid="progress-current">{current + 1}</span>
      <span data-testid="progress-total">{total}</span>
      <span data-testid="progress-completed">{completedCount}</span>
    </div>
  ),
}))

vi.mock('./HeroCelebration', () => ({
  HeroCelebration: ({ show }: { show: boolean }) => (
    show ? <div data-testid="hero-celebration">Celebration!</div> : null
  ),
}))

const createMockTask = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'task-1',
  type: 'task',
  title: 'Test Task',
  startTime: new Date('2024-01-01T10:00:00'),
  endTime: null,
  completed: false,
  notes: '',
  originalTask: {
    id: '1',
    title: 'Test Task',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ...overrides,
})

const mockTasks: TimelineItem[] = [
  createMockTask({ id: 'task-1', title: 'First Task' }),
  createMockTask({ id: 'task-2', title: 'Second Task' }),
  createMockTask({ id: 'task-3', title: 'Third Task' }),
]

describe('HeroMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders null when not open', () => {
      const { container } = render(
        <HeroMode
          isOpen={false}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders when open', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('hero-card')).toBeInTheDocument()
    })

    it('displays the correct task from queue', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('task-title')).toHaveTextContent('First Task')
    })

    it('shows progress indicator with correct values', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('progress-current')).toHaveTextContent('1')
      expect(screen.getByTestId('progress-total')).toHaveTextContent('3')
    })

    it('displays task count in header', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('renders exit button with correct aria label', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Exit Hero Mode')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty state when all tasks are done', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={[]}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByText('All caught up!')).toBeInTheDocument()
      expect(screen.getByText(/You've completed all your tasks/)).toBeInTheDocument()
    })

    it('shows Back to Today button in empty state', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={[]}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByText('Back to Today')).toBeInTheDocument()
    })

    it('closes when Back to Today button is clicked', () => {
      const onClose = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={[]}
          onClose={onClose}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText('Back to Today'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('hides progress and actions in empty state', () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={[]}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.queryByTestId('hero-actions')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hero-progress')).not.toBeInTheDocument()
    })
  })

  describe('task completion', () => {
    it('calls onComplete with correct task id', async () => {
      const onComplete = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-complete'))

      // Advance timer for animation
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(onComplete).toHaveBeenCalledWith('1')
    })

    it('advances to next task after completion', async () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('task-title')).toHaveTextContent('First Task')

      fireEvent.click(screen.getByTestId('action-complete'))

      // Advance timer for animation and hide celebration
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(screen.getByTestId('task-title')).toHaveTextContent('Second Task')
    })

    it('shows celebration on complete', async () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-complete'))

      expect(screen.getByTestId('hero-celebration')).toBeInTheDocument()
    })

    it('increments completed count after completion', async () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('progress-completed')).toHaveTextContent('0')

      fireEvent.click(screen.getByTestId('action-complete'))

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(screen.getByTestId('progress-completed')).toHaveTextContent('1')
    })
  })

  describe('task deferral', () => {
    it('calls onDefer with correct task id', async () => {
      const onDefer = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={onDefer}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-defer'))

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(onDefer).toHaveBeenCalledWith('1', expect.any(Date))
    })

    it('advances to next task after deferral', async () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-defer'))

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(screen.getByTestId('task-title')).toHaveTextContent('Second Task')
    })
  })

  describe('task skip', () => {
    it('advances to next task when skipped', async () => {
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-skip'))

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(screen.getByTestId('task-title')).toHaveTextContent('Second Task')
    })

    it('does not call onComplete or onDefer when skipping', async () => {
      const onComplete = vi.fn()
      const onDefer = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDefer={onDefer}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('action-skip'))

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(onComplete).not.toHaveBeenCalled()
      expect(onDefer).not.toHaveBeenCalled()
    })
  })

  describe('more details', () => {
    it('calls onOpenDetail with current task', () => {
      const onOpenDetail = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={onOpenDetail}
        />
      )

      fireEvent.click(screen.getByTestId('action-more'))

      expect(onOpenDetail).toHaveBeenCalledWith(mockTasks[0])
    })
  })

  describe('closing', () => {
    it('calls onClose when exit button clicked', () => {
      const onClose = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={onClose}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByLabelText('Exit Hero Mode'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape key', () => {
      const onClose = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={onClose}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on swipe exit gesture', () => {
      const onClose = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={onClose}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('swipe-exit'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard navigation', () => {
    it('does not complete task on Enter key (safety feature)', async () => {
      const onComplete = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.keyDown(document, { key: 'Enter' })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // Enter should NOT trigger complete - too easy to accidentally press
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('does not defer task on ArrowRight key (safety feature)', async () => {
      const onDefer = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={onDefer}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.keyDown(document, { key: 'ArrowRight' })

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Arrow keys should NOT trigger defer - too easy to accidentally press
      expect(onDefer).not.toHaveBeenCalled()
    })
  })

  describe('swipe gestures', () => {
    it('completes task on swipe right', async () => {
      const onComplete = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('swipe-complete'))

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(onComplete).toHaveBeenCalled()
    })

    it('defers task on swipe left', async () => {
      const onDefer = vi.fn()
      render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={onDefer}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('swipe-defer'))

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(onDefer).toHaveBeenCalled()
    })
  })

  describe('filtering completed tasks', () => {
    it('excludes already completed tasks from queue', () => {
      const tasksWithCompleted = [
        createMockTask({ id: 'task-1', title: 'Completed Task', completed: true }),
        createMockTask({ id: 'task-2', title: 'Active Task', completed: false }),
      ]

      render(
        <HeroMode
          isOpen={true}
          tasks={tasksWithCompleted}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      expect(screen.getByTestId('task-title')).toHaveTextContent('Active Task')
      expect(screen.getByText('1 of 1')).toBeInTheDocument()
    })
  })

  describe('state reset on reopen', () => {
    it('resets to first task when reopened', async () => {
      const { rerender } = render(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      // Advance to second task
      fireEvent.click(screen.getByTestId('action-skip'))

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(screen.getByTestId('task-title')).toHaveTextContent('Second Task')

      // Close and reopen
      rerender(
        <HeroMode
          isOpen={false}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      rerender(
        <HeroMode
          isOpen={true}
          tasks={mockTasks}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      )

      // Should be back at first task
      expect(screen.getByTestId('task-title')).toHaveTextContent('First Task')
    })
  })
})
