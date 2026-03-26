import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushDropdown } from './PushDropdown'

describe('PushDropdown', () => {
  const mockOnPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial render', () => {
    it('renders trigger button with push icon', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      expect(screen.getByRole('button', { name: 'Push task' })).toBeInTheDocument()
    })

    it('does not show dropdown initially', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      expect(screen.queryByText('Defer to')).not.toBeInTheDocument()
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

      expect(screen.getByText('Defer to')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.getByText('This Month')).toBeInTheDocument()
      expect(screen.getByText('This Quarter')).toBeInTheDocument()
    })

    it('toggles dropdown on button click', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      const button = screen.getByRole('button', { name: 'Push task' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByText('Defer to')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByText('Defer to')).not.toBeInTheDocument()
    })
  })

  describe('push options', () => {
    it('clicking This Week calls onPush with "week"', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('This Week'))

      expect(mockOnPush).toHaveBeenCalledWith('week')
    })

    it('clicking This Month calls onPush with "month"', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('This Month'))

      expect(mockOnPush).toHaveBeenCalledWith('month')
    })

    it('clicking This Quarter calls onPush with "quarter"', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('This Quarter'))

      expect(mockOnPush).toHaveBeenCalledWith('quarter')
    })

    it('closes dropdown after selecting This Week', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('This Week'))

      expect(screen.queryByText('Defer to')).not.toBeInTheDocument()
    })

    it('closes dropdown after selecting This Month', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      fireEvent.click(screen.getByText('This Month'))

      expect(screen.queryByText('Defer to')).not.toBeInTheDocument()
    })
  })

  describe('Today option', () => {
    it('shows Today option when showTodayOption is true', () => {
      render(<PushDropdown onPush={mockOnPush} showTodayOption />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))

      expect(screen.getByText('Move to')).toBeInTheDocument()
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('does not show Today option by default', () => {
      render(<PushDropdown onPush={mockOnPush} />)

      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('outside click behavior', () => {
    it('closes dropdown on outside click', async () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <PushDropdown onPush={mockOnPush} />
        </div>
      )

      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Push task' }))
      expect(screen.getByText('Defer to')).toBeInTheDocument()

      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByText('Defer to')).not.toBeInTheDocument()
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
  })
})
