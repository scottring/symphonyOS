import { useEffect, useRef } from 'react'

interface InboxZeroCelebrationProps {
  isOpen: boolean
  onClose: () => void
  currentStreak: number
}

/**
 * InboxZeroCelebration - Celebrates achieving inbox zero
 *
 * Shows a modal celebration when the user empties their inbox
 * with clarity score above 85%. Auto-dismisses after 5 seconds.
 */
export function InboxZeroCelebration({
  isOpen,
  onClose,
  currentStreak,
}: InboxZeroCelebrationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (isOpen) {
      timerRef.current = setTimeout(() => {
        onClose()
      }, 5000)

      // Trigger confetti if available
      triggerConfetti()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative sparkles */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xl animate-bounce">
          ✨
        </div>

        {/* Celebration emoji */}
        <div className="text-5xl mb-4 animate-bounce" style={{ animationDelay: '100ms' }}>
          🎉
        </div>

        {/* Title */}
        <h2 className="font-display text-2xl font-semibold text-neutral-900 mb-2">
          Inbox Zero!
        </h2>

        {/* Message */}
        <p className="text-neutral-600 mb-4">
          Everything has a temporal home.
          <br />
          You're ready to focus.
        </p>

        {/* Streak indicator */}
        {currentStreak > 0 && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full">
            <span className="text-xl">🔥</span>
            <span className="text-sm font-medium text-amber-700">
              {currentStreak} day streak
            </span>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-6 px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors w-full"
        >
          Continue
        </button>

        {/* Auto-dismiss hint */}
        <p className="text-xs text-neutral-400 mt-3">
          Auto-dismisses in 5 seconds
        </p>
      </div>
    </div>
  )
}

/**
 * Trigger confetti animation using CSS animations as fallback
 * In the future, we can add canvas-confetti as an optional dependency
 */
function triggerConfetti() {
  // Simple CSS-based celebration effect
  // Creates floating emoji particles
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  `
  document.body.appendChild(container)

  const emojis = ['✨', '🎉', '⭐', '🌟', '💫']

  // Create floating particles
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div')
    const emoji = emojis[Math.floor(Math.random() * emojis.length)]
    const left = Math.random() * 100
    const delay = Math.random() * 500
    const duration = 1500 + Math.random() * 1000

    particle.textContent = emoji
    particle.style.cssText = `
      position: absolute;
      left: ${left}%;
      top: -20px;
      font-size: ${16 + Math.random() * 16}px;
      opacity: 0;
      animation: confetti-fall ${duration}ms ease-out ${delay}ms forwards;
    `
    container.appendChild(particle)
  }

  // Add keyframes if not already present
  if (!document.getElementById('confetti-styles')) {
    const style = document.createElement('style')
    style.id = 'confetti-styles'
    style.textContent = `
      @keyframes confetti-fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)
  }

  // Clean up after animation
  setTimeout(() => {
    container.remove()
  }, 3000)
}

export default InboxZeroCelebration
