import type { HomeViewType } from '@/types/homeView'

interface HomeViewSwitcherProps {
  currentView: HomeViewType
  onViewChange: (view: HomeViewType) => void
}

const views: { value: HomeViewType; label: string }[] = [
  { value: 'today', label: 'Day' },
  { value: 'week', label: 'Week' },
]

export function HomeViewSwitcher({
  currentView,
  onViewChange,
}: HomeViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-2">
      {/* Segmented control for Day/Week */}
      <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
        {views.map((view, index) => {
          const isActive = currentView === view.value

          return (
            <button
              key={view.value}
              onClick={() => onViewChange(view.value)}
              aria-label={view.label}
              className={`
                px-4 py-2 text-sm font-medium
                transition-all duration-200 ease-out
                ${index > 0 ? 'border-l border-neutral-200' : ''}
                ${isActive
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }
              `}
            >
              {view.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
