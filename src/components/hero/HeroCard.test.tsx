import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { HeroCard } from './HeroCard'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'

const createMockTask = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'task-1',
  type: 'task',
  title: 'Test Task Title',
  startTime: new Date('2024-01-01T10:00:00'),
  endTime: null,
  completed: false,
  notes: '',
  originalTask: {
    id: '1',
    title: 'Test Task Title',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ...overrides,
})

const mockProject: Project = {
  id: 'project-1',
  name: 'Test Project',
  status: 'in_progress',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockContact: Contact = {
  id: 'contact-1',
  name: 'John Doe',
  phone: '555-123-4567',
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('HeroCard', () => {
  describe('rendering', () => {
    it('renders task title correctly', () => {
      render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('Test Task Title')).toBeInTheDocument()
    })

    it('displays time badge for tasks with startTime', () => {
      const task = createMockTask({
        startTime: new Date('2024-01-01T09:30:00'),
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('9:30 AM')).toBeInTheDocument()
    })

    it('displays time badge for PM times', () => {
      const task = createMockTask({
        startTime: new Date('2024-01-01T14:30:00'),
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('2:30 PM')).toBeInTheDocument()
    })

    it('displays All day for all-day tasks', () => {
      const task = createMockTask({
        allDay: true,
        startTime: null,
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('All day')).toBeInTheDocument()
      expect(screen.getByText('ALL DAY')).toBeInTheDocument()
    })

    it('does not show time badge for tasks without startTime', () => {
      const task = createMockTask({
        startTime: null,
        allDay: false,
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      // Time badge is not shown when there's no startTime (unless allDay)
      expect(screen.queryByText('ANYTIME')).not.toBeInTheDocument()
    })

    it('shows project name when present', () => {
      render(
        <HeroCard
          task={createMockTask()}
          project={mockProject}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('shows contact name when present', () => {
      render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={mockContact}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('shows location when present', () => {
      const task = createMockTask({
        location: '123 Main Street',
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('123 Main Street')).toBeInTheDocument()
    })

    it('shows Recurring indicator for routine type', () => {
      const task = createMockTask({
        type: 'routine',
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('Recurring')).toBeInTheDocument()
    })

    it('shows short notes when present', () => {
      const task = createMockTask({
        notes: 'Remember to bring documents',
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('"Remember to bring documents"')).toBeInTheDocument()
    })

    it('hides notes when too long', () => {
      const longNotes = 'A'.repeat(150)
      const task = createMockTask({
        notes: longNotes,
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.queryByText(`"${longNotes}"`)).not.toBeInTheDocument()
    })
  })

  describe('animation classes', () => {
    it('applies hero-card-enter class on enter from up', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(container.querySelector('.hero-card-enter')).toBeInTheDocument()
    })

    it('applies hero-card-enter-right class on enter from right', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="right"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(container.querySelector('.hero-card-enter-right')).toBeInTheDocument()
    })

    it('applies hero-card-complete class on complete animation', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation="complete"
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(container.querySelector('.hero-card-complete')).toBeInTheDocument()
    })

    it('applies hero-card-defer class on defer animation', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation="defer"
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(container.querySelector('.hero-card-defer')).toBeInTheDocument()
    })

    it('applies hero-card-skip class on skip animation', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation="skip"
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(container.querySelector('.hero-card-skip')).toBeInTheDocument()
    })
  })

  describe('swipe gestures', () => {
    it('calls onSwipeComplete on swipe right', () => {
      const onSwipeComplete = vi.fn()
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={onSwipeComplete}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Simulate touch start
      fireEvent.touchStart(card, {
        touches: [{ clientX: 100, clientY: 200 }],
      })

      // Simulate touch move to the right
      fireEvent.touchMove(card, {
        touches: [{ clientX: 250, clientY: 200 }],
      })

      // Simulate touch end
      fireEvent.touchEnd(card, {
        changedTouches: [{ clientX: 250, clientY: 200 }],
      })

      expect(onSwipeComplete).toHaveBeenCalled()
    })

    it('calls onSwipeDefer on swipe left', () => {
      const onSwipeDefer = vi.fn()
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={onSwipeDefer}
          onSwipeExit={vi.fn()}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Simulate touch start
      fireEvent.touchStart(card, {
        touches: [{ clientX: 200, clientY: 200 }],
      })

      // Simulate touch move to the left
      fireEvent.touchMove(card, {
        touches: [{ clientX: 50, clientY: 200 }],
      })

      // Simulate touch end
      fireEvent.touchEnd(card, {
        changedTouches: [{ clientX: 50, clientY: 200 }],
      })

      expect(onSwipeDefer).toHaveBeenCalled()
    })

    it('calls onSwipeExit on swipe down', () => {
      const onSwipeExit = vi.fn()
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={onSwipeExit}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Simulate touch start
      fireEvent.touchStart(card, {
        touches: [{ clientX: 200, clientY: 100 }],
      })

      // Simulate touch move down
      fireEvent.touchMove(card, {
        touches: [{ clientX: 200, clientY: 250 }],
      })

      // Simulate touch end
      fireEvent.touchEnd(card, {
        changedTouches: [{ clientX: 200, clientY: 250 }],
      })

      expect(onSwipeExit).toHaveBeenCalled()
    })

    it('does not trigger action for small movements', () => {
      const onSwipeComplete = vi.fn()
      const onSwipeDefer = vi.fn()
      const onSwipeExit = vi.fn()
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={onSwipeComplete}
          onSwipeDefer={onSwipeDefer}
          onSwipeExit={onSwipeExit}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Simulate touch start
      fireEvent.touchStart(card, {
        touches: [{ clientX: 100, clientY: 200 }],
      })

      // Simulate small movement
      fireEvent.touchMove(card, {
        touches: [{ clientX: 120, clientY: 220 }],
      })

      // Simulate touch end
      fireEvent.touchEnd(card, {
        changedTouches: [{ clientX: 120, clientY: 220 }],
      })

      expect(onSwipeComplete).not.toHaveBeenCalled()
      expect(onSwipeDefer).not.toHaveBeenCalled()
      expect(onSwipeExit).not.toHaveBeenCalled()
    })

    it('resets state on touch cancel', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Start drag
      fireEvent.touchStart(card, {
        touches: [{ clientX: 100, clientY: 200 }],
      })

      fireEvent.touchMove(card, {
        touches: [{ clientX: 200, clientY: 200 }],
      })

      // Cancel
      fireEvent.touchCancel(card)

      // Card should not have dragging classes applied
      expect(card).not.toHaveClass('hero-card-dragging')
    })
  })

  describe('visual feedback during drag', () => {
    it('shows swipe hints during horizontal drag', () => {
      const { container } = render(
        <HeroCard
          task={createMockTask()}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      const card = container.querySelector('.bg-bg-elevated')!

      // Start drag
      fireEvent.touchStart(card, {
        touches: [{ clientX: 100, clientY: 200 }],
      })

      // Move horizontally
      fireEvent.touchMove(card, {
        touches: [{ clientX: 150, clientY: 200 }],
      })

      // The hint elements should exist (they're hidden with opacity)
      expect(screen.getByText('Done →')).toBeInTheDocument()
      expect(screen.getByText('← Later')).toBeInTheDocument()
    })
  })

  describe('time section labels', () => {
    it('shows MORNING section label for morning times', () => {
      const task = createMockTask({
        startTime: new Date('2024-01-01T08:00:00'),
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('MORNING')).toBeInTheDocument()
    })

    it('shows AFTERNOON section label for afternoon times', () => {
      const task = createMockTask({
        startTime: new Date('2024-01-01T14:00:00'),
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('AFTERNOON')).toBeInTheDocument()
    })

    it('shows EVENING section label for evening times', () => {
      const task = createMockTask({
        startTime: new Date('2024-01-01T19:00:00'),
      })

      render(
        <HeroCard
          task={task}
          project={null}
          contact={null}
          exitAnimation={null}
          enterDirection="up"
          onSwipeComplete={vi.fn()}
          onSwipeDefer={vi.fn()}
          onSwipeExit={vi.fn()}
        />
      )

      expect(screen.getByText('EVENING')).toBeInTheDocument()
    })
  })
})
