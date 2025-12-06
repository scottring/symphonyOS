import type { HomeViewType } from '@/types/homeView'

interface HomeViewSwitcherProps {
  currentView: HomeViewType
  onViewChange: (view: HomeViewType) => void
}

// Simple, elegant toggle icons for Today and Week views

// Today icon - single day focus (sun symbol)
function TodayIcon({ className }: { className?: string }) {
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

// Week icon - calendar grid (7 days)
function WeekIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Calendar container */}
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.5} fill="none" />
      {/* Header bar */}
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth={1.5} />
      {/* Day columns (7 days) */}
      <line x1="5.57" y1="12" x2="5.57" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="8.14" y1="12" x2="8.14" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="10.71" y1="12" x2="10.71" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="13.29" y1="12" x2="13.29" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="15.86" y1="12" x2="15.86" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="18.43" y1="12" x2="18.43" y2="17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  )
}

const views: { value: HomeViewType; label: string; icon: typeof TodayIcon }[] = [
  { value: 'today', label: 'Today', icon: TodayIcon },
  { value: 'week', label: 'Week', icon: WeekIcon },
]

export function HomeViewSwitcher({ currentView, onViewChange }: HomeViewSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-neutral-100/80 rounded-lg p-0.5 gap-0.5">
      {views.map((view) => {
        const isActive = currentView === view.value
        const Icon = view.icon
        return (
          <button
            key={view.value}
            onClick={() => onViewChange(view.value)}
            title={view.label}
            aria-label={view.label}
            className={`
              relative p-2 rounded-md
              transition-all duration-200 ease-out
              ${isActive
                ? 'text-neutral-800 bg-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/50'
              }
            `}
          >
            <Icon className="w-5 h-5" />
          </button>
        )
      })}
    </div>
  )
}
