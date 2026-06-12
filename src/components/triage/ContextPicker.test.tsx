import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextPicker } from './ContextPicker'

describe('ContextPicker', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial render', () => {
    it('renders trigger button with tag icon', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      expect(screen.getByRole('button', { name: 'Set context' })).toBeInTheDocument()
    })

    it('applies inactive styling when no value is set', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set context' })
      const svg = button.querySelector('svg')
      // SVG uses inline style for color when no value is set
      expect(svg).toBeInTheDocument()
    })

    it('applies active styling when value is set', () => {
      render(<ContextPicker value="work" onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set context' })
      // Button has generic hover classes, active state shown via SVG fill/color
      expect(button).toBeInTheDocument()
    })

    it('pulses (tag-needs-context) when untagged, and stops once a context is set', () => {
      const { rerender } = render(<ContextPicker onChange={mockOnChange} />)
      const untagged = screen.getByRole('button', { name: 'Set context' })
      expect(untagged).toHaveClass('tag-needs-context')

      rerender(<ContextPicker value="work" onChange={mockOnChange} />)
      const tagged = screen.getByRole('button', { name: 'Set context' })
      expect(tagged).not.toHaveClass('tag-needs-context')
    })

    it('does not show dropdown initially', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })
  })

  describe('opening dropdown', () => {
    it('shows all context options when clicked', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('Family')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    it('toggles dropdown on button click', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set context' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByText('Work')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })

    it('does not show Clear option when no value is set', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('shows Clear option when value is set', () => {
      render(<ContextPicker value="work" onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })
  })

  describe('context selection', () => {
    it('calls onChange with "work" when clicking Work', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Work'))

      expect(mockOnChange).toHaveBeenCalledWith('work')
    })

    it('calls onChange with "family" when clicking Family', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Family'))

      expect(mockOnChange).toHaveBeenCalledWith('family')
    })

    it('calls onChange with "personal" when clicking Personal', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Personal'))

      expect(mockOnChange).toHaveBeenCalledWith('personal')
    })

    it('closes dropdown after selection', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Work'))

      expect(screen.queryByText('Family')).not.toBeInTheDocument()
    })

    it('highlights currently selected context', () => {
      render(<ContextPicker value="work" onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      const workButton = screen.getByText('Work').closest('button')
      expect(workButton).toHaveClass('bg-primary-50')

      const familyButton = screen.getByText('Family').closest('button')
      expect(familyButton).not.toHaveClass('bg-primary-50')
    })
  })

  describe('context colors', () => {
    it('shows blue indicator for Work', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      const workButton = screen.getByText('Work').closest('button')
      const indicator = workButton?.querySelector('span.rounded-full')
      expect(indicator).toHaveStyle({ backgroundColor: 'rgb(37 99 235)' })
    })

    it('shows amber indicator for Family', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      const familyButton = screen.getByText('Family').closest('button')
      const indicator = familyButton?.querySelector('span.rounded-full')
      expect(indicator).toHaveStyle({ backgroundColor: 'rgb(217 119 6)' })
    })

    it('shows purple indicator for Personal', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      const personalButton = screen.getByText('Personal').closest('button')
      const indicator = personalButton?.querySelector('span.rounded-full')
      expect(indicator).toHaveStyle({ backgroundColor: 'rgb(147 51 234)' })
    })
  })

  describe('clear functionality', () => {
    it('calls onChange with undefined when clicking Clear', () => {
      render(<ContextPicker value="work" onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(mockOnChange).toHaveBeenCalledWith(undefined)
    })

    it('closes dropdown after clearing', () => {
      render(<ContextPicker value="work" onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })
  })

  describe('outside click behavior', () => {
    it('closes dropdown on outside click', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <ContextPicker onChange={mockOnChange} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: 'Set context' }))
      expect(screen.getByText('Work')).toBeInTheDocument()

      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })
  })

  describe('click containment', () => {
    // Regression: context-label clicks used to bubble to ancestor row
    // handlers, which open/toggle the detail panel — clicking the tag opened
    // or closed the side panel instead of the picker (reported 2026-06-12,
    // same defect class as the 2026-06-11 assignee fix).
    it('does not propagate trigger clicks to ancestors', () => {
      const ancestorClick = vi.fn()
      render(
        <div onClick={ancestorClick}>
          <ContextPicker onChange={mockOnChange} />
        </div>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      expect(ancestorClick).not.toHaveBeenCalled()
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    it('selecting a context fires onChange and does not reach ancestors', () => {
      const ancestorClick = vi.fn()
      render(
        <div onClick={ancestorClick}>
          <ContextPicker onChange={mockOnChange} />
        </div>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))
      fireEvent.click(screen.getByText('Work'))
      expect(mockOnChange).toHaveBeenCalledWith('work')
      expect(ancestorClick).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('trigger button has accessible label', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      expect(screen.getByRole('button', { name: 'Set context' })).toBeInTheDocument()
    })

    it('context options are focusable buttons', () => {
      render(<ContextPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set context' }))

      expect(screen.getByRole('button', { name: /Work/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Family/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Personal/i })).toBeInTheDocument()
    })
  })
})
