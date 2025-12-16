import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushDropdown } from './PushDropdown'

describe('PushDropdown', () => {
  const mockOnPush = vi.fn()
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
    it('renders trigger button with push icon', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      expect(screen.getByRole('button', { name: 'Push task' })).toBeInTheDocument()
    })

    it('does not show dropdown initially', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
    })

    it('uses medium size styling by default', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      const button = screen.getByRole('button', { name: 'Push task' })
      expect(button).toHaveClass('p-1.5')
      expect(button).toHaveClass('rounded-lg')
    })

    it('uses small size styling when size="sm"', () => {
      render(<PushDropdown onPush={mockOnPush} size="sm" />)

      const button = screen.getByRole('button', { name: 'Push task' })
      expect(button).toHaveClass('p-1')
      expect(button).not.toHaveClass('p-1.5')
    })
  })

  describe('opening dropdown', () => {
    it('shows push options when clicked', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))

      expect(screen.getByText('Push until')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('2 weeks')).toBeInTheDocument()
      expect(screen.getByText('1 month')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
    })

    it('toggles dropdown on button click', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      const button = screen.getByRole('button', { name: 'Push task' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByText('Push until')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
    })
  })

  describe('quick push options', () => {
    it('clicking Tomorrow calls onPush with tomorrow date at 9am', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getDate()).toBe(16) // Jan 16 (tomorrow from Jan 15)
      expect(pushedDate.getMonth()).toBe(0) // January
      expect(pushedDate.getHours()).toBe(9) // 9am default
    })

    it('clicking Next Week calls onPush with next Sunday', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getDay()).toBe(0) // Sunday
      expect(pushedDate.getDate()).toBe(21) // Jan 21 (next Sunday from Jan 15 which is Monday)
      expect(pushedDate.getMonth()).toBe(0) // January
      expect(pushedDate.getHours()).toBe(9) // 9am default
    })

    it('clicking 2 weeks calls onPush with date 14 days ahead', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('2 weeks'))

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getDate()).toBe(29) // Jan 29 (14 days from Jan 15)
      expect(pushedDate.getMonth()).toBe(0) // January
      expect(pushedDate.getHours()).toBe(9) // 9am default
    })

    it('clicking 1 month calls onPush with date 1 month ahead', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('1 month'))

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getDate()).toBe(15) // Feb 15 (1 month from Jan 15)
      expect(pushedDate.getMonth()).toBe(1) // February
      expect(pushedDate.getHours()).toBe(9) // 9am default
    })

    it('closes dropdown after selecting Tomorrow', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
    })

    it('closes dropdown after selecting Next Week', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
    })
  })

  describe('date picker mode', () => {
    it('clicking Pick date shows date input', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      expect(document.querySelector('input[type="date"]')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('hides push options when showing date picker', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    })

    it('back button returns to push options', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))

      expect(screen.getByText('Push until')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })

    it('selecting a date calls onPush with correct date', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-02-20' } })

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getFullYear()).toBe(2024)
      expect(pushedDate.getMonth()).toBe(1) // February (0-indexed)
      expect(pushedDate.getDate()).toBe(20)
      // Custom date picker sets to midnight
    })

    it('closes dropdown after selecting custom date', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-02-20' } })

      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })

    it('date input has min value set to today', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput.min).toBe('2024-01-15')
    })

    it('does not call onPush if date input is empty', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '' } })

      expect(mockOnPush).not.toHaveBeenCalled()
    })
  })

  describe('outside click behavior', () => {
    it('closes dropdown on outside click', async () => {
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <PushDropdown onPush={mockOnPush} />
        </div>
      )

      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Push task' }))
      expect(screen.getByText('Push until')).toBeInTheDocument()

      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByText('Push until')).not.toBeInTheDocument()
    })

    it('closes date picker on outside click', async () => {
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <PushDropdown onPush={mockOnPush} />
        </div>
      )

      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Push task' }))
      await user.click(screen.getByText('Pick date...'))
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument()

      await user.click(screen.getByTestId('outside'))

      expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()
    })

    it('resets to main view on reopen after outside click from date picker', async () => {
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <PushDropdown onPush={mockOnPush} />
        </div>
      )

      const user = userEvent.setup()

      // Open and go to date picker
      await user.click(screen.getByRole('button', { name: 'Push task' }))
      await user.click(screen.getByText('Pick date...'))

      // Close with outside click
      await user.click(screen.getByTestId('outside'))

      // Reopen - should be at main view
      await user.click(screen.getByRole('button', { name: 'Push task' }))
      expect(screen.getByText('Push until')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })
  })

  describe('date calculations', () => {
    it('Tomorrow correctly handles month boundary', () => {
      // Set system time to Jan 31
      vi.setSystemTime(new Date('2024-01-31T12:00:00.000Z'))

      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      expect(pushedDate.getDate()).toBe(1)
      expect(pushedDate.getMonth()).toBe(1) // February
      expect(pushedDate.getHours()).toBe(9) // 9am default
    })

    it('Next Week correctly finds next Sunday', () => {
      // Set system time to Dec 28 (a Saturday)
      vi.setSystemTime(new Date('2024-12-28T12:00:00.000Z'))

      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Next Week'))

      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      // Dec 28 is Saturday, next Sunday is Dec 29
      expect(pushedDate.getDay()).toBe(0) // Sunday
      expect(pushedDate.getDate()).toBe(29)
      expect(pushedDate.getMonth()).toBe(11) // December
      expect(pushedDate.getFullYear()).toBe(2024)
    })

    it('Next Week handles year boundary from Sunday', () => {
      // Set system time to Dec 29 (a Sunday)
      vi.setSystemTime(new Date('2024-12-29T12:00:00.000Z'))

      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Next Week'))

      const pushedDate = mockOnPush.mock.calls[0][0] as Date
      // Dec 29 is Sunday, next Sunday is Jan 5
      expect(pushedDate.getDay()).toBe(0) // Sunday
      expect(pushedDate.getDate()).toBe(5)
      expect(pushedDate.getMonth()).toBe(0) // January
      expect(pushedDate.getFullYear()).toBe(2025)
    })
  })

  describe('size variants', () => {
    it('renders correctly with size="md" (default)', () => {
      render(<PushDropdown onPush={mockOnPush} size="md" />)

      const button = screen.getByRole('button', { name: 'Push task' })
      expect(button).toHaveClass('p-1.5', 'rounded-lg')
    })

    it('renders correctly with size="sm"', () => {
      render(<PushDropdown onPush={mockOnPush} size="sm" />)

      const button = screen.getByRole('button', { name: 'Push task' })
      expect(button).toHaveClass('p-1', 'rounded')
      expect(button).not.toHaveClass('rounded-lg')
    })
  })

  describe('accessibility', () => {
    it('trigger button has accessible label', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      expect(screen.getByRole('button', { name: 'Push task' })).toBeInTheDocument()
    })

    it('back button has accessible label', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('Pick date...'))

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })
  })
})
