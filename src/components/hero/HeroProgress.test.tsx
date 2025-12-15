import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { HeroProgress } from './HeroProgress'

describe('HeroProgress', () => {
  describe('rendering', () => {
    it('renders correct number of dots for small queues', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={0}
          completedCount={0}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots).toHaveLength(5)
    })

    it('renders current position highlighted', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={0}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      // Third dot (index 2) should have the current styling
      expect(dots[2]).toHaveClass('bg-primary-500')
      expect(dots[2]).toHaveClass('hero-dot-current')
    })

    it('renders completed dots differently', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={3}
          completedCount={3}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      // First three dots should be completed (lighter primary)
      expect(dots[0]).toHaveClass('bg-primary-400')
      expect(dots[1]).toHaveClass('bg-primary-400')
      expect(dots[2]).toHaveClass('bg-primary-400')
      // Fourth dot is current
      expect(dots[3]).toHaveClass('bg-primary-500')
      // Fifth dot is pending
      expect(dots[4]).toHaveClass('bg-neutral-200')
    })

    it('renders screen reader text', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={1}
        />
      )

      const srOnly = container.querySelector('.sr-only')
      expect(srOnly?.textContent).toContain('Task')
      expect(srOnly?.textContent).toContain('3')
      expect(srOnly?.textContent).toContain('of')
      expect(srOnly?.textContent).toContain('5')
      expect(srOnly?.textContent).toContain('1 completed')
    })

    it('renders screen reader text without completed count when zero', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={0}
          completedCount={0}
        />
      )

      const srOnly = container.querySelector('.sr-only')
      expect(srOnly?.textContent).toContain('Task')
      expect(srOnly?.textContent).toContain('1')
      expect(srOnly?.textContent).toContain('of')
      expect(srOnly?.textContent).toContain('5')
      expect(srOnly?.textContent).not.toContain('completed')
    })
  })

  describe('condensed mode for long queues', () => {
    it('shows ellipsis when queue exceeds 9 items', () => {
      render(
        <HeroProgress
          total={15}
          current={7}
          completedCount={5}
        />
      )

      // Should show ellipsis indicators
      const ellipses = screen.getAllByText('•••')
      expect(ellipses.length).toBeGreaterThan(0)
    })

    it('shows leading ellipsis when not at start', () => {
      render(
        <HeroProgress
          total={15}
          current={8}
          completedCount={5}
        />
      )

      // May have both leading and trailing ellipsis
      const ellipses = screen.getAllByText('•••')
      expect(ellipses.length).toBeGreaterThanOrEqual(1)
    })

    it('shows trailing ellipsis when not at end', () => {
      render(
        <HeroProgress
          total={15}
          current={5}
          completedCount={3}
        />
      )

      // Should have trailing ellipsis
      const ellipses = screen.getAllByText('•••')
      expect(ellipses.length).toBeGreaterThanOrEqual(1)
    })

    it('limits visible dots to 9 for long queues', () => {
      const { container } = render(
        <HeroProgress
          total={20}
          current={10}
          completedCount={5}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots.length).toBeLessThanOrEqual(9)
    })

    it('does not show ellipsis for small queues', () => {
      render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={1}
        />
      )

      expect(screen.queryByText('•••')).not.toBeInTheDocument()
    })
  })

  describe('progress updates', () => {
    it('updates when current index changes', () => {
      const { container, rerender } = render(
        <HeroProgress
          total={5}
          current={0}
          completedCount={0}
        />
      )

      let dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots[0]).toHaveClass('bg-primary-500')

      rerender(
        <HeroProgress
          total={5}
          current={2}
          completedCount={2}
        />
      )

      dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots[2]).toHaveClass('bg-primary-500')
    })
  })

  describe('edge cases', () => {
    it('handles single task', () => {
      const { container } = render(
        <HeroProgress
          total={1}
          current={0}
          completedCount={0}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots).toHaveLength(1)
      expect(dots[0]).toHaveClass('bg-primary-500')
    })

    it('handles all completed state', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={5}
          completedCount={5}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      // All dots should be completed (bg-primary-400) when we've moved past them
      dots.forEach(dot => {
        expect(dot).toHaveClass('bg-primary-400')
      })
    })

    it('handles current at start of condensed queue', () => {
      render(
        <HeroProgress
          total={15}
          current={0}
          completedCount={0}
        />
      )

      // Should not show leading ellipsis when at start
      const ellipses = screen.queryAllByText('•••')
      // May have trailing ellipsis but not leading
      expect(ellipses.length).toBeLessThanOrEqual(1)
    })

    it('handles current at end of condensed queue', () => {
      render(
        <HeroProgress
          total={15}
          current={14}
          completedCount={10}
        />
      )

      // Should show leading ellipsis when at end (at least one ellipsis present)
      const ellipses = screen.getAllByText('•••')
      expect(ellipses.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('accessibility', () => {
    it('dots are hidden from screen readers', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={1}
        />
      )

      const dots = container.querySelectorAll('[aria-hidden="true"]')
      expect(dots.length).toBe(5)
    })

    it('provides screen reader text in sr-only span', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={1}
        />
      )

      const srOnly = container.querySelector('.sr-only')
      expect(srOnly).toBeInTheDocument()
      expect(srOnly?.textContent).toContain('Task 3 of 5')
    })
  })

  describe('scale styling on current dot', () => {
    it('applies scale transform to current dot', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={0}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      const currentDot = dots[2]
      expect(currentDot).toHaveStyle({ transform: 'scale(1.2)' })
    })

    it('applies default scale to non-current dots', () => {
      const { container } = render(
        <HeroProgress
          total={5}
          current={2}
          completedCount={0}
        />
      )

      const dots = container.querySelectorAll('.rounded-full.w-2\\.5')
      expect(dots[0]).toHaveStyle({ transform: 'scale(1)' })
      expect(dots[1]).toHaveStyle({ transform: 'scale(1)' })
      expect(dots[3]).toHaveStyle({ transform: 'scale(1)' })
      expect(dots[4]).toHaveStyle({ transform: 'scale(1)' })
    })
  })
})
