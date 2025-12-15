import { useEffect, useRef, useState } from 'react'

interface HeroCelebrationProps {
  show: boolean
}

interface Particle {
  id: number
  emoji: string
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  scale: number
  opacity: number
}

/**
 * HeroCelebration - Completion celebration effects
 *
 * A subtle but delightful confetti burst when completing a task.
 * Uses CSS animations for performance.
 */
export function HeroCelebration({ show }: HeroCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const idCounter = useRef(0)

  // Trigger celebration when show becomes true
  useEffect(() => {
    if (!show) return

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([20, 30, 20])
    }

    // Create burst particles
    const emojis = ['✨', '⭐', '🎉', '💫', '✓']
    const newParticles: Particle[] = []

    // Fewer particles for subtlety (5-7)
    const particleCount = 5 + Math.floor(Math.random() * 3)

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5
      const speed = 80 + Math.random() * 60
      const emoji = emojis[Math.floor(Math.random() * emojis.length)]

      newParticles.push({
        id: idCounter.current++,
        emoji,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40, // Bias upward
        rotation: Math.random() * 360,
        scale: 0.8 + Math.random() * 0.4,
        opacity: 1,
      })
    }

    setParticles(newParticles)

    // Clear particles after animation
    const timer = setTimeout(() => {
      setParticles([])
    }, 1000)

    return () => clearTimeout(timer)
  }, [show])

  // Render checkmark animation
  const [showCheckmark, setShowCheckmark] = useState(false)

  useEffect(() => {
    if (show) {
      setShowCheckmark(true)
      const timer = setTimeout(() => setShowCheckmark(false), 800)
      return () => clearTimeout(timer)
    }
  }, [show])

  if (!show && particles.length === 0 && !showCheckmark) return null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden z-30"
    >
      {/* Central checkmark animation */}
      {showCheckmark && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`hero-checkmark-animate ${showCheckmark ? '' : ''}`}>
            <svg
              width="80"
              height="80"
              viewBox="0 0 80 80"
              className="drop-shadow-lg"
            >
              {/* Background circle */}
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="hsl(168, 45%, 30%)"
                className="hero-checkmark-circle"
              />
              {/* Checkmark */}
              <path
                d="M24 42 L34 52 L56 28"
                fill="none"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hero-checkmark-path"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Confetti particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute left-1/2 top-1/2 hero-confetti-particle"
          style={{
            '--x': `${particle.vx}px`,
            '--y': `${particle.vy}px`,
            fontSize: `${particle.scale * 1.5}rem`,
            animation: `hero-confetti-burst 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
            animationDelay: `${Math.random() * 50}ms`,
          } as React.CSSProperties}
        >
          {particle.emoji}
        </div>
      ))}
    </div>
  )
}

export default HeroCelebration
