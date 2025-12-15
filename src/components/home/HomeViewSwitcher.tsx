import type { HomeViewType } from '@/types/homeView'
import type { FamilyMember } from '@/types/family'
import { AssigneeFilter } from './AssigneeFilter'

interface HomeViewSwitcherProps {
  currentView: HomeViewType
  onViewChange: (view: HomeViewType) => void
  // Assignee filter props - now multi-select
  selectedAssignees?: string[]
  onSelectAssignees?: (ids: string[]) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
}

const views: { value: HomeViewType; label: string; icon?: React.ReactNode }[] = [
  {
    value: 'home',
    label: 'Home',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  { value: 'today', label: 'Day' },
  { value: 'week', label: 'Week' },
]

export function HomeViewSwitcher({
  currentView,
  onViewChange,
  selectedAssignees = [],
  onSelectAssignees,
  assigneesWithTasks = [],
  hasUnassignedTasks = false,
}: HomeViewSwitcherProps) {
  const showFilter = onSelectAssignees && (assigneesWithTasks.length > 0 || hasUnassignedTasks)

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
                px-4 py-2 text-sm font-medium flex items-center gap-1.5
                transition-all duration-200 ease-out
                ${index > 0 ? 'border-l border-neutral-200' : ''}
                ${isActive
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }
              `}
            >
              {view.icon}
              {view.label}
            </button>
          )
        })}
      </div>
      {/* Assignee Filter - multi-select */}
      {showFilter && (
        <AssigneeFilter
          selectedAssignees={selectedAssignees}
          onSelectAssignees={onSelectAssignees!}
          assigneesWithTasks={assigneesWithTasks}
          hasUnassignedTasks={hasUnassignedTasks}
        />
      )}
    </div>
  )
}
