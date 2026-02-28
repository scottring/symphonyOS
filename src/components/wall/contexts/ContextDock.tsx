import { useState, useCallback } from 'react'
import type { ContextRule } from './types'

interface ContextDockProps {
  rules: ContextRule[]
  onActivate: (ruleId: string) => void
  onDismiss: (ruleId: string) => void
}

function ContextButton({
  rule,
  index,
  onActivate,
  onDismiss,
}: {
  rule: ContextRule
  index: number
  onActivate: () => void
  onDismiss: () => void
}) {
  const [swiping, setSwiping] = useState(false)
  const [startY, setStartY] = useState(0)

  // Swipe down to dismiss
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setStartY(e.clientY)
    setSwiping(false)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const dy = e.clientY - startY
    if (dy > 40) setSwiping(true)
  }, [startY])

  const handlePointerUp = useCallback(() => {
    if (swiping) {
      onDismiss()
    } else {
      onActivate()
    }
    setSwiping(false)
  }, [swiping, onActivate, onDismiss])

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`
        group relative flex items-center gap-3 px-5 py-3 rounded-xl
        border backdrop-blur-md
        transition-all duration-500 ease-out
        hover:scale-[1.03] active:scale-[0.97]
        animate-[contextSlideUp_600ms_ease-out_both]
        ${swiping ? 'opacity-40 translate-y-4' : ''}
      `}
      style={{
        animationDelay: `${index * 120}ms`,
        backgroundColor: rule.color + '20',
        borderColor: rule.color + '35',
        boxShadow: `0 0 20px ${rule.color}10, 0 2px 12px rgba(0,0,0,0.25)`,
        touchAction: 'none',
      }}
    >
      <span className="text-[1.6rem] relative z-10">
        {rule.icon}
      </span>

      <span className="text-white font-black text-[0.9rem] uppercase tracking-wider leading-none relative z-10">
        {rule.label}
      </span>

      <svg
        className="w-5 h-5 text-white/30 ml-1 group-hover:text-white/60 transition-colors"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

export function ContextDock({ rules, onActivate, onDismiss }: ContextDockProps) {
  if (rules.length === 0) return null

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
      {rules.map((rule, i) => (
        <ContextButton
          key={rule.id}
          rule={rule}
          index={i}
          onActivate={() => onActivate(rule.id)}
          onDismiss={() => onDismiss(rule.id)}
        />
      ))}

      {/* CSS for slide-up animation */}
      <style>{`
        @keyframes contextSlideUp {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
