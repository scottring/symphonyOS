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
  })

  describe('dropdown', () => {
    it('opens dropdown when button is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))

      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('Next Month')).toBeInTheDocument()
      expect(screen.getByText('This Quarter')).toBeInTheDocument()
    })
  })

  describe('defer options', () => {
    it('calls onDefer with "week" when Next Week is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(mockOnDefer).toHaveBeenCalledWith('week')
    })

    it('calls onDefer with "month" when Next Month is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Next Month'))

      expect(mockOnDefer).toHaveBeenCalledWith('month')
    })

    it('calls onDefer with "quarter" when This Quarter is clicked', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('This Quarter'))

      expect(mockOnDefer).toHaveBeenCalledWith('quarter')
    })
  })

  describe('closing behavior', () => {
    it('closes dropdown after selecting Next Week', () => {
      render(<DeferPicker {...defaultProps} />)

      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      fireEvent.click(screen.getByText('Next Week'))

      expect(screen.queryByText('Next Month')).not.toBeInTheDocument()
    })
  })
})
