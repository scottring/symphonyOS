import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhenPicker } from './WhenPicker'

// Mock the date helpers module
vi.mock('@/lib/dateHelpers', () => ({
  getBaseDate: (daysOffset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + daysOffset)
    d.setHours(0, 0, 0, 0)
    return d
  },
  parseDateInput: (dateStr: string) => {
    if (!dateStr) return null
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    d.setHours(0, 0, 0, 0)
    return d
  },
  parseTimeInput: (timeStr: string, baseDate: Date) => {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':').map(Number)
    const d = new Date(baseDate)
    d.setHours(hours, minutes, 0, 0)
    return d
  },
  formatDateLabel: (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() === today.getTime()) return 'Today'
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  },
  getNextWeekend: () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilSat = day === 0 ? 6 : 6 - day
    d.setDate(d.getDate() + daysUntilSat)
    d.setHours(0, 0, 0, 0)
    return d
  },
  getWeekendAfterNext: () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilSat = day === 0 ? 6 : 6 - day
    d.setDate(d.getDate() + daysUntilSat + 7)
    d.setHours(0, 0, 0, 0)
    return d
  },
  formatShortDate: (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
}))

vi.mock('@/lib/inputStyles', () => ({
  DATE_INPUT_CLASS: 'date-input-class',
  TIME_INPUT_CLASS: 'time-input-class',
}))

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

      expect(screen.getByRole('button', { name: 'Set when' })).toBeInTheDocument()
    })

    it('does not show popover initially', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('opening popover', () => {
    it('shows bucket options when clicked', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.getByText('This Month')).toBeInTheDocument()
      expect(screen.getByText('This Quarter')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
    })

    it('shows Back to Inbox option when bucket is set', () => {
      render(<WhenPicker bucket="week" onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))

      expect(screen.getByText('Back to Inbox')).toBeInTheDocument()
    })

    it('does not show Back to Inbox option when no bucket', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))

      expect(screen.queryByText('Back to Inbox')).not.toBeInTheDocument()
    })

    it('toggles popover on button click', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Set when' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByText('Today')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('bucket selection', () => {
    it('selecting This Week calls onChange with "week" bucket', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('This Week'))

      expect(mockOnChange).toHaveBeenCalledWith('week', undefined)
    })

    it('selecting This Month calls onChange with "month" bucket', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('This Month'))

      expect(mockOnChange).toHaveBeenCalledWith('month', undefined)
    })

    it('selecting This Quarter calls onChange with "quarter" bucket', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('This Quarter'))

      expect(mockOnChange).toHaveBeenCalledWith('quarter', undefined)
    })

    it('closes popover after bucket selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('This Week'))

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('day selection → time selection', () => {
    it('selecting Today advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))

      // Should now see time options
      expect(screen.getByText('All Day')).toBeInTheDocument()
      expect(screen.getByText(/Morning/)).toBeInTheDocument()
      expect(screen.getByText(/Afternoon/)).toBeInTheDocument()
      expect(screen.getByText(/Evening/)).toBeInTheDocument()
    })

    it('selecting Tomorrow advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(screen.getByText('All Day')).toBeInTheDocument()
    })

    it('shows This Weekend and Next Weekend in bucket options', () => {
      render(<WhenPicker onChange={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Set when'))
      expect(screen.getByText('This Weekend')).toBeInTheDocument()
      expect(screen.getByText('Next Weekend')).toBeInTheDocument()
    })

    it('selecting This Weekend advances to time selection', () => {
      render(<WhenPicker onChange={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Set when'))
      fireEvent.click(screen.getByText('This Weekend'))
      expect(screen.getByText('All Day')).toBeInTheDocument()
    })
  })

  describe('time selection', () => {
    it('selecting All Day calls onChange with timed bucket and isAllDay=true', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('All Day'))

      expect(mockOnChange).toHaveBeenCalledWith(
        'timed',
        expect.any(Date),
        true
      )
    })

    it('selecting Morning sets 9am', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      expect(mockOnChange).toHaveBeenCalledWith(
        'timed',
        expect.any(Date),
        false
      )
      const calledDate = mockOnChange.mock.calls[0][1] as Date
      expect(calledDate.getHours()).toBe(9)
    })

    it('selecting Afternoon sets 1pm', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Afternoon/))

      const calledDate = mockOnChange.mock.calls[0][1] as Date
      expect(calledDate.getHours()).toBe(13)
    })

    it('selecting Evening sets 6pm', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Evening/))

      const calledDate = mockOnChange.mock.calls[0][1] as Date
      expect(calledDate.getHours()).toBe(18)
    })

    it('clicking Pick time shows time input', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText('Pick time...'))

      expect(document.querySelector('input[type="time"]')).toBeInTheDocument()
    })

    it('closes popover after time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      // Popover should be closed
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })

  describe('date input', () => {
    it('clicking Pick date shows date input', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Pick date...'))

      expect(document.querySelector('input[type="date"]')).toBeInTheDocument()
    })

    it('back button returns to bucket selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Pick date...'))
      fireEvent.click(screen.getByText('Back'))

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('selecting a date advances to time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Pick date...'))

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2024-01-20' } })

      // Should now see time options
      expect(screen.getByText('All Day')).toBeInTheDocument()
    })
  })

  describe('clear functionality', () => {
    it('clicking Back to Inbox calls onChange with inbox bucket', () => {
      render(<WhenPicker bucket="timed" value={new Date()} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Back to Inbox'))

      expect(mockOnChange).toHaveBeenCalledWith('inbox')
    })

    it('closes popover after clearing', () => {
      render(<WhenPicker bucket="timed" value={new Date()} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Back to Inbox'))

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

      await user.click(screen.getByRole('button', { name: 'Set when' }))
      expect(screen.getByText('Today')).toBeInTheDocument()

      // Click outside
      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })

    it('resets step to bucket on outside click', async () => {
      vi.useRealTimers()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <WhenPicker onChange={mockOnChange} />
        </div>
      )

      const user = userEvent.setup()

      // Open and go to time step
      await user.click(screen.getByRole('button', { name: 'Set when' }))
      await user.click(screen.getByText('Today'))
      expect(screen.getByText('All Day')).toBeInTheDocument()

      // Click outside
      await user.click(screen.getByTestId('outside'))

      // Reopen - should be back at bucket step
      await user.click(screen.getByRole('button', { name: 'Set when' }))
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })

  describe('reopen behavior', () => {
    it('resets to bucket step when reopening after time selection', () => {
      render(<WhenPicker onChange={mockOnChange} />)

      // Complete a selection
      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))
      fireEvent.click(screen.getByText('Today'))
      fireEvent.click(screen.getByText(/Morning/))

      // Reopen
      fireEvent.click(screen.getByRole('button', { name: 'Set when' }))

      // Should be at bucket step, not time step
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.queryByText('All Day')).not.toBeInTheDocument()
    })
  })

  it('weekend buttons show their resolved dates', () => {
    render(<WhenPicker onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Set when'))
    // labels now read "This Weekend · <date>" / "Next Weekend · <date>"
    const buttons = screen.getAllByRole('button')
    const thisWeekendBtn = buttons.find(b => /This Weekend ·/.test(b.textContent ?? ''))
    const nextWeekendBtn = buttons.find(b => /Next Weekend ·/.test(b.textContent ?? ''))
    expect(thisWeekendBtn).toBeInTheDocument()
    expect(nextWeekendBtn).toBeInTheDocument()
  })
})
