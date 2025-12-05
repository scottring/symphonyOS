import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhenPicker } from './WhenPicker'

describe('WhenPicker', () => {
  const mockOnChange = vi.fn()
  const mockToday = new Date('2024-01-15T12:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(mockToday)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial render', () => {
    it('renders trigger button with calendar icon', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      expect(screen.getByRole('button', { name: 'Set date' })).toBeInTheDocument()
    })

    it('applies inactive styling when no value is set', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set date' })
      expect(button).toHaveClass('text-neutral-400')
    })

    it('applies active styling when value is set', () => {
      render(<WhenPicker value={new Date()} onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set date' })
      expect(button).toHaveClass('text-primary-600')
    })

    it('does not show popover initially', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('opening popover', () => {
    it('shows day selection options when clicked', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
    })

    it('does not show Clear option when no value is set', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))

      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('shows Clear option when value is set', () => {
      render(<WhenPicker value={new Date()} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })

    it('toggles popover on button click', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set date' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByText('Today')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('day selection (step 1)', () => {
    it('selecting Today advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))

      // Should now see time options
      expect(screen.getByText('All Day')).toBeInTheDocument()
      expect(screen.getByText(/Morning/)).toBeInTheDocument()
      expect(screen.getByText(/Afternoon/)).toBeInTheDocument()
      expect(screen.getByText(/Evening/)).toBeInTheDocument()
    })

    it('selecting Tomorrow advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(screen.getByText('All Day')).toBeInTheDocument()
      // Should show Tomorrow in back button
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('selecting Next Week advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(screen.getByText('All Day')).toBeInTheDocument()
    })

    it('clicking Pick date shows date input', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Pick date...'))

      // Should show date input and back button
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument()
    })
  })

  describe('date input (step date-input)', () => {
    it('back button returns to day selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Pick date...'))
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))

      // Should be back to day selection
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('selecting a date advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-01-20' } })

      // Should now see time options
      expect(screen.getByText('All Day')).toBeInTheDocument()
    })
  })

  describe('time selection (step 2)', () => {
    it('back button returns to day selection with date label', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))

      // Back button should show "Today"
      const backButton = screen.getByRole('button', { name: 'Today' })
      fireEvent.click(backButton)

      // Should be back to day selection
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
    })

    it('selecting All Day calls onChange with isAllDay=true', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('All Day'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.any(Date),
        true
      )
      // Date should be today at midnight
      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(0)
      expect(calledDate.getMinutes()).toBe(0)
    })

    it('selecting Morning sets 9am', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.any(Date),
        false
      )
      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(9)
    })

    it('selecting Afternoon sets 1pm', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Afternoon/))

      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(13)
    })

    it('selecting Evening sets 6pm', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Evening/))

      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(18)
    })

    it('clicking Pick time shows time input', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('Pick time...'))

      expect(document.querySelector('input[type="time"]')).toBeInTheDocument()
    })

    it('closes popover after time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      // Popover should be closed
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })

  describe('time input (step time-input)', () => {
    it('back button returns to time preset selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('Pick time...'))

      // Find the back button (shows "Today" label)
      fireEvent.click(screen.getByText('Today'))

      // Should be back to time selection
      expect(screen.getByText('All Day')).toBeInTheDocument()
      expect(screen.getByText(/Morning/)).toBeInTheDocument()
    })

    it('entering time calls onChange with correct hours and minutes', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('Pick time...'))

      const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
      fireEvent.change(timeInput, { target: { value: '14:30' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.any(Date),
        false
      )
      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(14)
      expect(calledDate.getMinutes()).toBe(30)
    })
  })

  describe('clear functionality', () => {
    it('clicking Clear calls onChange with undefined', () => {
      render(<WhenPicker value={new Date()} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(mockOnChange).toHaveBeenCalledWith(undefined, false)
    })

    it('closes popover after clearing', () => {
      render(<WhenPicker value={new Date()} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('outside click behavior', () => {
    it('closes popover on outside click', async () => {
      // Need real timers for userEvent
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <WhenPicker onChange={mockOnChange} />
        </div>
      )

      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Set date' }))
      expect(screen.getByText('Today')).toBeInTheDocument()

      // Click outside
      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })

    it('resets step to day on outside click', async () => {
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <WhenPicker onChange={mockOnChange} />
        </div>
      )

      const user = userEvent.setup()

      // Open and go to time step
      await user.click(screen.getByRole('button', { name: 'Set date' }))
      await user.click(screen.getByText('Today'))
      expect(screen.getByText('All Day')).toBeInTheDocument()

      // Click outside
      await user.click(screen.getByTestId('outside'))

      // Reopen - should be back at day step
      await user.click(screen.getByRole('button', { name: 'Set date' }))
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })

  describe('date calculations', () => {
    it('Tomorrow sets date to next day', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Tomorrow'))
      fireEvent.click(screen.getByText('All Day'))

      const calledDate = mockOnChange.mock.calls[0][0] as Date
      // mockToday is Jan 15, so tomorrow should be Jan 16
      expect(calledDate.getDate()).toBe(16)
      expect(calledDate.getMonth()).toBe(0) // January
    })

    it('Next Week sets date to 7 days ahead', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Next Week'))
      fireEvent.click(screen.getByText('All Day'))

      const calledDate = mockOnChange.mock.calls[0][0] as Date
      // mockToday is Jan 15, so next week should be Jan 22
      expect(calledDate.getDate()).toBe(22)
    })

    it('custom date input parses correctly', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-06-15' } })
      fireEvent.click(screen.getByText('All Day'))

      const calledDate = mockOnChange.mock.calls[0][0] as Date
      expect(calledDate.getFullYear()).toBe(2024)
      expect(calledDate.getMonth()).toBe(5) // June (0-indexed)
      expect(calledDate.getDate()).toBe(15)
    })
  })

  describe('date label formatting', () => {
    it('shows Today label for today date', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))

      // Back button should show "Today"
      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    })

    it('shows Tomorrow label for tomorrow date', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      // Back button should show "Tomorrow"
      expect(screen.getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument()
    })

    it('shows formatted date for other dates', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Next Week'))

      // Back button should show formatted date like "Mon, Jan 22"
      const backButton = screen.getByRole('button', { name: /Jan 22/ })
      expect(backButton).toBeInTheDocument()
    })
  })

  describe('reopen behavior', () => {
    it('resets to day step when reopening after time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      // Complete a selection
      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      // Reopen
      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))

      // Should be at day step, not time step
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })
})
