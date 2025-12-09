import { useState, useRef, useEffect } from 'react'

export type ViewMode = 'today' | 'review'

interface ModeToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  inboxCount: number      // Badge on Today (shows inbox items needing triage)
  reviewCount: number     // Badge on Review (incomplete + overdue)
}

// Sun icon for Today mode - warmth, energy, active planning
function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth={1.5} />
      <path
        d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M14.95 5.05l-1.06 1.06M6.11 13.89l-1.06 1.06M14.95 14.95l-1.06-1.06M6.11 6.11L5.05 5.05"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  )
}

// Moon/reflection icon for Review mode - evening, introspection
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path
        d="M17.293 13.293A8 8 0 016.707 2.707a8.003 8.003 0 1010.586 10.586z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ModeToggle({ mode, onModeChange, inboxCount, reviewCount }: ModeToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  // Calculate indicator position based on active mode
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const activeButton = container.querySelector(`[data-mode="${mode}"]`) as HTMLButtonElement
    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }
  }, [mode])

  const modes = [
    { value: 'today' as ViewMode, label: 'Today', icon: SunIcon, count: inboxCount },
    { value: 'review' as ViewMode, label: 'Review', icon: MoonIcon, count: reviewCount },
  ]

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center p-1 rounded-xl"
      style={{
        background: 'linear-gradient(180deg, hsl(38 25% 90%) 0%, hsl(40 30% 92%) 100%)',
        boxShadow: 'inset 0 1px 2px hsl(32 20% 20% / 0.06)',
      }}
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-1 h-[calc(100%-8px)] rounded-lg transition-all duration-300 ease-out"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          background: mode === 'review'
            ? 'linear-gradient(180deg, hsl(28 30% 98%) 0%, hsl(28 25% 96%) 100%)'
            : 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(40 40% 98%) 100%)',
          boxShadow: '0 1px 3px hsl(32 20% 20% / 0.08), 0 2px 6px hsl(32 20% 20% / 0.04)',
        }}
      />

      {modes.map(({ value, label, icon: Icon, count }) => {
        const isActive = mode === value
        const isReview = value === 'review'

        return (
          <button
            key={value}
            data-mode={value}
            onClick={() => onModeChange(value)}
            className={`
              relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg
              font-medium text-sm transition-colors duration-200
              ${isActive
                ? isReview
                  ? 'text-review-600'
                  : 'text-neutral-800'
                : 'text-neutral-400 hover:text-neutral-600'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="font-display tracking-wide">{label}</span>

            {/* Badge */}
            {count > 0 && (
              <span
                className={`
                  min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center
                  rounded-full text-xs font-semibold tabular-nums
                  transition-all duration-200
                  ${isActive
                    ? isReview
                      ? 'bg-review-500 text-white'
                      : 'bg-primary-500 text-white'
                    : 'bg-neutral-200 text-neutral-500'
                  }
                `}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
