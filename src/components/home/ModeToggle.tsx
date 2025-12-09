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
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Central circle */}
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={1.5} fill="none" />
      {/* Sun rays */}
      <line x1="12" y1="3" x2="12" y2="5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="21" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="3" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="19" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="5.64" y1="5.64" x2="7.05" y2="7.05" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="16.95" y1="16.95" x2="18.36" y2="18.36" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="5.64" y1="18.36" x2="7.05" y2="16.95" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="16.95" y1="7.05" x2="18.36" y2="5.64" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

// ClipboardCheck icon for Review mode - evening review, checklist
function ClipboardCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

const modes = [
  { value: 'today' as ViewMode, label: 'Today', icon: SunIcon },
  { value: 'review' as ViewMode, label: 'Review', icon: ClipboardCheckIcon },
]

export function ModeToggle({ mode, onModeChange, inboxCount, reviewCount }: ModeToggleProps) {
  return (
    <div className="inline-flex items-center bg-neutral-100/80 rounded-lg p-0.5 gap-0.5">
      {modes.map((view) => {
        const isActive = mode === view.value
        const Icon = view.icon
        const count = view.value === 'today' ? inboxCount : reviewCount
        const isReview = view.value === 'review'

        return (
          <button
            key={view.value}
            onClick={() => onModeChange(view.value)}
            title={view.label}
            aria-label={view.label}
            className={`
              relative p-2 rounded-md
              transition-all duration-200 ease-out
              ${isActive
                ? isReview
                  ? 'text-review-600 bg-white shadow-sm'
                  : 'text-neutral-800 bg-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/50'
              }
            `}
          >
            <Icon className="w-5 h-5" />
            {/* Badge */}
            {count > 0 && (
              <span
                className={`
                  absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1
                  flex items-center justify-center
                  rounded-full text-[10px] font-semibold tabular-nums
                  ${isActive
                    ? isReview
                      ? 'bg-review-500 text-white'
                      : 'bg-primary-500 text-white'
                    : 'bg-neutral-300 text-white'
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
