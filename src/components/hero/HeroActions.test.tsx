import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { HeroActions } from './HeroActions'

describe('HeroActions', () => {
  const defaultProps = {
    onComplete: vi.fn(),
    onDefer: vi.fn(),
    onMore: vi.fn(),
    onSkip: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders Done button', () => {
      render(<HeroActions {...defaultProps} />)

      expect(screen.getByLabelText('Mark task as done')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('renders Defer button', () => {
      render(<HeroActions {...defaultProps} />)

      expect(screen.getByLabelText('Defer to later')).toBeInTheDocument()
      expect(screen.getByText('Defer')).toBeInTheDocument()
    })

    it('renders Skip button', () => {
      render(<HeroActions {...defaultProps} />)

      expect(screen.getByLabelText('Skip this task')).toBeInTheDocument()
    })

    it('renders More button', () => {
      render(<HeroActions {...defaultProps} />)

      expect(screen.getByLabelText('View task details')).toBeInTheDocument()
    })
  })

  describe('Done button', () => {
    it('calls onComplete when clicked', async () => {
      const onComplete = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onComplete={onComplete} />)

      await user.click(screen.getByLabelText('Mark task as done'))

      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('Skip button', () => {
    it('calls onSkip when clicked', async () => {
      const onSkip = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onSkip={onSkip} />)

      await user.click(screen.getByLabelText('Skip this task'))

      expect(onSkip).toHaveBeenCalledTimes(1)
    })
  })

  describe('More button', () => {
    it('calls onMore when clicked', async () => {
      const onMore = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onMore={onMore} />)

      await user.click(screen.getByLabelText('View task details'))

      expect(onMore).toHaveBeenCalledTimes(1)
    })
  })

  describe('Defer button and triage menu', () => {
    it('opens triage menu when Defer clicked', async () => {
      const { user } = render(<HeroActions {...defaultProps} />)

      await user.click(screen.getByLabelText('Defer to later'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('2 weeks')).toBeInTheDocument()
      expect(screen.getByText('1 month')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
      expect(screen.getByText('Archive')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('calls onDefer with tomorrow date when Tomorrow clicked', async () => {
      const onDefer = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onDefer={onDefer} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(calledDate.getDate()).toBe(tomorrow.getDate())
    })

    it('calls onDefer with next Sunday when Next Week clicked', async () => {
      const onDefer = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onDefer={onDefer} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Next Week'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      expect(calledDate.getDay()).toBe(0) // Sunday = 0
    })

    it('calls onArchive when Archive clicked', async () => {
      const onArchive = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onArchive={onArchive} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Archive'))

      expect(onArchive).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when Delete clicked', async () => {
      const onDelete = vi.fn()
      const { user } = render(<HeroActions {...defaultProps} onDelete={onDelete} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Delete'))

      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('shows date picker when Pick date... clicked', async () => {
      const { user } = render(<HeroActions {...defaultProps} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()
      // Date input is rendered in a portal to document.body
      expect(document.body.querySelector('input[type="date"]')).toBeInTheDocument()
    })

    it('can go back from date picker to options', async () => {
      const { user } = render(<HeroActions {...defaultProps} />)

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()

      await user.click(screen.getByText('Back'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })
  })

  describe('time preservation', () => {
    it('preserves original scheduled time when deferring', async () => {
      const onDefer = vi.fn()
      const originalDate = new Date()
      originalDate.setHours(14, 30, 0, 0) // 2:30 PM

      const { user } = render(
        <HeroActions
          {...defaultProps}
          onDefer={onDefer}
          currentScheduledFor={originalDate}
          currentIsAllDay={false}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      expect(calledDate.getHours()).toBe(14)
      expect(calledDate.getMinutes()).toBe(30)
    })
  })

  describe('accessibility', () => {
    it('all buttons have accessible labels', () => {
      render(<HeroActions {...defaultProps} />)

      expect(screen.getByLabelText('Mark task as done')).toBeInTheDocument()
      expect(screen.getByLabelText('Defer to later')).toBeInTheDocument()
      expect(screen.getByLabelText('Skip this task')).toBeInTheDocument()
      expect(screen.getByLabelText('View task details')).toBeInTheDocument()
    })
  })
})
