import type { HomeViewType } from '@/types/homeView'
import type { FamilyMember } from '@/types/family'
import { AssigneeFilter } from './AssigneeFilter'

interface HomeViewSwitcherProps {
  currentView: HomeViewType
  onViewChange: (view: HomeViewType) => void
  inboxCount?: number    // Badge on Day (shows inbox items needing triage)
  // Assignee filter props - now multi-select
  selectedAssignees?: string[]
  onSelectAssignees?: (ids: string[]) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
}

const views: { value: HomeViewType; label: string; hasBadge?: boolean }[] = [
  { value: 'today', label: 'Day', hasBadge: true },
  { value: 'week', label: 'Week' },
]

export function HomeViewSwitcher({
  currentView,
  onViewChange,
  inboxCount = 0,
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
          const count = view.hasBadge ? inboxCount : 0

          return (
            <button
              key={view.value}
              onClick={() => onViewChange(view.value)}
              aria-label={view.label}
              className={`
                relative px-4 py-2 text-sm font-medium
                transition-all duration-200 ease-out
                ${index > 0 ? 'border-l border-neutral-200' : ''}
                ${isActive
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }
              `}
            >
              {view.label}
              {/* Badge */}
              {count > 0 && (
                <span
                  className={`
                    absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1
                    flex items-center justify-center
                    rounded-full text-[10px] font-semibold tabular-nums
                    ${isActive ? 'bg-white text-primary-600' : 'bg-primary-500 text-white'}
                  `}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
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
