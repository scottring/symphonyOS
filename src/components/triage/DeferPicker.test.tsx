import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeferPicker } from './DeferPicker'

describe('DeferPicker', () => {
  const mockOnDefer = vi.fn()

  const defaultProps = {
    onDefer: mockOnDefer,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders defer button', () => {
      render(<DeferPicker {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Defer item' })).toBeInTheDocument()
    })

    it('shows neutral styling when not deferred', () => {
      render(<DeferPicker {...defaultProps} />)

      const button = screen.getByRole('button', { name: 'Defer item' })
      expect(button).toHaveClass('text-neutral-400')
    })

    it('shows amber styling when deferred', () => {
      render(<DeferPicker {...defaultProps} deferredUntil={new Date('2024-12-25')} />)

      const button = screen.getByRole('button', { name: 'Defer item' })
      expect(button).toHaveClass('text-amber-600')
    })

    it('shows defer badge when deferCount >= 2', () => {
      render(<DeferPicker {...defaultProps} deferCount={3} />)

      expect(screen.getByText('↻3')).toBeInTheDocument()
    })

    it('does not show defer badge when deferCount < 2', () => {
      render(<DeferPicker {...defaultProps} deferCount={1} />)

      expect(screen.queryByText('↻1')).not.toBeInTheDocument()
    })
  })

  describe('dropdown', () => {
    it('opens dropdown when button is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))

      expect(screen.getByText('In 3 hours')).toBeInTheDocument()
      expect(screen.getByText('In 6 hours')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('1 month')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
    })

    it('does not show Show Now when not deferred', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))

      expect(screen.queryByText('Show Now')).not.toBeInTheDocument()
    })

    it('shows Show Now when deferred', () => {
      render(<DeferPicker {...defaultProps} deferredUntil={new Date('2024-12-25')} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))

      expect(screen.getByText('Show Now')).toBeInTheDocument()
    })
  })

  describe('defer options', () => {
    it('calls onDefer with tomorrow date when Tomorrow is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)

      // Should be tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      expect(calledDate.toDateString()).toBe(tomorrow.toDateString())
    })

    it('calls onDefer with next Sunday when Next Week is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)

      // Should be next Sunday (day 0) for weekly planning
      expect(calledDate.getDay()).toBe(0) // Sunday
    })

    it('calls onDefer with +3 hours when In 3 hours is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('In 3 hours'))

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)

      // Should be approximately 3 hours from now
      const threeHoursFromNow = new Date()
      threeHoursFromNow.setHours(threeHoursFromNow.getHours() + 3)
      expect(Math.abs(calledDate.getTime() - threeHoursFromNow.getTime())).toBeLessThan(30 * 60 * 1000) // Within 30 min
    })

    it('calls onDefer with +6 hours when In 6 hours is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('In 6 hours'))

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)

      // Should be approximately 6 hours from now
      const sixHoursFromNow = new Date()
      sixHoursFromNow.setHours(sixHoursFromNow.getHours() + 6)
      expect(Math.abs(calledDate.getTime() - sixHoursFromNow.getTime())).toBeLessThan(30 * 60 * 1000) // Within 30 min
    })

    it('calls onDefer with date 1 month out when 1 month is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('1 month'))

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)

      // Should be 1 month from now
      const oneMonth = new Date()
      oneMonth.setMonth(oneMonth.getMonth() + 1)
      expect(calledDate.toDateString()).toBe(oneMonth.toDateString())
    })

    it('calls onDefer with undefined when Show Now is clicked', () => {
      render(<DeferPicker {...defaultProps} deferredUntil={new Date('2024-12-25')} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Show Now'))

      expect(mockOnDefer).toHaveBeenCalledWith(undefined)
    })
  })

  describe('date picker', () => {
    it('shows date input when Pick date is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Pick date...'))

      // Date input has type="date", not role="textbox"
      const dateInput = document.querySelector('input[type="date"]')
      expect(dateInput).toBeInTheDocument()
      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('goes back when Back is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Pick date...'))
      fireEvent.click(screen.getByText('Back'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('calls onDefer when date is selected from date picker', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Pick date...'))

      // Date input has type="date", not role="textbox"
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-12-25' } })

      expect(mockOnDefer).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDefer.mock.calls[0][0]
      expect(calledDate).toBeInstanceOf(Date)
      expect(calledDate.getFullYear()).toBe(2024)
      expect(calledDate.getMonth()).toBe(11) // December (0-indexed)
      expect(calledDate.getDate()).toBe(25)
    })
  })

  describe('closing behavior', () => {
    it('closes dropdown after selecting Tomorrow', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(screen.queryByText('Next Week')).not.toBeInTheDocument()
    })

    it('closes dropdown after selecting Show Now', () => {
      render(<DeferPicker {...defaultProps} deferredUntil={new Date('2024-12-25')} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Show Now'))

      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    })
  })
})
