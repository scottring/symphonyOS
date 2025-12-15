import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { HeroActions } from './HeroActions'

describe('HeroActions', () => {
  describe('rendering', () => {
    it('renders Done button', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Mark task as done')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('renders Later button', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Defer to later')).toBeInTheDocument()
      expect(screen.getByText('Later')).toBeInTheDocument()
    })

    it('renders Skip button', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Skip this task')).toBeInTheDocument()
    })

    it('renders More button', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('View task details')).toBeInTheDocument()
    })
  })

  describe('Done button', () => {
    it('calls onComplete when clicked', async () => {
      const onComplete = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={onComplete}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Mark task as done'))

      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('Skip button', () => {
    it('calls onSkip when clicked', async () => {
      const onSkip = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={onSkip}
        />
      )

      await user.click(screen.getByLabelText('Skip this task'))

      expect(onSkip).toHaveBeenCalledTimes(1)
    })
  })

  describe('More button', () => {
    it('calls onMore when clicked', async () => {
      const onMore = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={onMore}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('View task details'))

      expect(onMore).toHaveBeenCalledTimes(1)
    })
  })

  describe('Later button and defer options', () => {
    it('opens defer options popover when Later clicked', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))

      expect(screen.getByText('Later today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Next week')).toBeInTheDocument()
    })

    it('closes defer options on backdrop click', async () => {
      const { user, container } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      expect(screen.getByText('Later today')).toBeInTheDocument()

      // Click the backdrop
      const backdrop = container.querySelector('.fixed.inset-0.z-10')
      fireEvent.click(backdrop!)

      expect(screen.queryByText('Later today')).not.toBeInTheDocument()
    })

    it('calls onDefer with later today date when "Later today" clicked', async () => {
      const onDefer = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={onDefer}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Later today'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      const now = new Date()
      // Should be about 2 hours from now
      expect(calledDate.getHours()).toBeGreaterThanOrEqual(now.getHours())
    })

    it('calls onDefer with tomorrow date when "Tomorrow" clicked', async () => {
      const onDefer = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={onDefer}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Tomorrow'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(calledDate.getDate()).toBe(tomorrow.getDate())
      expect(calledDate.getHours()).toBe(9) // Should be 9 AM
    })

    it('calls onDefer with next week date when "Next week" clicked', async () => {
      const onDefer = vi.fn()
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={onDefer}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Next week'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      expect(calledDate.getDate()).toBe(nextWeek.getDate())
      expect(calledDate.getHours()).toBe(9) // Should be 9 AM
    })

    it('closes defer options after selection', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()

      await user.click(screen.getByText('Tomorrow'))

      expect(screen.queryByText('Later today')).not.toBeInTheDocument()
    })

    it('shows time hint for Later today option', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))

      expect(screen.getByText('In 2 hours')).toBeInTheDocument()
    })

    it('shows time hint for Tomorrow option', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))

      expect(screen.getByText('9:00 AM')).toBeInTheDocument()
    })

    it('shows time hint for Next week option', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))

      expect(screen.getByText('Same day, 9:00 AM')).toBeInTheDocument()
    })

    it('toggles defer options popover on multiple clicks', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      // First click - open
      await user.click(screen.getByLabelText('Defer to later'))
      expect(screen.getByText('Later today')).toBeInTheDocument()

      // Second click - close
      await user.click(screen.getByLabelText('Defer to later'))
      expect(screen.queryByText('Later today')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('all buttons have accessible labels', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Mark task as done')).toBeInTheDocument()
      expect(screen.getByLabelText('Defer to later')).toBeInTheDocument()
      expect(screen.getByLabelText('Skip this task')).toBeInTheDocument()
      expect(screen.getByLabelText('View task details')).toBeInTheDocument()
    })
  })
})
