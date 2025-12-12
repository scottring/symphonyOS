import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { WeekView } from './WeekView'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

// Helper to create a Monday at midnight
function getMonday(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Helper to create a task for a specific date
function createTask(overrides: Partial<Task> = {}): Task {
  const now = new Date()
  return {
    id: 'task-1',
    title: 'Test Task',
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('WeekView', () => {
  const mockOnWeekChange = vi.fn()
  const mockOnSelectDay = vi.fn()
  const monday = getMonday()

  const defaultProps = {
    tasks: [] as Task[],
    events: [] as CalendarEvent[],
    routines: [] as Routine[],
    dateInstances: [],
    weekStart: monday,
    onWeekChange: mockOnWeekChange,
    onSelectDay: mockOnSelectDay,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the week header with correct date range', () => {
      render(<WeekView {...defaultProps} />)

      expect(screen.getByText('Week')).toBeInTheDocument()
      // Should show month and date range
      const monthPattern = /\w+ \d+/
      expect(screen.getByText(monthPattern)).toBeInTheDocument()
    })

    it('renders 7 day columns', () => {
      render(<WeekView {...defaultProps} />)

      // Each day has its abbreviated name - check all 7 are present
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Tue')).toBeInTheDocument()
      expect(screen.getByText('Wed')).toBeInTheDocument()
      expect(screen.getByText('Thu')).toBeInTheDocument()
      expect(screen.getByText('Fri')).toBeInTheDocument()
      expect(screen.getByText('Sat')).toBeInTheDocument()
      expect(screen.getByText('Sun')).toBeInTheDocument()
    })

    it('shows day names (Mon, Tue, etc.)', () => {
      render(<WeekView {...defaultProps} />)

      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Tue')).toBeInTheDocument()
      expect(screen.getByText('Wed')).toBeInTheDocument()
      expect(screen.getByText('Thu')).toBeInTheDocument()
      expect(screen.getByText('Fri')).toBeInTheDocument()
      expect(screen.getByText('Sat')).toBeInTheDocument()
      expect(screen.getByText('Sun')).toBeInTheDocument()
    })

    it('shows "Clear" for days with no items', () => {
      render(<WeekView {...defaultProps} />)

      // All 7 days should show "Clear" when empty
      const clearTexts = screen.getAllByText('Clear')
      expect(clearTexts.length).toBe(7)
    })
  })

  describe('tasks display', () => {
    it('shows task titles in the correct day column', () => {
      const taskDate = new Date(monday)
      taskDate.setHours(10, 0, 0, 0) // 10 AM Monday = morning

      const tasks = [
        createTask({
          id: 'task-1',
          title: 'Monday Morning Task',
          scheduledFor: taskDate,
        }),
      ]

      render(<WeekView {...defaultProps} tasks={tasks} />)

      expect(screen.getByText(/Monday Morning Task/)).toBeInTheDocument()
    })

    it('shows tasks in Morning section for morning times', () => {
      const taskDate = new Date(monday)
      taskDate.setHours(9, 0, 0, 0) // 9 AM

      const tasks = [
        createTask({
          id: 'task-1',
          title: 'Early Task',
          scheduledFor: taskDate,
        }),
      ]

      render(<WeekView {...defaultProps} tasks={tasks} />)

      // Should have Morning section visible
      expect(screen.getByText('Morning')).toBeInTheDocument()
    })

    it('shows tasks in Afternoon section for afternoon times', () => {
      const taskDate = new Date(monday)
      taskDate.setHours(14, 0, 0, 0) // 2 PM

      const tasks = [
        createTask({
          id: 'task-1',
          title: 'Afternoon Task',
          scheduledFor: taskDate,
        }),
      ]

      render(<WeekView {...defaultProps} tasks={tasks} />)

      expect(screen.getByText('Afternoon')).toBeInTheDocument()
    })

    it('shows tasks in Evening section for evening times', () => {
      const taskDate = new Date(monday)
      taskDate.setHours(19, 0, 0, 0) // 7 PM

      const tasks = [
        createTask({
          id: 'task-1',
          title: 'Evening Task',
          scheduledFor: taskDate,
        }),
      ]

      render(<WeekView {...defaultProps} tasks={tasks} />)

      expect(screen.getByText('Evening')).toBeInTheDocument()
    })
  })

  describe('progress indicators', () => {
    it('shows 0/0 when no tasks', () => {
      render(<WeekView {...defaultProps} />)

      // All days should show 0/0
      const progressTexts = screen.getAllByText('0/0')
      expect(progressTexts.length).toBe(7)
    })

    it('shows completion progress for tasks', () => {
      const taskDate = new Date(monday)
      taskDate.setHours(10, 0, 0, 0)

      const tasks = [
        createTask({
          id: 'task-1',
          title: 'Task 1',
          scheduledFor: taskDate,
          completed: true,
        }),
        createTask({
          id: 'task-2',
          title: 'Task 2',
          scheduledFor: taskDate,
          completed: false,
        }),
      ]

      render(<WeekView {...defaultProps} tasks={tasks} />)

      // Should show 1/2 for Monday
      expect(screen.getByText('1/2')).toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('calls onWeekChange when previous week button is clicked', async () => {
      const { user } = render(<WeekView {...defaultProps} />)

      const prevButton = screen.getByLabelText('Previous week')
      await user.click(prevButton)

      expect(mockOnWeekChange).toHaveBeenCalledTimes(1)
      const newDate = mockOnWeekChange.mock.calls[0][0]
      expect(newDate.getTime()).toBeLessThan(monday.getTime())
    })

    it('calls onWeekChange when next week button is clicked', async () => {
      const { user } = render(<WeekView {...defaultProps} />)

      const nextButton = screen.getByLabelText('Next week')
      await user.click(nextButton)

      expect(mockOnWeekChange).toHaveBeenCalledTimes(1)
      const newDate = mockOnWeekChange.mock.calls[0][0]
      expect(newDate.getTime()).toBeGreaterThan(monday.getTime())
    })

    it('calls onSelectDay when a day column is clicked', async () => {
      const { user } = render(<WeekView {...defaultProps} />)

      // Find Monday's column by its date number and click it
      const mondayNum = monday.getDate().toString()
      const mondayColumn = screen.getByText(mondayNum).closest('button')

      if (mondayColumn) {
        await user.click(mondayColumn)
        expect(mockOnSelectDay).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('hint text', () => {
    it('shows hint about clicking days', () => {
      render(<WeekView {...defaultProps} />)

      expect(screen.getByText('Click any day to see full details')).toBeInTheDocument()
    })
  })
})
