import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutinesList } from './RoutinesList'
import { createMockRoutine, createMockContact, createMockFamilyMember, resetIdCounter } from '@/test/mocks/factories'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('RoutinesList', () => {
  const mockOnSelectRoutine = vi.fn()
  const mockOnCreateRoutine = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    resetIdCounter()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  describe('rendering', () => {
    it('renders header with title', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Routines')).toBeInTheDocument()
    })

    it('renders New Routine button', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByRole('button', { name: /New Routine/i })).toBeInTheDocument()
    })

    it('calls onCreateRoutine when clicking New Routine button', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New Routine/i }))

      expect(mockOnCreateRoutine).toHaveBeenCalled()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no routines', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('No routines yet')).toBeInTheDocument()
      expect(screen.getByText('Routines are recurring tasks that repeat on a schedule.')).toBeInTheDocument()
    })

    it('shows create button in empty state', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByRole('button', { name: /Create your first routine/i })).toBeInTheDocument()
    })

    it('calls onCreateRoutine when clicking empty state button', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Create your first routine/i }))

      expect(mockOnCreateRoutine).toHaveBeenCalled()
    })
  })

  describe('routine display', () => {
    it('renders routine names', () => {
      const routines = [
        createMockRoutine({ name: 'Morning Workout' }),
        createMockRoutine({ name: 'Evening Walk' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Morning Workout')).toBeInTheDocument()
      expect(screen.getByText('Evening Walk')).toBeInTheDocument()
    })

    it('displays active routine count', () => {
      const routines = [
        createMockRoutine({ visibility: 'active' }),
        createMockRoutine({ visibility: 'active' }),
        createMockRoutine({ visibility: 'reference' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Active (2)')).toBeInTheDocument()
    })

    it('displays paused routine count', () => {
      const routines = [
        createMockRoutine({ visibility: 'active' }),
        createMockRoutine({ visibility: 'reference' }),
        createMockRoutine({ visibility: 'reference' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Paused (2)')).toBeInTheDocument()
    })

    it('calls onSelectRoutine when clicking a routine', () => {
      const routine = createMockRoutine({ name: 'Test Routine' })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      fireEvent.click(screen.getByText('Test Routine'))

      expect(mockOnSelectRoutine).toHaveBeenCalledWith(routine)
    })
  })

  describe('recurrence formatting', () => {
    it('displays "Every day" for daily routines', () => {
      const routine = createMockRoutine({
        name: 'Daily Task',
        recurrence_pattern: { type: 'daily' },
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Every day')).toBeInTheDocument()
    })

    it('displays "Weekdays" for mon-fri routines', () => {
      const routine = createMockRoutine({
        name: 'Work Routine',
        recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Weekdays')).toBeInTheDocument()
    })

    it('displays "Weekends" for sat-sun routines', () => {
      const routine = createMockRoutine({
        name: 'Weekend Routine',
        recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] },
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Weekends')).toBeInTheDocument()
    })

    it('displays day names for specific weekly days', () => {
      const routine = createMockRoutine({
        name: 'MWF Routine',
        recurrence_pattern: { type: 'weekly', days: ['mon', 'wed', 'fri'] },
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Mon, Wed, Fri')).toBeInTheDocument()
    })

    it('displays monthly recurrence', () => {
      const routine = createMockRoutine({
        name: 'Monthly Review',
        recurrence_pattern: { type: 'monthly', day_of_month: 15 },
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Monthly on day 15')).toBeInTheDocument()
    })
  })

  describe('time formatting', () => {
    it('displays AM time correctly', () => {
      const routine = createMockRoutine({
        name: 'Morning Routine',
        time_of_day: '07:30',
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('7:30 AM')).toBeInTheDocument()
    })

    it('displays PM time correctly', () => {
      const routine = createMockRoutine({
        name: 'Afternoon Routine',
        time_of_day: '14:00',
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('2:00 PM')).toBeInTheDocument()
    })

    it('displays noon as 12:00 PM', () => {
      const routine = createMockRoutine({
        name: 'Noon Routine',
        time_of_day: '12:00',
      })

      render(
        <RoutinesList
          routines={[routine]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('12:00 PM')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('shows sort dropdown', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByLabelText('Sort:')).toBeInTheDocument()
    })

    it('defaults to time of day sort', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const sortSelect = screen.getByRole('combobox', { name: 'Sort:' })
      expect(sortSelect).toHaveValue('time')
    })

    it('sorts by time of day', () => {
      const routines = [
        createMockRoutine({ name: 'Evening', time_of_day: '19:00' }),
        createMockRoutine({ name: 'Morning', time_of_day: '07:00' }),
        createMockRoutine({ name: 'Afternoon', time_of_day: '14:00' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const buttons = screen.getAllByRole('button').filter(btn =>
        btn.textContent?.includes('Morning') ||
        btn.textContent?.includes('Afternoon') ||
        btn.textContent?.includes('Evening')
      )

      expect(buttons[0]).toHaveTextContent('Morning')
      expect(buttons[1]).toHaveTextContent('Afternoon')
      expect(buttons[2]).toHaveTextContent('Evening')
    })

    it('allows changing sort order', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const sortSelect = screen.getByRole('combobox', { name: 'Sort:' })
      fireEvent.change(sortSelect, { target: { value: 'alphabetical' } })

      expect(sortSelect).toHaveValue('alphabetical')
    })

    it('persists sort preference to localStorage', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const sortSelect = screen.getByRole('combobox', { name: 'Sort:' })
      fireEvent.change(sortSelect, { target: { value: 'frequency' } })

      expect(localStorageMock.setItem).toHaveBeenCalledWith('routines-sort', 'frequency')
    })
  })

  describe('grouping', () => {
    it('shows group dropdown', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByLabelText('Group:')).toBeInTheDocument()
    })

    it('defaults to no grouping', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const groupSelect = screen.getByRole('combobox', { name: 'Group:' })
      expect(groupSelect).toHaveValue('none')
    })

    it('allows grouping by time of day', () => {
      const routines = [
        createMockRoutine({ name: 'Morning Task', time_of_day: '08:00' }),
        createMockRoutine({ name: 'Evening Task', time_of_day: '20:00' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const groupSelect = screen.getByRole('combobox', { name: 'Group:' })
      fireEvent.change(groupSelect, { target: { value: 'time' } })

      expect(screen.getByText('Morning')).toBeInTheDocument()
      expect(screen.getByText('Evening')).toBeInTheDocument()
    })

    it('persists group preference to localStorage', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const groupSelect = screen.getByRole('combobox', { name: 'Group:' })
      fireEvent.change(groupSelect, { target: { value: 'assignee' } })

      expect(localStorageMock.setItem).toHaveBeenCalledWith('routines-group', 'assignee')
    })
  })

  describe('assignee display', () => {
    it('shows assignee avatar when routine is assigned', () => {
      const familyMember = createMockFamilyMember({ id: 'member-1', name: 'Scott', initials: 'SK' })
      const routine = createMockRoutine({ assigned_to: 'member-1' })

      render(
        <RoutinesList
          routines={[routine]}
          familyMembers={[familyMember]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('SK')).toBeInTheDocument()
    })

    it('groups by assignee when selected', () => {
      const familyMembers = [
        createMockFamilyMember({ id: 'member-1', name: 'Scott', initials: 'SK' }),
        createMockFamilyMember({ id: 'member-2', name: 'Iris', initials: 'IK' }),
      ]
      const routines = [
        createMockRoutine({ name: 'Scott Task', assigned_to: 'member-1' }),
        createMockRoutine({ name: 'Iris Task', assigned_to: 'member-2' }),
        createMockRoutine({ name: 'Unassigned Task', assigned_to: null }),
      ]

      render(
        <RoutinesList
          routines={routines}
          familyMembers={familyMembers}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const groupSelect = screen.getByRole('combobox', { name: 'Group:' })
      fireEvent.change(groupSelect, { target: { value: 'assignee' } })

      expect(screen.getByText('Scott')).toBeInTheDocument()
      expect(screen.getByText('Iris')).toBeInTheDocument()
      expect(screen.getByText('Unassigned')).toBeInTheDocument()
    })
  })

  describe('active vs paused routines', () => {
    it('separates active and paused routines', () => {
      const routines = [
        createMockRoutine({ name: 'Active Routine', visibility: 'active' }),
        createMockRoutine({ name: 'Paused Routine', visibility: 'reference' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByText('Active (1)')).toBeInTheDocument()
      expect(screen.getByText('Paused (1)')).toBeInTheDocument()
    })

    it('applies different styling to paused routines', () => {
      const routines = [
        createMockRoutine({ name: 'Paused Routine', visibility: 'reference' }),
      ]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      const button = screen.getByText('Paused Routine').closest('button')
      expect(button).toHaveClass('opacity-60')
    })
  })

  describe('natural language routines', () => {
    it('renders NL routine with semantic tokens', () => {
      const contacts = [createMockContact({ name: 'Jax' })]
      const routine = createMockRoutine({
        raw_input: 'walk jax every morning',
        name: 'walk jax',
      })

      render(
        <RoutinesList
          routines={[routine]}
          contacts={contacts}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      // Should render the routine name in a clickable button
      expect(screen.getByText('walk jax')).toBeInTheDocument()
    })
  })

  describe('controls visibility', () => {
    it('does not show sort/group controls when no routines', () => {
      render(
        <RoutinesList
          routines={[]}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.queryByLabelText('Sort:')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Group:')).not.toBeInTheDocument()
    })

    it('shows sort/group controls when routines exist', () => {
      const routines = [createMockRoutine()]

      render(
        <RoutinesList
          routines={routines}
          onSelectRoutine={mockOnSelectRoutine}
          onCreateRoutine={mockOnCreateRoutine}
        />
      )

      expect(screen.getByLabelText('Sort:')).toBeInTheDocument()
      expect(screen.getByLabelText('Group:')).toBeInTheDocument()
    })
  })
})
