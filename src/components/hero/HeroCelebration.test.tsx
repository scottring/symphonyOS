import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@/test/test-utils'
import { HeroCelebration } from './HeroCelebration'

describe('HeroCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('rendering', () => {
    it('renders null when show is false and no particles', () => {
      const { container } = render(<HeroCelebration show={false} />)
      expect(container.firstChild).toBeNull()
    })

    it('renders when show is true', () => {
      const { container } = render(<HeroCelebration show={true} />)
      expect(container.firstChild).not.toBeNull()
    })

    it('renders checkmark animation when show is true', () => {
      render(<HeroCelebration show={true} />)

      // Should have SVG checkmark
      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders checkmark with correct circle', () => {
      render(<HeroCelebration show={true} />)

      const circle = document.querySelector('circle')
      expect(circle).toHaveAttribute('cx', '40')
      expect(circle).toHaveAttribute('cy', '40')
      expect(circle).toHaveAttribute('r', '36')
    })

    it('renders checkmark path', () => {
      render(<HeroCelebration show={true} />)

      const path = document.querySelector('path')
      expect(path).toHaveAttribute('d', 'M24 42 L34 52 L56 28')
      expect(path).toHaveAttribute('stroke', 'white')
    })
  })

  describe('confetti particles', () => {
    it('creates confetti particles when triggered', () => {
      render(<HeroCelebration show={true} />)

      // Should create between 5-7 particles
      const particles = document.querySelectorAll('.hero-confetti-particle')
      expect(particles.length).toBeGreaterThanOrEqual(5)
      expect(particles.length).toBeLessThanOrEqual(7)
    })

    it('particles have emoji content', () => {
      render(<HeroCelebration show={true} />)

      const particles = document.querySelectorAll('.hero-confetti-particle')
      const emojis = ['✨', '⭐', '🎉', '💫', '✓']

      particles.forEach(particle => {
        expect(emojis).toContain(particle.textContent)
      })
    })

    it('clears particles after animation', async () => {
      render(<HeroCelebration show={true} />)

      // Initially should have particles
      expect(document.querySelectorAll('.hero-confetti-particle').length).toBeGreaterThan(0)

      // Advance past the cleanup timer (1000ms)
      await act(async () => {
        vi.advanceTimersByTime(1100)
      })

      expect(document.querySelectorAll('.hero-confetti-particle').length).toBe(0)
    })

    it('particles have animation styles', () => {
      render(<HeroCelebration show={true} />)

      const particle = document.querySelector('.hero-confetti-particle')
      const style = particle?.getAttribute('style')
      expect(style).toContain('animation')
    })
  })

  describe('haptic feedback', () => {
    it('triggers haptic feedback when show becomes true', () => {
      render(<HeroCelebration show={true} />)

      expect(navigator.vibrate).toHaveBeenCalledWith([20, 30, 20])
    })

    it('does not trigger haptic feedback when show is false', () => {
      render(<HeroCelebration show={false} />)

      expect(navigator.vibrate).not.toHaveBeenCalled()
    })
  })

  describe('checkmark animation', () => {
    it('shows checkmark initially when triggered', () => {
      const { container } = render(<HeroCelebration show={true} />)

      const checkmarkContainer = container.querySelector('.hero-checkmark-animate')
      expect(checkmarkContainer).toBeInTheDocument()
    })

    it('hides checkmark after animation delay', async () => {
      const { container } = render(<HeroCelebration show={true} />)

      expect(container.querySelector('.hero-checkmark-animate')).toBeInTheDocument()

      // Advance past the checkmark timer (800ms)
      await act(async () => {
        vi.advanceTimersByTime(900)
      })

      expect(container.querySelector('.hero-checkmark-animate')).not.toBeInTheDocument()
    })

    it('has correct animation classes on SVG elements', () => {
      render(<HeroCelebration show={true} />)

      const circle = document.querySelector('circle')
      const path = document.querySelector('path')

      expect(circle).toHaveClass('hero-checkmark-circle')
      expect(path).toHaveClass('hero-checkmark-path')
    })
  })

  describe('cleanup', () => {
    it('cleans up timers on unmount', () => {
      const { unmount } = render(<HeroCelebration show={true} />)

      // Should not throw when unmounting during animation
      expect(() => {
        unmount()
        vi.advanceTimersByTime(2000)
      }).not.toThrow()
    })

    it('handles show prop changing', async () => {
      const { rerender } = render(<HeroCelebration show={false} />)

      // Initially nothing
      expect(document.querySelectorAll('.hero-confetti-particle').length).toBe(0)

      // Trigger celebration
      rerender(<HeroCelebration show={true} />)
      expect(document.querySelectorAll('.hero-confetti-particle').length).toBeGreaterThan(0)

      // Clear particles
      await act(async () => {
        vi.advanceTimersByTime(1100)
      })

      expect(document.querySelectorAll('.hero-confetti-particle').length).toBe(0)
    })
  })

  describe('pointer events', () => {
    it('has pointer-events-none to not interfere with interaction', () => {
      const { container } = render(<HeroCelebration show={true} />)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('pointer-events-none')
    })
  })

  describe('z-index', () => {
    it('has high z-index to appear above card', () => {
      const { container } = render(<HeroCelebration show={true} />)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('z-30')
    })
  })

  describe('positioning', () => {
    it('covers the full viewport', () => {
      const { container } = render(<HeroCelebration show={true} />)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('absolute')
      expect(wrapper).toHaveClass('inset-0')
    })

    it('checkmark is centered', () => {
      const { container } = render(<HeroCelebration show={true} />)

      const checkmarkWrapper = container.querySelector('.absolute.inset-0.flex.items-center.justify-center')
      expect(checkmarkWrapper).toBeInTheDocument()
    })

    it('particles start from center', () => {
      render(<HeroCelebration show={true} />)

      const particles = document.querySelectorAll('.hero-confetti-particle')
      particles.forEach(particle => {
        expect(particle).toHaveClass('left-1/2')
        expect(particle).toHaveClass('top-1/2')
      })
    })
  })
})
