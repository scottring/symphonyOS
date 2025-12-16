import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TriageMenu } from './TriageMenu'

describe('TriageMenu', () => {
  const defaultProps = {
    onSchedule: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders trigger button', () => {
      render(<TriageMenu {...defaultProps} />)
      expect(screen.getByLabelText('Triage task')).toBeInTheDocument()
    })

    it('renders custom trigger when provided', () => {
      render(
        <TriageMenu
          {...defaultProps}
          trigger={<span data-testid="custom-trigger">Custom</span>}
        />
      )
      expect(screen.getByTestId('custom-trigger')).toBeInTheDocument()
    })
  })

  describe('menu options', () => {
    it('opens menu when trigger clicked', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('2 weeks')).toBeInTheDocument()
      expect(screen.getByText('1 month')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
      expect(screen.getByText('Archive')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('closes menu on outside click', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()

      fireEvent.mouseDown(document.body)

      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    })
  })

  describe('date selection', () => {
    it('calls onSchedule with tomorrow date when Tomorrow clicked', async () => {
      const onSchedule = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onSchedule={onSchedule} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date, isAllDay] = onSchedule.mock.calls[0]
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(date.getDate()).toBe(tomorrow.getDate())
      expect(isAllDay).toBe(true)
    })

    it('calls onSchedule with next Sunday when Next Week clicked', async () => {
      const onSchedule = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onSchedule={onSchedule} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Next Week'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date] = onSchedule.mock.calls[0]
      expect(date.getDay()).toBe(0) // Sunday = 0
    })

    it('calls onSchedule with 2 weeks from now', async () => {
      const onSchedule = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onSchedule={onSchedule} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('2 weeks'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date] = onSchedule.mock.calls[0]
      const twoWeeks = new Date()
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      expect(date.getDate()).toBe(twoWeeks.getDate())
    })

    it('calls onSchedule with 1 month from now', async () => {
      const onSchedule = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onSchedule={onSchedule} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('1 month'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date] = onSchedule.mock.calls[0]
      const oneMonth = new Date()
      oneMonth.setMonth(oneMonth.getMonth() + 1)
      expect(date.getMonth()).toBe(oneMonth.getMonth())
    })

    it('shows date picker when Pick date... clicked', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()
      // Date input is rendered in a portal to document.body
      expect(document.body.querySelector('input[type="date"]')).toBeInTheDocument()
    })

    it('can go back from date picker to options', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()

      await user.click(screen.getByText('Back'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })
  })

  describe('time preservation', () => {
    it('preserves original time when deferring timed task', async () => {
      const onSchedule = vi.fn()
      const originalDate = new Date()
      originalDate.setHours(14, 30, 0, 0) // 2:30 PM

      const { user } = render(
        <TriageMenu
          {...defaultProps}
          onSchedule={onSchedule}
          currentScheduledFor={originalDate}
          currentIsAllDay={false}
        />
      )

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date] = onSchedule.mock.calls[0]
      expect(date.getHours()).toBe(14)
      expect(date.getMinutes()).toBe(30)
    })

    it('uses 9am default for all-day tasks', async () => {
      const onSchedule = vi.fn()

      const { user } = render(
        <TriageMenu
          {...defaultProps}
          onSchedule={onSchedule}
          currentIsAllDay={true}
        />
      )

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onSchedule).toHaveBeenCalledTimes(1)
      const [date] = onSchedule.mock.calls[0]
      expect(date.getHours()).toBe(9)
      expect(date.getMinutes()).toBe(0)
    })
  })

  describe('archive and delete', () => {
    it('calls onArchive when Archive clicked', async () => {
      const onArchive = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onArchive={onArchive} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Archive'))

      expect(onArchive).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when Delete clicked', async () => {
      const onDelete = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onDelete={onDelete} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Delete'))

      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('closes menu after Archive', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Archive'))

      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    })

    it('closes menu after Delete', async () => {
      const { user } = render(<TriageMenu {...defaultProps} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Delete'))

      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    })
  })

  describe('onOpenChange callback', () => {
    it('calls onOpenChange when menu opens', async () => {
      const onOpenChange = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onOpenChange={onOpenChange} />)

      await user.click(screen.getByLabelText('Triage task'))

      expect(onOpenChange).toHaveBeenCalledWith(true)
    })

    it('calls onOpenChange when menu closes', async () => {
      const onOpenChange = vi.fn()
      const { user } = render(<TriageMenu {...defaultProps} onOpenChange={onOpenChange} />)

      await user.click(screen.getByLabelText('Triage task'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
