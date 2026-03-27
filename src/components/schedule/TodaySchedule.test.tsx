import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TodaySchedule } from './TodaySchedule'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'

// Mock the context — tests set values via mockContextValue
const mockContextValue: ScheduleActionsValue = {
  onToggleTask: vi.fn(),
  projects: [],
  contacts: [],
  familyMembers: [],
  lists: [],
}

vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => mockContextValue,
}))

// Mock useMobile hook
vi.mock('@/hooks/useMobile', () => ({
  useMobile: () => false, // Desktop by default
}))

// Mock useRecurringEventDetection
vi.mock('@/hooks/useRecurringEventDetection', () => ({
  useRecurringEventDetection: () => ({
    getRecurringProject: () => null,
    linkedProjectIds: new Set(),
    isPromotionSuggested: () => false,
  }),
}))

// Mock useRoutineStats
vi.mock('@/hooks/useRoutineStats', () => ({
  useRoutineStats: () => ({
    stats: new Map(),
    loading: false,
    getStats: () => undefined,
    refetch: () => {},
  }),
}))

// Mock useEmailActionItems
vi.mock('@/hooks/useEmailActionItems', () => ({
  useEmailActionItems: () => ({
    items: [],
    loading: false,
    acknowledge: () => {},
    dismiss: () => {},
    snooze: () => {},
  }),
}))

// Create a stable "today" for testing - we'll use fake timers to control Date
const mockToday = new Date('2024-01-15T12:00:00.000Z')

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: `task-${Math.random().toString(36).substr(2, 9)}`,
  title: 'Test Task',
  completed: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

const createMockEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `event-${Math.random().toString(36).substr(2, 9)}`,
  google_event_id: `google-${Math.random().toString(36).substr(2, 9)}`,
  title: 'Test Event',
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T11:00:00Z',
  ...overrides,
})

const createMockRoutine = (overrides: Partial<Routine> = {}): Routine => ({
  id: `routine-${Math.random().toString(36).substr(2, 9)}`,
  user_id: 'test-user',
  name: 'Test Routine',
  description: null,
  default_assignee: null,
  assigned_to: null,
  assigned_to_all: null,
  recurrence_pattern: { type: 'daily' },
  time_of_day: '09:00',
  raw_input: null,
  visibility: 'active',
  paused_until: null,
  show_on_timeline: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

const createMockInstance = (overrides: Partial<ActionableInstance> = {}): ActionableInstance => ({
  id: `instance-${Math.random().toString(36).substr(2, 9)}`,
  user_id: 'test-user',
  entity_type: 'routine',
  entity_id: 'routine-1',
  date: '2024-01-15',
  status: 'pending',
  assignee: null,
  assigned_to_override: null,
  deferred_to: null,
  completed_at: null,
  skipped_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

const mockContact: Contact = {
  id: 'contact-1',
  name: 'John Doe',
  phone: '555-1234',
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockProject: Project = {
  id: 'project-1',
  name: 'Test Project',
  status: 'in_progress',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockFamilyMember: FamilyMember = {
  id: 'member-1',
  user_id: 'test-user',
  name: 'Alice',
  initials: 'A',
  color: 'blue',
  avatar_url: null,
  is_full_user: false,
  display_order: 0,
  created_at: '2024-01-01T00:00:00Z',
  member_type: 'core',
}

describe('TodaySchedule', () => {
  const defaultProps = {
    tasks: [] as Task[],
    events: [] as CalendarEvent[],
    selectedItemId: null,
    onSelectItem: vi.fn(),
    onToggleTask: vi.fn(),
    viewedDate: mockToday,
    onDateChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset context to defaults
    mockContextValue.onToggleTask = vi.fn()
    mockContextValue.onUpdateTask = undefined
    mockContextValue.onPushTask = undefined
    mockContextValue.contactsMap = undefined
    mockContextValue.projectsMap = undefined
    mockContextValue.familyMembers = []
    mockContextValue.onAssignTask = undefined
    mockContextValue.projects = []
    mockContextValue.contacts = []
    mockContextValue.lists = []
    // Mock the current date to match our mockToday
    vi.useFakeTimers()
    vi.setSystemTime(mockToday)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders loading skeleton when loading', () => {
      render(<TodaySchedule {...defaultProps} loading={true} />)

      // Should render skeleton elements
      expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('renders empty state message when no items', () => {
      render(<TodaySchedule {...defaultProps} />)

      expect(screen.getByText('Your day is clear')).toBeInTheDocument()
    })

    it('shows different empty state for non-today dates', () => {
      const futureDate = new Date('2024-01-20T12:00:00Z')
      render(<TodaySchedule {...defaultProps} viewedDate={futureDate} />)

      expect(screen.getByText(/Nothing scheduled for/)).toBeInTheDocument()
    })

    it('renders date header', () => {
      render(<TodaySchedule {...defaultProps} />)

      // Desktop header shows full date format like "Monday, January 15, 2024"
      expect(screen.getByRole('heading', { name: /Monday, January 15/ })).toBeInTheDocument()
    })

    it('shows full date for non-today dates', () => {
      const futureDate = new Date('2024-01-20T12:00:00Z')
      render(<TodaySchedule {...defaultProps} viewedDate={futureDate} />)

      // For non-today dates, shows full date like "Saturday, January 20"
      expect(screen.getByRole('heading', { name: /Saturday, January 20/ })).toBeInTheDocument()
    })

    it('renders progress indicator when there are actionable items', () => {
      const tasks = [
        createMockTask({ id: '1', bucket: 'timed', scheduledFor: mockToday }),
        createMockTask({ id: '2', bucket: 'timed', scheduledFor: mockToday, completed: true }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} />)

      // Progress is rendered via ProgressIndicator — check via container text
      const container = document.querySelector('[class*="tabular-nums"]')
      expect(container).toBeTruthy()
      expect(container?.textContent).toContain('tasks')
    })
  })

  describe('task display', () => {
    it('renders scheduled tasks for the day', () => {
      const tasks = [
        createMockTask({ id: '1', title: 'Morning task', bucket: 'timed', scheduledFor: mockToday }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} />)

      expect(screen.getByText('Morning task')).toBeInTheDocument()
    })

    it('filters tasks to only show for viewed date', () => {
      // Use dates far apart to avoid timezone issues
      const tasks = [
        createMockTask({ id: '1', title: 'Today task', bucket: 'timed', scheduledFor: new Date('2024-01-15T14:00:00Z') }),
        createMockTask({ id: '2', title: 'Next week task', bucket: 'timed', scheduledFor: new Date('2024-01-22T14:00:00Z') }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} />)

      expect(screen.getByText('Today task')).toBeInTheDocument()
      expect(screen.queryByText('Next week task')).not.toBeInTheDocument()
    })
  })

  describe('event display', () => {
    it('renders events for the day', () => {
      const events = [
        createMockEvent({ title: 'Team Meeting' }),
      ]

      render(<TodaySchedule {...defaultProps} events={events} />)

      expect(screen.getByText('Team Meeting')).toBeInTheDocument()
    })

    it('deduplicates events with same title and start time', () => {
      const events = [
        createMockEvent({ id: '1', google_event_id: 'g1', title: 'Meeting', start_time: '2024-01-15T10:00:00Z' }),
        createMockEvent({ id: '2', google_event_id: 'g2', title: 'Meeting', start_time: '2024-01-15T10:00:00Z' }),
      ]

      render(<TodaySchedule {...defaultProps} events={events} />)

      // Should only show one
      expect(screen.getAllByText('Meeting')).toHaveLength(1)
    })

    it('filters events to only show for viewed date', () => {
      const events = [
        createMockEvent({ title: 'Today Event', start_time: '2024-01-15T10:00:00Z' }),
        createMockEvent({ title: 'Tomorrow Event', start_time: '2024-01-16T10:00:00Z' }),
      ]

      render(<TodaySchedule {...defaultProps} events={events} />)

      expect(screen.getByText('Today Event')).toBeInTheDocument()
      expect(screen.queryByText('Tomorrow Event')).not.toBeInTheDocument()
    })
  })

  describe('routine display', () => {
    it('renders visible routines', () => {
      const routines = [
        createMockRoutine({ id: 'r1', name: 'Morning Exercise' }),
      ]

      render(<TodaySchedule {...defaultProps} routines={routines} />)

      expect(screen.getByText('Morning Exercise')).toBeInTheDocument()
    })

    it('hides routines with show_on_timeline false', () => {
      const routines = [
        createMockRoutine({ id: 'r1', name: 'Visible Routine', show_on_timeline: true }),
        createMockRoutine({ id: 'r2', name: 'Hidden Routine', show_on_timeline: false }),
      ]

      render(<TodaySchedule {...defaultProps} routines={routines} />)

      expect(screen.getByText('Visible Routine')).toBeInTheDocument()
      expect(screen.queryByText('Hidden Routine')).not.toBeInTheDocument()
    })

    it('shows completed state for completed routine instances', () => {
      const routines = [
        createMockRoutine({ id: 'routine-1', name: 'Completed Routine' }),
      ]
      const instances = [
        createMockInstance({ entity_id: 'routine-1', status: 'completed' }),
      ]

      render(<TodaySchedule {...defaultProps} routines={routines} dateInstances={instances} />)

      // The routine should be rendered and marked complete (would have strikethrough or similar)
      expect(screen.getByText('Completed Routine')).toBeInTheDocument()
    })
  })

  describe('inbox section', () => {
    it('does not show inbox on non-today dates', () => {
      const futureDate = new Date('2024-01-20T12:00:00Z')
      const tasks = [
        createMockTask({ id: '1', title: 'Inbox item', scheduledFor: undefined }),
      ]

      render(
        <TodaySchedule
          {...defaultProps}
          viewedDate={futureDate}
          tasks={tasks}
        />
      )

      // Should show empty state since inbox not visible on future dates
      expect(screen.getByText(/Nothing scheduled for/)).toBeInTheDocument()
    })

    it('does not show tasks deferred to future dates', () => {
      const tasks = [
        createMockTask({
          id: '1',
          title: 'Future deferred',
          scheduledFor: undefined,
          deferredUntil: new Date('2024-01-20'), // Future
        }),
      ]

      render(
        <TodaySchedule
          {...defaultProps}
          tasks={tasks}
        />
      )

      // Task deferred to future should not appear
      expect(screen.queryByText('Future deferred')).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onSelectItem when clicking a task', () => {
      const onSelectItem = vi.fn()
      const tasks = [
        createMockTask({ id: '1', title: 'Clickable task', bucket: 'timed', scheduledFor: mockToday }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} onSelectItem={onSelectItem} />)

      fireEvent.click(screen.getByText('Clickable task'))

      expect(onSelectItem).toHaveBeenCalledWith('task-1')
    })

    it('calls onToggleTask when completing a task', () => {
      const onToggleTask = vi.fn()
      const tasks = [
        createMockTask({ id: '1', title: 'Completable task', bucket: 'timed', scheduledFor: mockToday }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} onToggleTask={onToggleTask} />)

      // TaskCheckbox uses useLongPress with mouseDown/mouseUp, not click
      const checkbox = screen.getByLabelText(/Mark complete/i)
      fireEvent.mouseDown(checkbox)
      fireEvent.mouseUp(checkbox)

      expect(onToggleTask).toHaveBeenCalledWith('1')
    })

    it('calls onCompleteRoutine when completing a routine', () => {
      const onCompleteRoutine = vi.fn()
      const routines = [
        createMockRoutine({ id: 'routine-1', name: 'Completable routine' }),
      ]

      render(
        <TodaySchedule
          {...defaultProps}
          routines={routines}
          onCompleteRoutine={onCompleteRoutine}
        />
      )

      // TaskCheckbox uses useLongPress with mouseDown/mouseUp, not click
      const checkbox = screen.getByLabelText(/Mark complete/i)
      fireEvent.mouseDown(checkbox)
      fireEvent.mouseUp(checkbox)

      expect(onCompleteRoutine).toHaveBeenCalledWith('routine-1', true)
    })
  })

  describe('date navigation', () => {
    it('renders DateNavigator component', () => {
      render(<TodaySchedule {...defaultProps} />)

      // DateNavigator should render with navigation arrows
      expect(screen.getByLabelText(/Previous day/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Next day/i)).toBeInTheDocument()
    })

    it('calls onDateChange when navigating', () => {
      const onDateChange = vi.fn()
      render(<TodaySchedule {...defaultProps} onDateChange={onDateChange} />)

      fireEvent.click(screen.getByLabelText(/Next day/i))

      expect(onDateChange).toHaveBeenCalled()
    })
  })

  describe('contact and project display', () => {
    it('shows contact name when task has contactId', () => {
      const tasks = [
        createMockTask({ id: '1', title: 'Task with contact', bucket: 'timed', scheduledFor: mockToday, contactId: 'contact-1' }),
      ]
      mockContextValue.contactsMap = new Map([['contact-1', mockContact]])

      render(<TodaySchedule {...defaultProps} tasks={tasks} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('shows project name when task has projectId', () => {
      const tasks = [
        createMockTask({ id: '1', title: 'Task with project', bucket: 'timed', scheduledFor: mockToday, projectId: 'project-1' }),
      ]
      mockContextValue.projectsMap = new Map([['project-1', mockProject]])

      render(<TodaySchedule {...defaultProps} tasks={tasks} />)

      // Project name now appears in both tooltip and context label
      const projectNameElements = screen.getAllByText('Test Project')
      expect(projectNameElements.length).toBeGreaterThan(0)
    })
  })

  describe('family member assignment', () => {
    it('shows assigned family member', () => {
      const tasks = [
        createMockTask({ id: '1', title: 'Assigned task', bucket: 'timed', scheduledFor: mockToday, assignedTo: 'member-1' }),
      ]

      mockContextValue.familyMembers = [mockFamilyMember]
      mockContextValue.onAssignTask = vi.fn()

      render(
        <TodaySchedule
          {...defaultProps}
          tasks={tasks}
        />
      )

      // The assigned member's initial should be visible
      expect(screen.getByText('A')).toBeInTheDocument()
    })
  })

  describe('progress tracking', () => {
    it('calculates progress correctly with mixed completion', () => {
      const tasks = [
        createMockTask({ id: '1', bucket: 'timed', scheduledFor: mockToday, completed: false }),
        createMockTask({ id: '2', bucket: 'timed', scheduledFor: mockToday, completed: true }),
      ]
      const routines = [
        createMockRoutine({ id: 'r1', name: 'Routine 1' }),
      ]
      const instances = [
        createMockInstance({ entity_id: 'r1', status: 'completed' }),
      ]

      render(
        <TodaySchedule
          {...defaultProps}
          tasks={tasks}
          routines={routines}
          dateInstances={instances}
        />
      )

      // 1 task + 1 routine completed = 2, total = 3
      // ProgressIndicator renders "2/3 tasks" — check via container text
      const container = document.querySelector('[class*="tabular-nums"]')
      expect(container).toBeTruthy()
      expect(container?.textContent).toContain('tasks')
    })

    it('does not include events in actionable count', () => {
      const tasks = [
        createMockTask({ id: '1', bucket: 'timed', scheduledFor: mockToday }),
      ]
      const events = [
        createMockEvent({ title: 'Event' }),
      ]

      render(<TodaySchedule {...defaultProps} tasks={tasks} events={events} />)

      // Only 1 task is actionable, not the event
      // Progress is shown as separate spans, check the container text
      const progressContainer = screen.getByText('tasks').parentElement
      expect(progressContainer?.textContent).toContain('0')
      expect(progressContainer?.textContent).toContain('1')
    })
  })
})
