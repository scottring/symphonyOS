import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoutineForm } from './RoutineForm'
import { createMockRoutine, createMockFamilyMember, resetIdCounter } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'

describe('RoutineForm', () => {
  const mockOnBack = vi.fn()
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnToggleVisibility = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnUpdate.mockResolvedValue(true)
    mockOnDelete.mockResolvedValue(true)
    mockOnToggleVisibility.mockResolvedValue(true)
    resetIdCounter()
  })

  const renderForm = (routine: Routine, props = {}) => {
    return render(
      <RoutineForm
        routine={routine}
        onBack={mockOnBack}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onToggleVisibility={mockOnToggleVisibility}
        {...props}
      />
    )
  }

  describe('header', () => {
    it('renders Edit Routine title', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      expect(screen.getByText('Edit Routine')).toBeInTheDocument()
    })

    it('renders back button', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      const backButton = screen.getByRole('button', { name: '' }) // SVG button
      expect(backButton).toBeInTheDocument()
    })

    it('calls onBack when clicking back button', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      // Find the back button (first button with no text, contains SVG)
      const buttons = screen.getAllByRole('button')
      const backButton = buttons[0] // First button is the back button
      fireEvent.click(backButton)

      expect(mockOnBack).toHaveBeenCalled()
    })
  })

  describe('visibility toggle', () => {
    it('shows Active button when routine is active', () => {
      const routine = createMockRoutine({ visibility: 'active' })
      renderForm(routine)

      expect(screen.getByRole('button', { name: /Active/i })).toBeInTheDocument()
    })

    it('shows Paused button when routine is paused', () => {
      const routine = createMockRoutine({ visibility: 'reference' })
      renderForm(routine)

      expect(screen.getByRole('button', { name: /Paused/i })).toBeInTheDocument()
    })

    it('calls onToggleVisibility when clicking visibility button', () => {
      const routine = createMockRoutine({ visibility: 'active' })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: /Active/i }))

      expect(mockOnToggleVisibility).toHaveBeenCalledWith(routine.id)
    })
  })

  describe('legacy form mode', () => {
    it('renders name input with current value', () => {
      const routine = createMockRoutine({ name: 'Morning Walk', raw_input: null })
      renderForm(routine)

      const nameInput = screen.getByPlaceholderText('Routine name')
      expect(nameInput).toHaveValue('Morning Walk')
    })

    it('renders description textarea', () => {
      const routine = createMockRoutine({ description: 'Walk around the block', raw_input: null })
      renderForm(routine)

      const descInput = screen.getByPlaceholderText('Add notes about this routine...')
      expect(descInput).toHaveValue('Walk around the block')
    })

    it('renders recurrence type buttons', () => {
      const routine = createMockRoutine({ raw_input: null })
      renderForm(routine)

      expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Weekly' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quarterly' })).toBeInTheDocument()
    })

    it('highlights selected recurrence type', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      const weeklyButton = screen.getByRole('button', { name: 'Weekly' })
      expect(weeklyButton).toHaveClass('bg-amber-100')
    })

    it('shows day selector for weekly recurrence', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon', 'wed', 'fri'] },
        raw_input: null,
      })
      renderForm(routine)

      expect(screen.getByRole('button', { name: 'Sun' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tue' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Wed' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Thu' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fri' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sat' })).toBeInTheDocument()
    })

    it('highlights selected days', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon', 'wed'] },
        raw_input: null,
      })
      renderForm(routine)

      expect(screen.getByRole('button', { name: 'Mon' })).toHaveClass('bg-amber-500')
      expect(screen.getByRole('button', { name: 'Tue' })).not.toHaveClass('bg-amber-500')
      expect(screen.getByRole('button', { name: 'Wed' })).toHaveClass('bg-amber-500')
    })

    it('hides day selector for daily recurrence', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'daily' },
        raw_input: null,
      })
      renderForm(routine)

      expect(screen.queryByRole('button', { name: 'Mon' })).not.toBeInTheDocument()
    })

    it('renders time input', () => {
      const routine = createMockRoutine({ time_of_day: '09:00', raw_input: null })
      renderForm(routine)

      // The time input doesn't have a label - find it by its type
      const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
      expect(timeInput).toBeInTheDocument()
      expect(timeInput.value).toBe('09:00')
    })

    it('shows Clear time button when time is set', () => {
      const routine = createMockRoutine({ time_of_day: '09:00', raw_input: null })
      renderForm(routine)

      expect(screen.getByRole('button', { name: 'Clear time' })).toBeInTheDocument()
    })

    it('clears time when clicking Clear time', () => {
      const routine = createMockRoutine({ time_of_day: '09:00', raw_input: null })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Clear time' }))

      const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
      expect(timeInput.value).toBe('')
    })
  })

  describe('natural language mode', () => {
    it('renders NL input for routines with raw_input', () => {
      const routine = createMockRoutine({ raw_input: 'walk jax every morning at 7am' })
      renderForm(routine)

      const input = screen.getByPlaceholderText(/iris walks jax/i)
      expect(input).toHaveValue('walk jax every morning at 7am')
    })

    it('shows preview when typing valid NL input', () => {
      const routine = createMockRoutine({ raw_input: 'walk dog daily' })
      renderForm(routine)

      expect(screen.getByText('Preview')).toBeInTheDocument()
    })

    it('does not show legacy form fields in NL mode', () => {
      const routine = createMockRoutine({ raw_input: 'walk dog daily' })
      renderForm(routine)

      expect(screen.queryByPlaceholderText('Routine name')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Add notes about this routine...')).not.toBeInTheDocument()
    })
  })

  describe('timeline visibility toggle', () => {
    it('renders Show on Today timeline checkbox', () => {
      const routine = createMockRoutine({ show_on_timeline: true })
      renderForm(routine)

      expect(screen.getByText('Show on Today timeline')).toBeInTheDocument()
    })

    it('checkbox is checked when show_on_timeline is true', () => {
      const routine = createMockRoutine({ show_on_timeline: true })
      renderForm(routine)

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
    })

    it('checkbox is unchecked when show_on_timeline is false', () => {
      const routine = createMockRoutine({ show_on_timeline: false })
      renderForm(routine)

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
    })

    it('calls onUpdate when toggling checkbox', async () => {
      const routine = createMockRoutine({ show_on_timeline: true })
      renderForm(routine)

      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)

      expect(mockOnUpdate).toHaveBeenCalledWith(routine.id, { show_on_timeline: false })
    })
  })

  describe('family member assignment', () => {
    it('shows assignment section when familyMembers provided', () => {
      const routine = createMockRoutine()
      const familyMembers = [createMockFamilyMember({ name: 'Scott' })]

      renderForm(routine, { familyMembers })

      expect(screen.getByText('Assigned to')).toBeInTheDocument()
    })

    it('hides assignment section when no familyMembers', () => {
      const routine = createMockRoutine()

      renderForm(routine, { familyMembers: [] })

      expect(screen.queryByText('Assigned to')).not.toBeInTheDocument()
    })

    it('shows unassigned option', () => {
      const routine = createMockRoutine({ assigned_to: null })
      const familyMembers = [createMockFamilyMember()]

      renderForm(routine, { familyMembers })

      expect(screen.getByRole('button', { name: 'Unassigned' })).toBeInTheDocument()
    })

    it('shows family member avatars', () => {
      const routine = createMockRoutine()
      const familyMembers = [
        createMockFamilyMember({ id: 'member-1', name: 'Scott', initials: 'SK' }),
        createMockFamilyMember({ id: 'member-2', name: 'Iris', initials: 'IK' }),
      ]

      renderForm(routine, { familyMembers })

      expect(screen.getByRole('button', { name: 'Assign to Scott' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Assign to Iris' })).toBeInTheDocument()
    })

    it('calls onUpdate when assigning to family member', async () => {
      const routine = createMockRoutine({ assigned_to: null })
      const familyMembers = [createMockFamilyMember({ id: 'member-1', name: 'Scott' })]

      renderForm(routine, { familyMembers })

      fireEvent.click(screen.getByRole('button', { name: 'Assign to Scott' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(routine.id, { assigned_to: 'member-1' })
    })

    it('calls onUpdate when unassigning', async () => {
      const routine = createMockRoutine({ assigned_to: 'member-1' })
      const familyMembers = [createMockFamilyMember({ id: 'member-1', name: 'Scott' })]

      renderForm(routine, { familyMembers })

      fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(routine.id, { assigned_to: null })
    })
  })

  describe('save changes', () => {
    it('does not show save button when no changes', () => {
      const routine = createMockRoutine({ raw_input: null })
      renderForm(routine)

      expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument()
    })

    it('shows save button when name is changed', () => {
      const routine = createMockRoutine({ name: 'Original', raw_input: null })
      renderForm(routine)

      const nameInput = screen.getByPlaceholderText('Routine name')
      fireEvent.change(nameInput, { target: { value: 'Updated' } })

      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
    })

    it('shows save button when recurrence type is changed', () => {
      const routine = createMockRoutine({ recurrence_pattern: { type: 'daily' }, raw_input: null })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))

      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
    })

    it('shows save button when day selection is changed', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Wed' }))

      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
    })

    it('calls onUpdate with correct data for legacy routine', async () => {
      const routine = createMockRoutine({
        id: 'routine-123',
        name: 'Original',
        recurrence_pattern: { type: 'daily' },
        raw_input: null,
      })
      renderForm(routine)

      const nameInput = screen.getByPlaceholderText('Routine name')
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } })

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledWith('routine-123', expect.objectContaining({
          name: 'Updated Name',
        }))
      })
    })

    it('shows Saving... while saving', async () => {
      let resolveUpdate: (value: boolean) => void
      mockOnUpdate.mockImplementation(() => new Promise(resolve => { resolveUpdate = resolve }))

      const routine = createMockRoutine({ name: 'Original', raw_input: null })
      renderForm(routine)

      const nameInput = screen.getByPlaceholderText('Routine name')
      fireEvent.change(nameInput, { target: { value: 'Updated' } })

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

      expect(screen.getByText('Saving...')).toBeInTheDocument()

      // Resolve the promise and wait for state update
      resolveUpdate!(true)
      await waitFor(() => {
        expect(screen.queryByText('Saving...')).not.toBeInTheDocument()
      })
    })

    it('disables save button when name is empty', () => {
      const routine = createMockRoutine({ name: 'Original', raw_input: null })
      renderForm(routine)

      const nameInput = screen.getByPlaceholderText('Routine name')
      fireEvent.change(nameInput, { target: { value: '' } })

      const saveButton = screen.getByRole('button', { name: /Save Changes/i })
      expect(saveButton).toBeDisabled()
    })

    it('disables save button when weekly has no days selected', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      // Deselect the only selected day
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }))

      const saveButton = screen.getByRole('button', { name: /Save Changes/i })
      expect(saveButton).toBeDisabled()
    })

    it('shows validation message when no days selected', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Mon' }))

      expect(screen.getByText('Select at least one day')).toBeInTheDocument()
    })
  })

  describe('delete routine', () => {
    it('shows Delete Routine button', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      expect(screen.getByRole('button', { name: /Delete Routine/i })).toBeInTheDocument()
    })

    it('shows confirmation when clicking delete', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: /Delete Routine/i }))

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeInTheDocument()
    })

    it('hides confirmation when clicking cancel', () => {
      const routine = createMockRoutine()
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: /Delete Routine/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('button', { name: 'Yes, Delete' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Delete Routine/i })).toBeInTheDocument()
    })

    it('calls onDelete when confirming', async () => {
      const routine = createMockRoutine({ id: 'routine-123' })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: /Delete Routine/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }))

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('routine-123')
      })
    })

    it('calls onBack after successful delete', async () => {
      const routine = createMockRoutine()
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: /Delete Routine/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }))

      await waitFor(() => {
        expect(mockOnBack).toHaveBeenCalled()
      })
    })
  })

  describe('day toggling', () => {
    it('adds day when clicking unselected day', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Wed' }))

      expect(screen.getByRole('button', { name: 'Wed' })).toHaveClass('bg-amber-500')
    })

    it('removes day when clicking selected day', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon', 'wed'] },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Mon' }))

      expect(screen.getByRole('button', { name: 'Mon' })).not.toHaveClass('bg-amber-500')
    })
  })

  describe('recurrence type change', () => {
    it('changes from daily to weekly', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'daily' },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))

      // Day selector should now be visible
      expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument()
    })

    it('changes from weekly to daily', () => {
      const routine = createMockRoutine({
        recurrence_pattern: { type: 'weekly', days: ['mon'] },
        raw_input: null,
      })
      renderForm(routine)

      fireEvent.click(screen.getByRole('button', { name: 'Daily' }))

      // Day selector should be hidden
      expect(screen.queryByRole('button', { name: 'Mon' })).not.toBeInTheDocument()
    })
  })
})
