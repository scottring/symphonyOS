import { useMemo, useState, useCallback, useRef, useEffect, forwardRef } from 'react'
import { logger } from '@/lib/logger'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { ScheduleContextItem } from '@/components/triage'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem, playbookInstanceToTimelineItem } from '@/types/timeline'
import { PlaybookBlockCard } from '@/components/playbook/PlaybookBlockCard'
import { EveningReflection } from '@/components/playbook/EveningReflection'
import { ScanMyDay } from './ScanMyDay'
import { groupByDaySection, type DaySection } from '@/lib/timeUtils'
import { useMobile } from '@/hooks/useMobile'
import { TimeGroup } from './TimeGroup'
import { ScheduleItem } from './ScheduleItem'
import { SwipeableCard } from './SwipeableCard'
import { FollowUpInput } from './FollowUpInput'
import { DateNavigator } from './DateNavigator'
import { InboxSection } from './InboxSection'
import { InboxTaskCard } from './InboxTaskCard'
import { OverdueSection } from './OverdueSection'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { hasCoachingForItem } from '@/lib/coachingMatcher'
import { SundayNudgeBanner } from './SundayNudgeBanner'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { MultiAssigneeDropdown } from '@/components/family/MultiAssigneeDropdown'
// import { CalendarClock } from 'lucide-react' // Hidden - Plan button removed

// Inbox icon
function InboxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
    </svg>
  )
}

// Check if current time is in "organize hours" (morning 6-9am or evening 6-9pm)
function isOrganizeTime(): boolean {
  const hour = new Date().getHours()
  return (hour >= 6 && hour < 9) || (hour >= 18 && hour < 21)
}

interface InboxButtonProps {
  onClick: () => void
  inboxCount: number
  isExpanded: boolean
  pulse?: boolean
}

const InboxButton = forwardRef<HTMLButtonElement, InboxButtonProps>(
  function InboxButton({ onClick, inboxCount, isExpanded, pulse }, ref) {
    const emphasized = isOrganizeTime() && inboxCount > 0

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isExpanded
            ? 'text-primary-700 bg-primary-100'
            : emphasized
            ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
        } ${pulse ? 'animate-pulse ring-2 ring-primary-400 ring-offset-2' : ''}`}
      >
        <InboxIcon className={`w-5 h-5 ${isExpanded || emphasized ? 'text-primary-600' : ''}`} />
        <span className="hidden sm:inline">Inbox</span>
        {inboxCount > 0 && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full text-white text-[10px] font-bold transition-transform ${
            isExpanded || emphasized ? 'bg-primary-500' : 'bg-neutral-400'
          } ${pulse ? 'scale-125' : ''}`}>
            {inboxCount}
          </span>
        )}
      </button>
    )
  }
)

// Inline Clarity indicator - clickable with expandable explanation
interface ClarityIndicatorProps {
  tasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  projectsWithLinkedEvents?: Set<string>
  onScrollToInbox?: () => void
  onOpenProject?: (projectId: string) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
}

function ClarityIndicator({
  tasks,
  projects,
  familyMembers,
  projectsWithLinkedEvents = new Set(),
  onScrollToInbox,
  onOpenProject,
  onAssignTaskAll,
}: ClarityIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const metrics = useSystemHealth({ tasks, projects, projectsWithLinkedEvents })

  // Get unassigned tasks for inline display
  const unassignedTasks = useMemo(() => {
    return tasks.filter(t => !t.completed && !t.assignedTo && !t.assignedToAll?.length)
  }, [tasks])

  // Get empty projects for inline display (exclude projects with linked events)
  const emptyProjectsList = useMemo(() => {
    const incompleteTasks = tasks.filter(t => !t.completed)
    const projectTaskCounts = new Map<string, number>()
    for (const task of incompleteTasks) {
      if (task.projectId) {
        projectTaskCounts.set(task.projectId, (projectTaskCounts.get(task.projectId) || 0) + 1)
      }
    }
    return projects.filter(p =>
      p.status !== 'completed' &&
      p.status !== 'on_hold' &&
      !projectTaskCounts.has(p.id) &&
      !projectsWithLinkedEvents.has(p.id)
    )
  }, [tasks, projects, projectsWithLinkedEvents])

  if (tasks.length === 0) return null

  const colorClass = {
    excellent: 'text-primary-600',
    good: 'text-sage-600',
    fair: 'text-amber-600',
    needsAttention: 'text-orange-600',
  }[metrics.healthColor]

  const ringColor = {
    excellent: 'stroke-primary-500',
    good: 'stroke-sage-500',
    fair: 'stroke-amber-500',
    needsAttention: 'stroke-orange-500',
  }[metrics.healthColor]

  const bgColor = {
    excellent: 'bg-primary-50',
    good: 'bg-sage-50',
    fair: 'bg-amber-50',
    needsAttention: 'bg-orange-50',
  }[metrics.healthColor]

  const size = 32
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (metrics.score / 100) * circumference

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-neutral-100/60 transition-colors"
      >
        {/* Mini ring */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-neutral-100"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={`${ringColor} transition-all duration-500`}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-semibold ${colorClass}`}>
            {metrics.score}
          </span>
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-medium text-neutral-600">Clarity</span>
          <span className={`text-[10px] ${colorClass}`}>{metrics.healthStatus}</span>
        </div>
      </button>

      {/* Expanded explanation popover */}
      {isExpanded && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />
          <div className={`absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-80 p-4 rounded-xl ${bgColor} border border-neutral-200/60 shadow-lg animate-fade-in-scale`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-medium text-neutral-800">Clarity Score</h4>
                <p className={`text-sm ${colorClass}`}>{metrics.healthStatus}</p>
              </div>
              <span className={`text-2xl font-semibold ${colorClass}`}>{metrics.score}</span>
            </div>
            <p className="text-sm text-neutral-600 mb-4">
              {metrics.score >= 85
                ? "Your tasks are well-organized. Keep it up!"
                : "Give each item a home to clear your mind."}
            </p>

            {/* Actionable remediation items */}
            <div className="space-y-2">
              {/* Scheduled items - positive indicator, no action needed */}
              {metrics.itemsWithHome > 0 && (
                <div className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/50">
                  <span className="text-primary-500">✓</span>
                  <span className="flex-1 text-neutral-600">
                    {metrics.itemsWithHome} item{metrics.itemsWithHome !== 1 ? 's' : ''} scheduled
                  </span>
                </div>
              )}

              {/* Fresh inbox items - gentle nudge */}
              {metrics.freshInboxItems > 0 && onScrollToInbox && (
                <button
                  onClick={() => {
                    onScrollToInbox()
                    setIsExpanded(false)
                  }}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/50 hover:bg-white/80 transition-colors w-full text-left group"
                >
                  <span className="text-neutral-400">○</span>
                  <span className="flex-1 text-neutral-600">
                    {metrics.freshInboxItems} new item{metrics.freshInboxItems !== 1 ? 's' : ''} in inbox
                  </span>
                  <span className="text-neutral-400 group-hover:text-primary-600 text-[10px] font-medium">
                    Review →
                  </span>
                </button>
              )}

              {/* Aging items - moderate concern */}
              {metrics.agingItems > 0 && (
                <button
                  onClick={() => {
                    if (onScrollToInbox) {
                      onScrollToInbox()
                    }
                    setIsExpanded(false)
                  }}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-amber-50/80 hover:bg-amber-100/80 transition-colors w-full text-left group"
                >
                  <span className="text-amber-500">●</span>
                  <div className="flex-1">
                    <span className="text-neutral-700">
                      {metrics.agingItems} aging item{metrics.agingItems !== 1 ? 's' : ''}
                    </span>
                    <span className="text-neutral-400 ml-1">(4-7 days)</span>
                  </div>
                  <span className="text-amber-600 group-hover:text-amber-700 text-[10px] font-medium">
                    Review →
                  </span>
                </button>
              )}

              {/* Stale items - needs attention */}
              {metrics.staleItems > 0 && (
                <button
                  onClick={() => {
                    if (onScrollToInbox) {
                      onScrollToInbox()
                    }
                    setIsExpanded(false)
                  }}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-orange-50/80 hover:bg-orange-100/80 transition-colors w-full text-left group"
                >
                  <span className="text-orange-500">●</span>
                  <div className="flex-1">
                    <span className="text-neutral-700">
                      {metrics.staleItems} stale item{metrics.staleItems !== 1 ? 's' : ''}
                    </span>
                    <span className="text-neutral-400 ml-1">(8+ days)</span>
                  </div>
                  <span className="text-orange-600 group-hover:text-orange-700 text-[10px] font-medium">
                    Review →
                  </span>
                </button>
              )}

              {/* Unassigned items - inline list with assignment */}
              {unassignedTasks.length > 0 && (
                <div className="rounded-lg bg-amber-50/50 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs py-1.5 px-2">
                    <span className="text-amber-400">○</span>
                    <span className="text-neutral-700 font-medium">
                      {unassignedTasks.length} unassigned
                    </span>
                    <span className="text-neutral-400">(partial credit)</span>
                  </div>
                  <div className="border-t border-amber-100/50">
                    {unassignedTasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 text-xs py-1.5 px-2 hover:bg-amber-100/30"
                      >
                        <span className="flex-1 text-neutral-600 truncate pl-4">
                          {task.title}
                        </span>
                        {onAssignTaskAll && familyMembers.length > 0 && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <MultiAssigneeDropdown
                              members={familyMembers}
                              selectedIds={task.assignedToAll || []}
                              onSelect={(memberIds) => onAssignTaskAll(task.id, memberIds)}
                              size="sm"
                              label="Assign to"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    {unassignedTasks.length > 5 && (
                      <div className="text-[10px] text-neutral-400 py-1 px-2 pl-6">
                        +{unassignedTasks.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty projects - inline list */}
              {emptyProjectsList.length > 0 && (
                <div className="rounded-lg bg-orange-50/50 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs py-1.5 px-2">
                    <span className="text-orange-400">□</span>
                    <span className="text-neutral-700 font-medium">
                      {emptyProjectsList.length} empty project{emptyProjectsList.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-neutral-400">(-5 pts each)</span>
                  </div>
                  <div className="border-t border-orange-100/50">
                    {emptyProjectsList.slice(0, 5).map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          if (onOpenProject) {
                            onOpenProject(project.id)
                          }
                          setIsExpanded(false)
                        }}
                        className="flex items-center gap-2 text-xs py-1.5 px-2 hover:bg-orange-100/30 w-full text-left"
                      >
                        <span className="flex-1 text-neutral-600 truncate pl-4">
                          {project.name}
                        </span>
                        <span className="text-orange-400 text-[10px]">
                          Add tasks →
                        </span>
                      </button>
                    ))}
                    {emptyProjectsList.length > 5 && (
                      <div className="text-[10px] text-neutral-400 py-1 px-2 pl-6">
                        +{emptyProjectsList.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* All clear message */}
              {metrics.score >= 90 && metrics.freshInboxItems === 0 && metrics.agingItems === 0 && metrics.staleItems === 0 && (
                <div className="flex items-center gap-2 text-xs py-2 px-2 rounded-lg bg-primary-50/50 text-primary-700">
                  <span>✨</span>
                  <span>Everything is organized. Nice work!</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Progress indicator - clickable with expandable explanation
interface ProgressIndicatorProps {
  completed: number
  total: number
  percent: number
}

function ProgressIndicator({ completed, total, percent }: ProgressIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="relative flex-1 flex justify-center">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-neutral-100/60 transition-colors"
      >
        <div className="w-24 sm:w-32">
          <div className="progress-bar">
            <div
              className="absolute inset-0 bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <span className="text-sm text-neutral-500 tabular-nums whitespace-nowrap">
          {completed}/{total} tasks
        </span>
      </button>

      {/* Expanded explanation popover */}
      {isExpanded && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />
          <div className="absolute top-full left-0 mt-2 z-50 w-64 p-4 rounded-xl bg-neutral-50 border border-neutral-200/60 shadow-lg animate-fade-in-scale">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-medium text-neutral-800">Today's Progress</h4>
              <span className="text-lg font-semibold text-primary-600">{Math.round(percent)}%</span>
            </div>
            <p className="text-sm text-neutral-600 mb-3">
              Track your progress through today's tasks and routines. Complete items to fill the bar.
            </p>
            <div className="space-y-1.5 text-xs text-neutral-500">
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="font-medium text-primary-600">{completed}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining</span>
                <span className="font-medium text-neutral-700">{total - completed}</span>
              </div>
              <div className="flex justify-between">
                <span>Total for today</span>
                <span className="font-medium text-neutral-700">{total}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface TodayScheduleProps {
  // View-specific data
  tasks: Task[]
  events: CalendarEvent[]
  routines?: Routine[]
  dateInstances?: ActionableInstance[]
  projects?: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  // Undo-wrapped handlers from HomeView
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  // Assignee filter (managed by HomeView)
  selectedAssignee?: string | null
  onSelectAssignee?: (id: string | null) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
  // Panel state
  panelOpen?: boolean
  onClosePanel?: () => void
  // Bulk actions (managed by HomeView)
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void>
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Morning section skeleton */}
      <div>
        <div className="h-4 skeleton w-20 mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={`m-${i}`} className="flex items-center gap-4 p-4 rounded-2xl bg-bg-elevated border border-neutral-100">
              <div className="w-10 h-6 skeleton" />
              <div className="w-6 h-6 skeleton rounded-lg" />
              <div className="flex-1 h-5 skeleton max-w-xs" />
            </div>
          ))}
        </div>
      </div>
      {/* Afternoon section skeleton */}
      <div>
        <div className="h-4 skeleton w-24 mb-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-bg-elevated border border-neutral-100">
            <div className="w-10 h-6 skeleton" />
            <div className="w-6 h-6 skeleton rounded-lg" />
            <div className="flex-1 h-5 skeleton max-w-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function TodaySchedule({
  tasks,
  events,
  routines = [],
  dateInstances = [],
  projects = [],
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onCompleteRoutine,
  onCompleteEvent,
  loading,
  viewedDate,
  onDateChange,
  selectedAssignee,
  onSelectAssignee,
  assigneesWithTasks = [],
  hasUnassignedTasks = false,
  panelOpen,
  onClosePanel,
  onUpdateTasksBulk,
}: TodayScheduleProps) {
  // Get actions + reference data from context
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onCreateFollowUp, onOpenTask,
    contactsMap, projectsMap, familyMembers = [], eventNotesMap,
    lists = [], listsByCategory, onSendToList, onCreateList,
    onOpenProject,
    playbookInstances, onPlaybookToggleItem, onPlaybookMarkDone,
    onPlaybookReact, onPlaybookTag, onPlaybookNote,
    onPlaybookEdit, onPlaybookDelete, onPlaybookSuppress,
    getDomainForCalendar, activeRules = [], eventContextOverrides,
    dayType, onDayTypeChange,
    onSaveReflection, todayReflection,
    onOpenWeeklyReview,
  } = useScheduleActionsContext()

  const isMobile = useMobile()

  // Follow-up task state: tracks which task just got completed and should show the follow-up input
  const [followUpTaskId, setFollowUpTaskId] = useState<string | null>(null)

  // Handle item selection
  const handleSelectItem = useCallback((itemId: string | null) => {
    onSelectItem(itemId)
  }, [onSelectItem])

  // Handle task toggle with follow-up support
  const handleToggleTaskWithFollowUp = useCallback((taskId: string, wasCompleted: boolean) => {
    onToggleTask(taskId)
    // Only show follow-up when completing (not uncompleting)
    if (!wasCompleted && onCreateFollowUp) {
      setFollowUpTaskId(taskId)
    }
  }, [onToggleTask, onCreateFollowUp])

  // Handle follow-up submission
  const handleFollowUpSubmit = useCallback((title: string, sourceTaskId: string) => {
    if (onCreateFollowUp) {
      onCreateFollowUp(title, sourceTaskId)
    }
    setFollowUpTaskId(null)
  }, [onCreateFollowUp])

  // Dismiss follow-up input
  const handleFollowUpDismiss = useCallback(() => {
    setFollowUpTaskId(null)
  }, [])

  // Hide routines toggle with localStorage persistence
  const [hideRoutines, setHideRoutines] = useState(() => {
    const stored = localStorage.getItem('symphony-hide-routines')
    return stored === 'true'
  })

  const toggleHideRoutines = useCallback(() => {
    setHideRoutines(prev => {
      const newValue = !prev
      localStorage.setItem('symphony-hide-routines', String(newValue))
      return newValue
    })
  }, [])

  // Current minute for coaching block auto-expand (updates every 60s)
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setCurrentMinute(now.getHours() * 60 + now.getMinutes())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Hide coaching toggle with localStorage persistence (hidden by default)
  const [hideCoaching, setHideCoaching] = useState(() => {
    const stored = localStorage.getItem('symphony-hide-coaching')
    return stored === null ? true : stored === 'true'
  })

  const toggleHideCoaching = useCallback(() => {
    setHideCoaching(prev => {
      const newValue = !prev
      localStorage.setItem('symphony-hide-coaching', String(newValue))
      return newValue
    })
  }, [])

  // Auto-show coaching when a block is created from the coaching section
  useEffect(() => {
    const handler = () => setHideCoaching(false)
    window.addEventListener('symphony-show-coaching', handler)
    return () => window.removeEventListener('symphony-show-coaching', handler)
  }, [])

  // Completed inbox items - collapsed by default
  const [showCompletedInbox, setShowCompletedInbox] = useState(() => {
    const stored = localStorage.getItem('symphony-show-completed-inbox')
    return stored === 'true'
  })

  const toggleShowCompletedInbox = useCallback(() => {
    setShowCompletedInbox(prev => {
      const newValue = !prev
      localStorage.setItem('symphony-show-completed-inbox', String(newValue))
      return newValue
    })
  }, [])

  // Flying pill animation for inbox captures
  const organizeButtonRef = useRef<HTMLButtonElement>(null)
  const [flyingPill, setFlyingPill] = useState<{
    title: string
    sourceRect: { top: number; left: number; width: number; height: number }
  } | null>(null)
  const [organizePulse, setOrganizePulse] = useState(false)

  // Open inline inbox (was scroll to inbox)
  const scrollToInbox = useCallback(() => {
    setShowInlineInbox(true)
  }, [])

  // Create a map for efficient task lookup by ID (for parent task names)
  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of tasks) {
      map.set(task.id, task)
    }
    return map
  }, [tasks])

  // Compute set of project IDs that have linked calendar events
  const projectsWithLinkedEvents = useMemo(() => {
    const projectIds = new Set<string>()
    if (eventNotesMap) {
      for (const note of eventNotesMap.values()) {
        if (note.projectId) {
          projectIds.add(note.projectId)
        }
      }
    }
    return projectIds
  }, [eventNotesMap])

  // Helper function to check if an item matches the assignee filter
  const matchesAssigneeFilter = (assignedTo: string | null | undefined): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true // "All" or not specified - show everything
    if (selectedAssignee === 'unassigned') return !assignedTo // Show only unassigned
    return assignedTo === selectedAssignee // Show items assigned to selected person
  }

  // Inline inbox collapsed/expanded state
  const [showInlineInbox, setShowInlineInbox] = useState(false)
  const [showWeekPool, setShowWeekPool] = useState(false)
  // Check if we're viewing today
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      viewedDate.getFullYear() === today.getFullYear() &&
      viewedDate.getMonth() === today.getMonth() &&
      viewedDate.getDate() === today.getDate()
    )
  }, [viewedDate])

  // Listen for inbox add events from QuickCapture (for flying pill animation)
  useEffect(() => {
    const handleInboxAdd = (e: CustomEvent<{
      title: string
      sourceRect: { top: number; left: number; width: number; height: number }
    }>) => {
      // Only animate if we're on today's view and the organize button exists
      if (!isToday || !organizeButtonRef.current) return

      setFlyingPill(e.detail)

      // After animation completes, trigger pulse, expand inbox, and clear pill
      setTimeout(() => {
        setFlyingPill(null)
        setOrganizePulse(true)
        setShowInlineInbox(true) // Auto-expand to show where it landed
        setTimeout(() => setOrganizePulse(false), 600)
      }, 500) // Match the CSS animation duration
    }

    window.addEventListener('symphony:inbox-add', handleInboxAdd as EventListener)
    return () => window.removeEventListener('symphony:inbox-add', handleInboxAdd as EventListener)
  }, [isToday])

  // Overdue tasks: scheduled for past days - only shown on today's view
  // Includes completed tasks so they remain visible after checking off
  const overdueTasks = useMemo(() => {
    if (!isToday) return []

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter((task) => {
      if (!task.scheduledFor) return false
      if (!matchesAssigneeFilter(task.assignedTo)) return false

      const taskDate = new Date(task.scheduledFor)
      taskDate.setHours(0, 0, 0, 0)

      // Only include tasks completed today (not historically completed ones)
      if (task.completed) {
        const completedDate = new Date(task.updatedAt)
        completedDate.setHours(0, 0, 0, 0)
        const todayDate = new Date()
        todayDate.setHours(0, 0, 0, 0)
        if (completedDate.getTime() !== todayDate.getTime()) return false
      }

      return taskDate < today
    })
  }, [tasks, isToday, selectedAssignee, projectsMap])

  // Inbox tasks: needs triage - only shown on today's view
  // Includes: no scheduledFor, OR deferredUntil <= today
  // Inbox tasks — bucket='inbox'
  const inboxTasks = useMemo(() => {
    if (!isToday) return []
    return tasks.filter((task) => {
      if (task.completed) return false
      if (task.bucket !== 'inbox') return false
      if (!matchesAssigneeFilter(task.assignedTo)) return false
      return true
    })
  }, [tasks, isToday, selectedAssignee, projectsMap])

  // This Week pool — bucket='week'
  const weekTasks = useMemo(() => {
    if (!isToday) return []
    return tasks.filter((task) => {
      if (task.completed) return false
      if (task.bucket !== 'week') return false
      if (!matchesAssigneeFilter(task.assignedTo)) return false
      return true
    })
  }, [tasks, isToday, selectedAssignee, projectsMap])

  // This Month pool — bucket='month'
  const monthTasks = useMemo(() => {
    if (!isToday) return []
    return tasks.filter((task) => {
      if (task.completed) return false
      if (task.bucket !== 'month') return false
      if (!matchesAssigneeFilter(task.assignedTo)) return false
      return true
    })
  }, [tasks, isToday, selectedAssignee, projectsMap])

  // Auto-close inbox when it becomes empty
  useEffect(() => {
    if (showInlineInbox && inboxTasks.length === 0) {
      setShowInlineInbox(false)
    }
  }, [showInlineInbox, inboxTasks.length])

  // Completed inbox tasks - tasks completed from inbox/week/month on the viewed date
  const completedInboxTasks = useMemo(() => {
    const startOfDay = new Date(viewedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(viewedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
      if (!task.completed) return false
      if (task.bucket === 'timed') return false // Timed tasks show in schedule
      if (!matchesAssigneeFilter(task.assignedTo)) return false

      const updatedDate = new Date(task.updatedAt)
      if (updatedDate < startOfDay || updatedDate > endOfDay) return false

      return true
    })
  }, [tasks, viewedDate, selectedAssignee])

  // Filter timed tasks for the viewed date (bucket='timed')
  const filteredTasks = useMemo(() => {
    const startOfDay = new Date(viewedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(viewedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
      if (!matchesAssigneeFilter(task.assignedTo)) return false
      if (task.bucket !== 'timed') return false

      if (task.scheduledFor) {
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= startOfDay && taskDate <= endOfDay
      }
      return false
    })
  }, [tasks, viewedDate, selectedAssignee, projectsMap])

  // Filter events for the viewed date and deduplicate by title + start time
  const filteredEvents = useMemo(() => {
    const viewedYear = viewedDate.getFullYear()
    const viewedMonth = viewedDate.getMonth()
    const viewedDay = viewedDate.getDate()

    const eventsForDay = events.filter((event) => {
      const startTimeStr = event.start_time || event.startTime
      if (!startTimeStr) return false

      const eventStart = new Date(startTimeStr)
      return (
        eventStart.getFullYear() === viewedYear &&
        eventStart.getMonth() === viewedMonth &&
        eventStart.getDate() === viewedDay
      )
    })

    const seen = new Set<string>()
    return eventsForDay.filter((event) => {
      const startTimeStr = event.start_time || event.startTime
      const key = `${event.title}|${startTimeStr}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [events, viewedDate])

  // Build instance status map for routines
  // When multiple instances exist for the same routine (e.g. deferred + completed),
  // prefer completed/skipped over deferred/pending
  const routineStatusMap = useMemo(() => {
    const statusPriority: Record<string, number> = {
      completed: 3,
      skipped: 2,
      deferred: 1,
      pending: 0,
    }
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        const existing = map.get(instance.entity_id)
        if (!existing || (statusPriority[instance.status] ?? 0) > (statusPriority[existing.status] ?? 0)) {
          map.set(instance.entity_id, instance)
        }
      }
    }
    return map
  }, [dateInstances])

  // Filter to only routines that should show on timeline (respects both per-routine and global toggle)
  const visibleRoutines = useMemo(() =>
    hideRoutines ? [] : routines.filter(r => r.show_on_timeline !== false),
    [routines, hideRoutines]
  )

  // Build instance status map for events
  const eventStatusMap = useMemo(() => {
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        map.set(instance.entity_id, instance)
      }
    }
    return map
  }, [dateInstances])

  // Use filtered tasks directly
  const allFilteredTasks = filteredTasks

  const grouped = useMemo(() => {
    const taskItems = allFilteredTasks.map(taskToTimelineItem)

    // Map and filter events by assignee
    const eventItems = filteredEvents
      .map((event) => {
        const item = eventToTimelineItem(event)
        const eventId = event.google_event_id || event.id
        const eventNote = eventNotesMap?.get(eventId)
        if (eventNote?.notes) {
          item.notes = eventNote.notes
        }
        if (eventNote?.assignedTo) {
          item.assignedTo = eventNote.assignedTo
        }
        // Resolve event context: override → calendar domain mapping → null
        const contextOverride = eventContextOverrides?.get(eventId)
        if (contextOverride) {
          item.context = contextOverride
        } else if (getDomainForCalendar) {
          const calendarId = event.calendar_id || event.calendarId
          const calendarName = event.calendar_name || event.calendarName
          const resolved = getDomainForCalendar(calendarId, calendarName)
          if (resolved) {
            item.context = resolved
          }
        }
        // Check if event is completed via actionable_instances
        const instance = eventStatusMap.get(eventId)
        if (instance?.status === 'completed') {
          item.completed = true
        }
        // Override time if rescheduled (deferred_to on same day)
        if (instance?.deferred_to && instance.status === 'pending') {
          const deferredTime = new Date(instance.deferred_to)
          item.startTime = deferredTime
        }
        return item
      })
      .filter((item) => matchesAssigneeFilter(item.assignedTo))

    // Map and filter routines by assignee
    const routineItems = visibleRoutines
      .filter((routine) => matchesAssigneeFilter(routine.assigned_to))
      .map((routine) => {
        const item = routineToTimelineItem(routine, viewedDate)
        const instance = routineStatusMap.get(routine.id)
        if (instance?.status === 'completed') {
          item.completed = true
        } else if (instance?.status === 'skipped') {
          item.skipped = true
        }
        // Override time if rescheduled
        // This applies when:
        // 1. Same-day reschedule (status='pending', deferred_to is a time change)
        // 2. Cross-day reschedule showing on target day (status='deferred', viewing the deferred_to date)
        if (instance?.deferred_to) {
          const deferredTime = new Date(instance.deferred_to)
          const deferredDateStr = deferredTime.toISOString().split('T')[0]
          const viewedDateStr = viewedDate.toISOString().split('T')[0]

          // Apply time override if:
          // - Same-day time change (pending status)
          // - Or this is a deferred routine and we're viewing the target date
          if (instance.status === 'pending' || (instance.status === 'deferred' && deferredDateStr === viewedDateStr)) {
            item.startTime = deferredTime
          }
        }
        return item
      })

    // Map playbook instances (if coaching is visible)
    const playbookItems = hideCoaching ? [] : (playbookInstances ?? [])
      .map(instance => playbookInstanceToTimelineItem(instance, viewedDate))

    const allItems = [...taskItems, ...eventItems, ...routineItems, ...playbookItems]
    return groupByDaySection(allItems)
  }, [allFilteredTasks, filteredEvents, visibleRoutines, viewedDate, routineStatusMap, eventStatusMap, eventNotesMap, selectedAssignee, hideCoaching, playbookInstances, getDomainForCalendar, eventContextOverrides])

  // Compute which items have coaching available (for sparkle indicator)
  const coachingItemIds = useMemo(() => {
    if (hideCoaching || activeRules.length === 0) return new Set<string>()
    const ids = new Set<string>()
    for (const section of Object.values(grouped)) {
      for (const item of section) {
        if (item.type !== 'playbook' && hasCoachingForItem(item, activeRules)) {
          ids.add(item.id)
        }
      }
    }
    return ids
  }, [grouped, activeRules, hideCoaching])

  const sections: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

  const formatDate = () => {
    return viewedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  // Calculate completion stats (only scheduled tasks, not inbox)
  const completedTasks = allFilteredTasks.filter((t) => t.completed).length
  const completedRoutines = visibleRoutines.filter((r) => routineStatusMap.get(r.id)?.status === 'completed').length
  const completedOverdue = overdueTasks.filter((t) => t.completed).length
  const completedCount = completedTasks + completedRoutines + completedOverdue
  const incompleteOverdue = overdueTasks.filter((t) => !t.completed).length
  const actionableCount = allFilteredTasks.length + visibleRoutines.length + incompleteOverdue + completedOverdue
  const totalItems = allFilteredTasks.length + filteredEvents.length + visibleRoutines.length + inboxTasks.length + overdueTasks.length
  const progressPercent = actionableCount > 0 ? (completedCount / actionableCount) * 100 : 0

  // Callback to get schedule items for a specific date (used by SchedulePopover)
  const getScheduleItemsForDate = useCallback((date: Date): ScheduleContextItem[] => {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const items: ScheduleContextItem[] = []

    // Add tasks scheduled for this date
    tasks.forEach(task => {
      if (!task.scheduledFor) return
      const taskDate = new Date(task.scheduledFor)
      if (taskDate >= startOfDay && taskDate <= endOfDay) {
        items.push({
          id: task.id,
          title: task.title,
          startTime: taskDate,
          endTime: task.isAllDay ? undefined : new Date(taskDate.getTime() + 3600000), // Assume 1 hour
          allDay: task.isAllDay,
          type: 'task',
          completed: task.completed,
        })
      }
    })

    // Add events for this date
    events.forEach(event => {
      const startTimeStr = event.start_time || event.startTime
      if (!startTimeStr) return
      const eventStart = new Date(startTimeStr)
      if (eventStart >= startOfDay && eventStart <= endOfDay) {
        const endTimeStr = event.end_time || event.endTime
        items.push({
          id: event.id,
          title: event.title,
          startTime: eventStart,
          endTime: endTimeStr ? new Date(endTimeStr) : undefined,
          allDay: event.all_day || event.allDay,
          type: 'event',
        })
      }
    })

    // Add routines for this date (routines repeat, so check if this date matches)
    visibleRoutines.forEach(routine => {
      // For simplicity, add all routines with their time_of_day
      // In a real implementation, you'd check the recurrence_pattern
      if (routine.time_of_day) {
        const [hours, minutes] = routine.time_of_day.split(':').map(Number)
        const routineTime = new Date(date)
        routineTime.setHours(hours, minutes, 0, 0)
        items.push({
          id: routine.id,
          title: routine.name,
          startTime: routineTime,
          endTime: new Date(routineTime.getTime() + 1800000), // 30 min default
          type: 'routine',
          completed: routineStatusMap.get(routine.id)?.status === 'completed',
        })
      }
    })

    // Sort by start time
    items.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))

    return items
  }, [tasks, events, visibleRoutines, routineStatusMap])

  return (
    <div className="px-2 py-3 md:px-10 md:py-10 max-w-[680px] mx-auto">
      {/* Header - Compact on mobile, editorial on desktop */}
      <header className="mb-4 md:mb-10 animate-fade-in-up">
        {/* Mobile: Compact single-line header */}
        {isMobile ? (
          <div className="flex items-center">
            <DateNavigator
              date={viewedDate}
              onDateChange={onDateChange}
              label={isToday ? viewedDate.toLocaleDateString('en-US', { weekday: 'long' }) : formatDate()}
            />
            {/* Spacer */}
            <div className="flex-1" />
            {/* Right side controls - unified group */}
            <div className="flex items-center pr-3">
              {/* Inbox */}
              {isToday && (
                <button
                  ref={organizeButtonRef}
                  onClick={() => setShowInlineInbox(prev => !prev)}
                  className={`flex items-center gap-0.5 mr-2 transition-all ${
                    showInlineInbox ? 'text-primary-600' : 'text-neutral-400'
                  } ${organizePulse ? 'animate-pulse' : ''}`}
                >
                  <InboxIcon className="w-3 h-3" />
                  <span className="text-[11px] tabular-nums">{inboxTasks.length}</span>
                </button>
              )}
              {/* Week pool count */}
              {isToday && weekTasks.length > 0 && (
                <button
                  onClick={() => setShowWeekPool(prev => !prev)}
                  className={`flex items-center gap-0.5 mr-2 transition-all ${
                    showWeekPool ? 'text-blue-600' : 'text-neutral-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-[11px] tabular-nums">{weekTasks.length}</span>
                </button>
              )}
              {/* Routines toggle */}
              {routines.length > 0 && (
                <button
                  onClick={toggleHideRoutines}
                  className={`relative flex items-center mr-2 transition-all ${
                    hideRoutines ? 'text-neutral-300' : 'text-neutral-400'
                  }`}
                  title={hideRoutines ? 'Show routines' : 'Hide routines'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
                    />
                  </svg>
                  {hideRoutines && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-3 h-0.5 bg-neutral-300 rotate-45" />
                    </span>
                  )}
                </button>
              )}
              {/* Coaching toggle */}
              {(playbookInstances ?? []).length > 0 && (
                <button
                  onClick={toggleHideCoaching}
                  className={`relative flex items-center mr-2 transition-all ${
                    hideCoaching ? 'text-neutral-300' : 'text-amber-500'
                  }`}
                  title={hideCoaching ? 'Show coaching' : 'Hide coaching'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                  {hideCoaching && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-3 h-0.5 bg-neutral-300 rotate-45" />
                    </span>
                  )}
                </button>
              )}
              {/* Progress */}
              {actionableCount > 0 && (
                <span className="text-[11px] text-neutral-400 tabular-nums">{completedCount}/{actionableCount}</span>
              )}
            </div>
          </div>
        ) : (
          /* Desktop: Full editorial header */
          <>
            <div className="flex items-end gap-3 mb-6">
              <h1 className="font-display text-4xl md:text-5xl text-neutral-900 tracking-tight leading-none">
                {isToday ? (
                  <>
                    <span className="text-neutral-400 font-normal text-2xl md:text-3xl block mb-1">Today is</span>
                    {viewedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                  </>
                ) : (
                  formatDate()
                )}
              </h1>
              <DateNavigator date={viewedDate} onDateChange={onDateChange} showTodayButton={!isToday} />
            </div>

            {/* Stats row: Inbox, Progress (centered), Clarity */}
            <div className="flex items-center gap-4 pt-5 border-t border-neutral-200/60">
              {/* Inbox button - left side */}
              {isToday && (
                <InboxButton
                  ref={organizeButtonRef}
                  onClick={() => setShowInlineInbox(prev => !prev)}
                  inboxCount={inboxTasks.length}
                  isExpanded={showInlineInbox}
                  pulse={organizePulse}
                />
              )}

              {/* Progress - centered with flex-1 */}
              {actionableCount > 0 && (
                <ProgressIndicator
                  completed={completedCount}
                  total={actionableCount}
                  percent={progressPercent}
                />
              )}

              {/* Assignee filter */}
              {onSelectAssignee && (assigneesWithTasks.length > 0 || hasUnassignedTasks) && (
                <AssigneeFilter
                  selectedAssignees={selectedAssignee ? [selectedAssignee] : []}
                  onSelectAssignees={(ids) => onSelectAssignee(ids.length > 0 ? ids[0] : null)}
                  assigneesWithTasks={assigneesWithTasks}
                  hasUnassignedTasks={hasUnassignedTasks}
                />
              )}

              {/* Routines toggle - only show if there are routines */}
              {routines.length > 0 && (
                <button
                  onClick={toggleHideRoutines}
                  className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                    hideRoutines
                      ? 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                      : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                  }`}
                  title={hideRoutines ? 'Show routines' : 'Hide routines'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-4 h-4 ${hideRoutines ? 'opacity-50' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
                    />
                  </svg>
                  {hideRoutines && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-5 h-0.5 bg-neutral-400 rotate-45" />
                    </span>
                  )}
                </button>
              )}

              {/* Coaching toggle - only show if there are playbook instances */}
              {(playbookInstances ?? []).length > 0 && (
                <button
                  onClick={toggleHideCoaching}
                  className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                    hideCoaching
                      ? 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                      : 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
                  }`}
                  title={hideCoaching ? 'Show coaching' : 'Hide coaching'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${hideCoaching ? 'opacity-50' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                  {hideCoaching && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-5 h-0.5 bg-neutral-400 rotate-45" />
                    </span>
                  )}
                </button>
              )}

              {/* Clarity score - right side */}
              {isToday && !loading && tasks.length > 0 && (
                <ClarityIndicator
                  tasks={tasks}
                  projects={projects}
                  familyMembers={familyMembers}
                  projectsWithLinkedEvents={projectsWithLinkedEvents}
                  onScrollToInbox={scrollToInbox}
                  onOpenProject={onOpenProject}
                  onAssignTaskAll={onAssignTaskAll}
                />
              )}
            </div>
          </>
        )}
      </header>

      {/* Scan My Day - morning briefing card */}
      {isToday && !loading && !hideCoaching && (
        <ScanMyDay
          tasks={allFilteredTasks}
          events={filteredEvents}
          playbookInstances={playbookInstances ?? []}
          dayType={dayType}
          onDayTypeChange={onDayTypeChange}
        />
      )}

      {/* Sunday nudge banner - shown on Sundays when coaching is visible */}
      {isToday && !hideCoaching && viewedDate.getDay() === 0 && onOpenWeeklyReview && (
        <SundayNudgeBanner onOpenWeeklyReview={onOpenWeeklyReview} />
      )}

      {/* Inline collapsible inbox section */}
      {isToday && showInlineInbox && inboxTasks.length > 0 && onUpdateTask && onPushTask && (
        <div className="mb-4 md:mb-8 animate-fade-in-up">
          <div className="rounded-xl md:rounded-2xl border border-neutral-200 bg-neutral-50/50">
            {/* Inbox header */}
            <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 border-b border-neutral-200/60">
              <button
                onClick={() => setShowInlineInbox(false)}
                className="ml-auto p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Inbox items with bulk select */}
            <div className="p-2 md:p-3">
              <InboxSection
                tasks={inboxTasks}
                onUpdateTask={onUpdateTask}
                onToggleWaiting={onToggleWaiting}
                onPushTask={onPushTask}
                onSelectTask={(taskId) => handleSelectItem(`task-${taskId}`)}
                projects={projects}
                onOpenProject={onOpenProject}
                familyMembers={familyMembers}
                onAssignTaskAll={onAssignTaskAll}
                getScheduleItemsForDate={getScheduleItemsForDate}
                lists={lists}
                listsByCategory={listsByCategory}
                onSendToList={onSendToList}
                onCreateList={onCreateList}
                onUpdateTasksBulk={onUpdateTasksBulk}
                panelOpen={panelOpen}
                onClosePanel={onClosePanel}
              />
            </div>
          </div>
        </div>
      )}

      {/* This Week pool — pull tasks into today */}
      {isToday && showWeekPool && weekTasks.length > 0 && onUpdateTask && (
        <div className="mb-4 md:mb-8 animate-fade-in-up">
          <div className="rounded-xl md:rounded-2xl border border-blue-200 bg-blue-50/30">
            <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 border-b border-blue-200/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-sm font-medium text-blue-700">This Week</span>
                <span className="text-xs text-blue-400">{weekTasks.length}</span>
              </div>
              <button
                onClick={() => setShowWeekPool(false)}
                className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="p-2 md:p-3 space-y-1">
              {weekTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/80 hover:bg-white transition-colors group cursor-pointer"
                  onClick={() => handleSelectItem(`task-${task.id}`)}
                >
                  <span className="text-sm text-neutral-700 flex-1">{task.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      onUpdateTask(task.id, { bucket: 'timed', scheduledFor: today, isAllDay: true })
                    }}
                    className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-md bg-primary-50 text-primary-600 text-xs font-medium
                               hover:bg-primary-100 transition-all"
                  >
                    Pull to Today
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : totalItems === 0 ? (
        <div className="text-center py-16 animate-fade-in-up">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-neutral-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          </div>
          {isToday ? (
            <>
              <p className="font-display text-xl text-neutral-700 mb-2">Your day is clear</p>
              <p className="text-neutral-500">Press <kbd className="px-2 py-1 bg-neutral-100 rounded-md text-xs font-mono">Cmd+K</kbd> to add a task</p>
            </>
          ) : (
            <p className="font-display text-xl text-neutral-600">
              Nothing scheduled for {viewedDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* Overdue section - at top, only on today's view */}
          {isToday && overdueTasks.length > 0 && (
            <OverdueSection
              tasks={overdueTasks}
              selectedItemId={selectedItemId}
              onSelectTask={onSelectItem}
              onToggleTask={onToggleTask}
              onToggleWaiting={onToggleWaiting}
              onPushTask={onPushTask}
              onUpdateTask={onUpdateTask}
              contactsMap={contactsMap}
              projectsMap={projectsMap}
              familyMembers={familyMembers}
              onAssignTask={onAssignTask}
              followUpTaskId={followUpTaskId}
              onToggleWithFollowUp={handleToggleTaskWithFollowUp}
              onFollowUpSubmit={onCreateFollowUp ? handleFollowUpSubmit : undefined}
              onFollowUpDismiss={handleFollowUpDismiss}
            />
          )}

          {sections.map((section) => {
            const items = grouped[section]
            return (
              <TimeGroup key={section} section={section} isEmpty={items.length === 0}>
                {items.map((item) => {
                  const contactName = item.contactId && contactsMap?.get(item.contactId)?.name
                  const projectName = item.projectId && projectsMap?.get(item.projectId)?.name
                  const parentTaskId = item.parentTaskId
                  const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                  const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null

                  // Render PlaybookBlockCard for playbook items
                  if (item.type === 'playbook' && item.originalPlaybookInstance) {
                    return (
                      <PlaybookBlockCard
                        key={item.id}
                        instance={item.originalPlaybookInstance}
                        currentMinute={isToday ? currentMinute : undefined}
                        onToggleItem={onPlaybookToggleItem ?? (() => {})}
                        onMarkDone={onPlaybookMarkDone ?? (() => {})}
                        onReact={onPlaybookReact ?? (() => {})}
                        onTag={onPlaybookTag ?? (() => {})}
                        onNote={onPlaybookNote ?? (() => {})}
                        onEdit={onPlaybookEdit}
                        onDelete={onPlaybookDelete}
                        onSuppress={onPlaybookSuppress}
                      />
                    )
                  }

                  // Use SwipeableCard on mobile for better touch interactions
                  if (isMobile) {
                    const sourceTask = taskId ? tasksMap.get(taskId) : undefined
                    return (
                      <div key={item.id}>
                        <SwipeableCard
                          item={item}
                          selected={selectedItemId === item.id}
                          onSelect={() => {}} // Disabled - no action on tap
                          onComplete={() => {
                            if (item.type === 'task' && taskId) {
                              handleToggleTaskWithFollowUp(taskId, !!item.completed)
                            } else if (item.type === 'routine' && onCompleteRoutine) {
                              const routineId = item.id.replace('routine-', '')
                              onCompleteRoutine(routineId, !item.completed)
                            } else if (item.type === 'event' && onCompleteEvent) {
                              const eventId = item.id.replace('event-', '')
                              onCompleteEvent(eventId, !item.completed)
                            }
                          }}
                          onToggleWaiting={
                            item.type === 'task' && taskId && onToggleWaiting
                              ? () => onToggleWaiting(taskId)
                              : undefined
                          }
                          onDefer={item.type === 'task' && taskId && onPushTask
                            ? (date: Date) => onPushTask(taskId, date)
                            : undefined
                          }
                          onSkip={
                            item.type === 'routine' && onSkipRoutine
                              ? () => onSkipRoutine(item.id.replace('routine-', ''))
                              : item.type === 'event' && onSkipEvent
                              ? () => onSkipEvent(item.id.replace('event-', ''))
                              : undefined
                          }
                          onOpenDetail={() => handleSelectItem(item.id)}
                          familyMembers={familyMembers}
                          assignedTo={item.assignedTo}
                          onAssign={
                            item.type === 'task' && taskId && onAssignTask
                              ? (memberId) => onAssignTask(taskId, memberId)
                              : item.type === 'event' && onAssignEvent
                              ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
                              : item.type === 'routine' && onAssignRoutine
                              ? (memberId) => onAssignRoutine(item.id.replace('routine-', ''), memberId)
                              : undefined
                          }
                        />
                        {followUpTaskId === taskId && taskId && sourceTask && (
                          <FollowUpInput
                            sourceTask={sourceTask}
                            onSubmit={(title) => handleFollowUpSubmit(title, taskId)}
                            onDismiss={handleFollowUpDismiss}
                            projectName={projectName || undefined}
                          />
                        )}
                      </div>
                    )
                  }

                  const sourceTaskForFollowUp = taskId ? tasksMap.get(taskId) : undefined
                  return (
                    <div key={item.id}>
                    <ScheduleItem
                      item={item}
                      selected={selectedItemId === item.id}
                      onSelect={() => handleSelectItem(item.id)}
                      onToggleWaiting={
                        item.type === 'task' && taskId && onToggleWaiting
                          ? () => onToggleWaiting(taskId)
                          : undefined
                      }
                      onToggleComplete={() => {
                        if (item.type === 'task' && taskId) {
                          handleToggleTaskWithFollowUp(taskId, !!item.completed)
                        } else if (item.type === 'routine' && onCompleteRoutine) {
                          const routineId = item.id.replace('routine-', '')
                          onCompleteRoutine(routineId, !item.completed)
                        } else if (item.type === 'event' && onCompleteEvent) {
                          const eventId = item.id.replace('event-', '')
                          onCompleteEvent(eventId, !item.completed)
                        }
                      }}
                      onPush={
                        item.type === 'task' && taskId && onPushTask
                          ? (date: Date) => onPushTask(taskId, date)
                          : item.type === 'routine' && onPushRoutine
                          ? (date: Date) => onPushRoutine(item.id.replace('routine-', ''), date)
                          : item.type === 'event' && onPushEvent
                          ? (date: Date) => onPushEvent(item.id.replace('event-', ''), date)
                          : undefined
                      }
                      onSchedule={item.type === 'task' && taskId && onUpdateTask
                        ? (date: Date, isAllDay: boolean) => onUpdateTask(taskId, { bucket: 'timed', scheduledFor: date, isAllDay })
                        : undefined
                      }
                      onSkip={
                        item.type === 'routine' && onSkipRoutine
                          ? () => onSkipRoutine(item.id.replace('routine-', ''))
                          : item.type === 'event' && onSkipEvent
                          ? () => onSkipEvent(item.id.replace('event-', ''))
                          : undefined
                      }
                      contactName={contactName || undefined}
                      projectName={projectName || undefined}
                      projectId={item.projectId || undefined}
                      parentTaskName={parentTaskName}
                      parentTaskId={parentTaskId}
                      onOpenParentTask={onOpenTask}
                      familyMembers={familyMembers}
                      assignedTo={item.assignedTo}
                      onAssign={
                        item.type === 'task' && taskId && onAssignTask
                          ? (memberId) => onAssignTask(taskId, memberId)
                          : item.type === 'event' && onAssignEvent
                          ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
                          : item.type === 'routine' && onAssignRoutine
                          ? (memberId) => onAssignRoutine(item.id.replace('routine-', ''), memberId)
                          : undefined
                      }
                      assignedToAll={
                        item.type === 'event' && eventNotesMap
                          ? eventNotesMap.get(item.id.replace('event-', ''))?.assignedToAll ?? []
                          : item.type === 'task'
                          ? item.originalTask?.assignedToAll ?? []
                          : item.type === 'routine'
                          ? item.originalRoutine?.assigned_to_all ?? []
                          : []
                      }
                      onAssignAll={
                        item.type === 'task' && taskId && onAssignTaskAll
                          ? (memberIds) => onAssignTaskAll(taskId, memberIds)
                          : item.type === 'event' && onAssignEventAll
                          ? (memberIds) => onAssignEventAll(item.id.replace('event-', ''), memberIds)
                          : item.type === 'routine' && onAssignRoutineAll
                          ? (memberIds) => onAssignRoutineAll(item.id.replace('routine-', ''), memberIds)
                          : undefined
                      }
                      onContextChange={
                        item.type === 'task' && taskId && onUpdateTask
                          ? (context) => onUpdateTask(taskId, { context })
                          : item.type === 'routine' && onUpdateRoutine
                          ? (context) => onUpdateRoutine(item.id.replace('routine-', ''), { context })
                          : item.type === 'event' && onUpdateEventContext
                          ? (context) => onUpdateEventContext(item.id.replace('event-', ''), context ?? null)
                          : undefined
                      }
                      getScheduleItemsForDate={getScheduleItemsForDate}
                      panelOpen={panelOpen}
                      onClosePanel={onClosePanel}
                      hasCoaching={coachingItemIds.has(item.id)}
                    />
                    {followUpTaskId === taskId && taskId && sourceTaskForFollowUp && (
                      <FollowUpInput
                        sourceTask={sourceTaskForFollowUp}
                        onSubmit={(title) => handleFollowUpSubmit(title, taskId)}
                        onDismiss={handleFollowUpDismiss}
                        projectName={projectName || undefined}
                      />
                    )}
                    </div>
                  )
                })}
              </TimeGroup>
            )
          })}

          {/* Evening Reflection - shown on today's view, after 7pm, when coaching is visible and there are playbook instances */}
          {isToday && !hideCoaching && (playbookInstances ?? []).length > 0 && new Date().getHours() >= 19 && (
            <EveningReflection
              onSave={(reflection) => {
                if (onSaveReflection) {
                  onSaveReflection(reflection)
                } else {
                  logger.debug('Evening reflection saved (no handler):', reflection)
                }
              }}
              initialHighlight={todayReflection?.highlight ?? ''}
              initialNotes={todayReflection?.notes ?? ''}
            />
          )}

        </div>
      )}

      {/* Completed Inbox Items - collapsible section at bottom */}
      {completedInboxTasks.length > 0 && onUpdateTask && (
        <div className="mt-8 mb-4">
          {/* Header with collapse toggle */}
          <button
            onClick={toggleShowCompletedInbox}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors group"
          >
            <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase flex items-center gap-2">
              <svg
                className={`w-4 h-4 transition-transform ${showCompletedInbox ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Completed Inbox Items ({completedInboxTasks.length})
            </h3>
          </button>

          {/* Collapsible content */}
          {showCompletedInbox && (
            <div className="mt-3 space-y-3 animate-fade-in-up">
              {completedInboxTasks.map((task) => (
                <InboxTaskCard
                  key={task.id}
                  task={task}
                  onUpdate={(updates) => onUpdateTask(task.id, updates)}
                  onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
                  onSelect={() => handleSelectItem(`task-${task.id}`)}
                  onDefer={(target) => {
                    if (onPushTask) {
                      onPushTask(task.id, target)
                    }
                  }}
                  projects={projects}
                  onOpenProject={onOpenProject}
                  familyMembers={familyMembers}
                  onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
                  getScheduleItemsForDate={getScheduleItemsForDate}
                  lists={lists}
                  listsByCategory={listsByCategory}
                  onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
                  onCreateList={onCreateList}
                  panelOpen={panelOpen}
                  onClosePanel={onClosePanel}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flying pill animation for inbox captures */}
      {flyingPill && organizeButtonRef.current && (
        <FlyingPill
          title={flyingPill.title}
          sourceRect={flyingPill.sourceRect}
          targetRef={organizeButtonRef}
        />
      )}
    </div>
  )
}

// Flying pill animation component
function FlyingPill({
  title,
  sourceRect,
  targetRef,
}: {
  title: string
  sourceRect: { top: number; left: number; width: number; height: number }
  targetRef: React.RefObject<HTMLButtonElement | null>
}) {
  const targetRect = targetRef.current?.getBoundingClientRect()
  if (!targetRect) return null

  // Calculate the center points
  const startX = sourceRect.left + sourceRect.width / 2
  const startY = sourceRect.top + sourceRect.height / 2
  const endX = targetRect.left + targetRect.width / 2
  const endY = targetRect.top + targetRect.height / 2

  // CSS custom properties for the animation
  const style = {
    '--start-x': `${startX}px`,
    '--start-y': `${startY}px`,
    '--end-x': `${endX}px`,
    '--end-y': `${endY}px`,
  } as React.CSSProperties

  return (
    <div
      className="fixed z-[100] pointer-events-none animate-fly-to-inbox"
      style={style}
    >
      <div className="px-3 py-1.5 bg-primary-500 text-white text-sm font-medium rounded-full shadow-lg whitespace-nowrap max-w-[200px] truncate">
        {title}
      </div>
    </div>
  )
}
