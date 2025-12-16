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

    it('renders Defer button', () => {
      render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Defer to later')).toBeInTheDocument()
      expect(screen.getByText('Defer')).toBeInTheDocument()
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

  describe('Defer button and defer options', () => {
    it('opens defer options popover when Defer clicked', async () => {
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
      expect(screen.getByText('Next Week')).toBeInTheDocument()
      expect(screen.getByText('Pick date...')).toBeInTheDocument()
    })

    it('closes defer options on outside click', async () => {
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

      // Click outside (simulate mousedown event on document)
      fireEvent.mouseDown(document.body)

      expect(screen.queryByText('Pick date...')).not.toBeInTheDocument()
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

    it('calls onDefer with next Monday date when "Next Week" clicked', async () => {
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
      await user.click(screen.getByText('Next Week'))

      expect(onDefer).toHaveBeenCalledTimes(1)
      const calledDate = onDefer.mock.calls[0][0] as Date
      // Should be next Monday at 9 AM
      expect(calledDate.getDay()).toBe(1) // Monday = 1
      expect(calledDate.getHours()).toBe(9)
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

      expect(screen.queryByText('Pick date...')).not.toBeInTheDocument()
    })

    it('shows date picker when "Pick date..." clicked', async () => {
      const { user, container } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()
      expect(container.querySelector('input[type="date"]')).toBeInTheDocument()
    })

    it('can go back from date picker to options', async () => {
      const { user } = render(
        <HeroActions
          onComplete={vi.fn()}
          onDefer={vi.fn()}
          onMore={vi.fn()}
          onSkip={vi.fn()}
        />
      )

      await user.click(screen.getByLabelText('Defer to later'))
      await user.click(screen.getByText('Pick date...'))

      expect(screen.getByText('Back')).toBeInTheDocument()

      await user.click(screen.getByText('Back'))

      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
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
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()

      // Second click - close
      await user.click(screen.getByLabelText('Defer to later'))
      expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
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
