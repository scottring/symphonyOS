import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import type { ScheduleContextItem } from '@/components/triage'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
// import { type TimelineItem } from '@/types/timeline' // Hidden with Hero Mode
import { groupByDaySection, getTimeOfDay, type DaySection, type TimeOfDay } from '@/lib/timeUtils'
import { useMobile } from '@/hooks/useMobile'
import { useBulkSelection } from '@/hooks/useBulkSelection'
import { TimeGroup } from './TimeGroup'
import { ScheduleItem } from './ScheduleItem'
import { SwipeableCard } from './SwipeableCard'
import { DateNavigator } from './DateNavigator'
import { InboxSection } from './InboxSection'
import { EmailScanSection } from './EmailScanSection'
import { OverdueSection } from './OverdueSection'
import { BulkActionBar } from './BulkActionBar'
import { BulkRescheduleDialog } from './BulkRescheduleDialog'
import { WeeklyReview } from '@/components/review/WeeklyReview'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { MultiAssigneeDropdown } from '@/components/family/MultiAssigneeDropdown'
import { Pencil, Inbox, Target, List } from 'lucide-react'
// import { Sparkles } from 'lucide-react' // Hidden with Hero Mode
// import { HeroMode } from '@/components/hero' // Hidden for now

// Bento box / grid icon for "Organize"
function BentoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* 2x2 grid with rounded corners - bento box style */}
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

// Check if current time is in "organize hours" (morning 6-9am or evening 6-9pm)
function isOrganizeTime(): boolean {
  const hour = new Date().getHours()
  return (hour >= 6 && hour < 9) || (hour >= 18 && hour < 21)
}

interface OrganizeButtonProps {
  onClick: () => void
  inboxCount: number
  isMobile: boolean
  hasAssigneeFilter: boolean
}

function OrganizeButton({ onClick, inboxCount, isMobile, hasAssigneeFilter }: OrganizeButtonProps) {
  void isMobile // Not used after layout change
  void hasAssigneeFilter // Not used after layout change
  const emphasized = isOrganizeTime() && inboxCount > 0

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        emphasized
          ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
      }`}
    >
      <BentoIcon className={`w-5 h-5 ${emphasized ? 'text-primary-600' : ''}`} />
      <span className="hidden sm:inline">Organize</span>
    </button>
  )
}

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

/* Hero Mode toggle - hidden for now, not ready for primetime
interface HeroModeToggleProps {
  onClick: () => void
  taskCount: number
}

function HeroModeToggle({ onClick, taskCount }: HeroModeToggleProps) {
  const hasTasksToFocus = taskCount > 0

  return (
    <button
      onClick={onClick}
      disabled={!hasTasksToFocus}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        hasTasksToFocus
          ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
          : 'text-neutral-400 bg-neutral-50 cursor-not-allowed'
      }`}
      title={hasTasksToFocus ? 'Enter Hero Mode: Focus on one task at a time' : 'No tasks in current time block'}
    >
      <Sparkles className={`w-4 h-4 ${hasTasksToFocus ? 'text-primary-600' : ''}`} />
      <span className="hidden sm:inline">Hero</span>
      {hasTasksToFocus && (
        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">
          {taskCount}
        </span>
      )}
    </button>
  )
}
*/

// Floating Inbox FAB
interface FloatingInboxFABProps {
  count: number
  onClick: () => void
}

function FloatingInboxFAB({ count, onClick }: FloatingInboxFABProps) {
  const isOrganizeHours = isOrganizeTime()

  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 right-6 z-40 flex flex-col items-center justify-center w-14 h-14 rounded-2xl shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
        isOrganizeHours
          ? 'bg-primary-500 hover:bg-primary-600 text-white animate-pulse-subtle'
          : 'bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200'
      }`}
      title={`${count} items in inbox`}
    >
      <Inbox className="w-5 h-5" />
      <span className={`text-xs font-bold mt-0.5 ${
        isOrganizeHours ? 'text-white' : 'text-neutral-500'
      }`}>
        {count}
      </span>
    </button>
  )
}

// Focus mode toggle button
interface FocusModeToggleProps {
  isFocusMode: boolean
  onToggle: () => void
}

function FocusModeToggle({ isFocusMode, onToggle }: FocusModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isFocusMode
          ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
      }`}
      title={isFocusMode ? 'Show all sections' : 'Focus on current time block'}
    >
      {isFocusMode ? (
        <Target className="w-4 h-4" />
      ) : (
        <List className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{isFocusMode ? 'Focus' : 'All'}</span>
    </button>
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
  tasks: Task[]
  events: CalendarEvent[]
  routines?: Routine[]
  dateInstances?: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, date: Date) => void
  onDeleteTask?: (id: string) => void
  onArchiveTask?: (id: string) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  eventNotesMap?: Map<string, EventNote>
  onRefreshInstances?: () => void
  recentlyCreatedTaskId?: string | null
  onTriageCardCollapse?: () => void
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignEventAll?: (eventId: string, memberIds: string[]) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onAssignRoutineAll?: (routineId: string, memberIds: string[]) => void
  // Routine completion
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onSkipRoutine?: (routineId: string) => void
  onPushRoutine?: (routineId: string, date: Date) => void
  // Event completion/skip
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  // Planning session
  onOpenPlanning?: () => void
  onCreateTask?: (title: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  // Assignee filter
  selectedAssignee?: string | null  // null = "All", "unassigned" = unassigned only
  onSelectAssignee?: (id: string | null) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
  // Parent task navigation (for subtasks shown on timeline)
  onOpenTask?: (taskId: string) => void
  // Bulk operations
  onBulkComplete?: (taskIds: string[]) => void
  onBulkUncomplete?: (taskIds: string[]) => void
  onBulkDelete?: (taskIds: string[]) => void
  onBulkReschedule?: (taskIds: string[], date: Date, isAllDay: boolean) => void
  // Calendar integration - create events from tasks
  onAddToCalendar?: (task: Task) => Promise<void>
  addingToCalendarTaskId?: string | null
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
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onUpdateTask,
  onPushTask,
  onDeleteTask,
  onArchiveTask,
  loading,
  viewedDate,
  onDateChange,
  contactsMap,
  projectsMap,
  projects = [],
  contacts = [],
  onSearchContacts,
  onAddContact,
  eventNotesMap,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
  onOpenProject,
  familyMembers = [],
  onAssignTask,
  onAssignTaskAll,
  onAssignEvent,
  onAssignEventAll,
  onAssignRoutine,
  onAssignRoutineAll,
  onCompleteRoutine,
  onSkipRoutine,
  onPushRoutine,
  onCompleteEvent,
  onSkipEvent,
  onPushEvent,
  onOpenPlanning: _onOpenPlanning,
  onCreateTask: _onCreateTask,
  onAddProject,
  selectedAssignee,
  onSelectAssignee,
  assigneesWithTasks = [],
  hasUnassignedTasks = false,
  onOpenTask,
  onBulkComplete,
  onBulkUncomplete,
  onBulkDelete,
  onBulkReschedule,
  onAddToCalendar,
  addingToCalendarTaskId,
}: TodayScheduleProps) {
  void _onOpenPlanning // Reserved - planning now handled by ModeToggle
  void _onCreateTask // Reserved - was used by ReviewSection
  const isMobile = useMobile()
  const inboxSectionRef = useRef<HTMLDivElement>(null)

  // Bulk selection state
  const bulkSelection = useBulkSelection()

  // Scroll to inbox section
  const scrollToInbox = useCallback(() => {
    inboxSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Create a map for efficient task lookup by ID (for parent task names)
  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of tasks) {
      map.set(task.id, task)
    }
    return map
  }, [tasks])

  // Compute set of project IDs that have linked FUTURE calendar events
  // Past events don't count - the project needs a clear next action
  const projectsWithLinkedEvents = useMemo(() => {
    const projectIds = new Set<string>()
    if (eventNotesMap) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (const note of eventNotesMap.values()) {
        if (note.projectId && note.eventStartTime) {
          // Only count if event is today or in the future
          if (note.eventStartTime >= today) {
            projectIds.add(note.projectId)
          }
        }
      }
    }
    return projectIds
  }, [eventNotesMap])

  // Helper function to check if an item matches the assignee filter
  // Supports both single assignment (assignedTo) and multi-assignment (assignedToAll)
  const matchesAssigneeFilter = useCallback((assignedTo: string | null | undefined, assignedToAll?: string[] | null): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true // "All" or not specified - show everything
    if (selectedAssignee === 'unassigned') return !assignedTo && (!assignedToAll || assignedToAll.length === 0) // Show only unassigned
    // Show items assigned to selected person (either single or multi-assignment)
    return assignedTo === selectedAssignee || (assignedToAll ? assignedToAll.includes(selectedAssignee) : false)
  }, [selectedAssignee])

  // Suppress unused prop warning - onArchiveTask is used by Hero Mode which is hidden for now
  void onArchiveTask

  // Weekly review modal state
  const [showWeeklyReview, setShowWeeklyReview] = useState(false)
  // Bulk reschedule dialog state
  const [showBulkRescheduleDialog, setShowBulkRescheduleDialog] = useState(false)
  // Focus mode state - when true, only shows current time section expanded
  const [isFocusMode, setIsFocusMode] = useState(false)
  // Inbox collapsed state
  const [inboxCollapsed, setInboxCollapsed] = useState(false)

  /* Hero Mode state - hidden for now, not ready for primetime
  const [heroModeOpen, setHeroModeOpen] = useState(false)

  const openHeroMode = useCallback(() => {
    setHeroModeOpen(true)
  }, [])

  const closeHeroMode = useCallback(() => {
    setHeroModeOpen(false)
  }, [])
  */

  // Determine current time section (morning/afternoon/evening)
  const currentTimeSection: TimeOfDay = useMemo(() => {
    return getTimeOfDay(new Date())
  }, [])

  // Exit selection mode when date changes
  const prevViewedDate = useRef(viewedDate)
  useEffect(() => {
    if (prevViewedDate.current.getTime() !== viewedDate.getTime()) {
      prevViewedDate.current = viewedDate
      if (bulkSelection.isSelectionMode) {
        bulkSelection.exitSelectionMode()
      }
    }
  }, [viewedDate, bulkSelection])

  // Get selected tasks for bulk action bar
  const selectedTasks = useMemo(() => {
    if (!bulkSelection.isSelectionMode) return []
    return tasks.filter((t) => bulkSelection.selectedIds.has(t.id))
  }, [tasks, bulkSelection.selectedIds, bulkSelection.isSelectionMode])

  const hasCompletedSelected = selectedTasks.some((t) => t.completed)
  const hasIncompleteSelected = selectedTasks.some((t) => !t.completed)

  // Bulk action handlers
  const handleBulkComplete = useCallback(() => {
    if (onBulkComplete && bulkSelection.selectedIds.size > 0) {
      const incompleteIds = selectedTasks.filter((t) => !t.completed).map((t) => t.id)
      if (incompleteIds.length > 0) {
        onBulkComplete(incompleteIds)
      }
      bulkSelection.exitSelectionMode()
    }
  }, [onBulkComplete, selectedTasks, bulkSelection])

  const handleBulkUncomplete = useCallback(() => {
    if (onBulkUncomplete && bulkSelection.selectedIds.size > 0) {
      const completedIds = selectedTasks.filter((t) => t.completed).map((t) => t.id)
      if (completedIds.length > 0) {
        onBulkUncomplete(completedIds)
      }
      bulkSelection.exitSelectionMode()
    }
  }, [onBulkUncomplete, selectedTasks, bulkSelection])

  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete && bulkSelection.selectedIds.size > 0) {
      onBulkDelete([...bulkSelection.selectedIds])
      bulkSelection.exitSelectionMode()
    }
  }, [onBulkDelete, bulkSelection])

  const handleBulkReschedule = useCallback(() => {
    if (bulkSelection.selectedIds.size > 0) {
      setShowBulkRescheduleDialog(true)
    }
  }, [bulkSelection])

  const handleBulkRescheduleConfirm = useCallback((date: Date, isAllDay: boolean) => {
    if (onBulkReschedule && bulkSelection.selectedIds.size > 0) {
      onBulkReschedule([...bulkSelection.selectedIds], date, isAllDay)
      bulkSelection.exitSelectionMode()
      setShowBulkRescheduleDialog(false)
    }
  }, [onBulkReschedule, bulkSelection])

  const handleBulkRescheduleCancel = useCallback(() => {
    setShowBulkRescheduleDialog(false)
  }, [])

  // Check if we're viewing today
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      viewedDate.getFullYear() === today.getFullYear() &&
      viewedDate.getMonth() === today.getMonth() &&
      viewedDate.getDate() === today.getDate()
    )
  }, [viewedDate])

  // Map sections to whether they should be collapsed based on focus mode
  const getSectionCollapseState = useCallback((section: DaySection): boolean | undefined => {
    if (!isFocusMode) return undefined // No forced collapse - user controls
    // In focus mode, collapse all sections except the current one
    // Map DaySection to TimeOfDay for comparison
    const sectionToTimeOfDay: Record<DaySection, TimeOfDay | null> = {
      'allday': null,
      'morning': 'morning',
      'afternoon': 'afternoon',
      'evening': 'evening',
      'unscheduled': null,
    }
    const sectionTime = sectionToTimeOfDay[section]
    // Collapse if not the current time section (allday and unscheduled always collapse in focus mode)
    return sectionTime !== currentTimeSection
  }, [isFocusMode, currentTimeSection])

  // Overdue tasks: scheduled for past days, not completed - only shown on today's view
  const overdueTasks = useMemo(() => {
    if (!isToday) return []

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter((task) => {
      if (task.completed) return false
      if (!task.scheduledFor) return false
      if (!matchesAssigneeFilter(task.assignedTo, task.assignedToAll)) return false

      // Parse the scheduled date and extract UTC components to avoid timezone issues
      // scheduled_for is stored as midnight UTC, so we need to compare the UTC date
      const taskDateTime = new Date(task.scheduledFor)
      const taskDateLocal = new Date(
        taskDateTime.getUTCFullYear(),
        taskDateTime.getUTCMonth(),
        taskDateTime.getUTCDate()
      )

      return taskDateLocal < today
    })
  }, [tasks, isToday, matchesAssigneeFilter])

  // Inbox tasks: needs triage - only shown on today's view
  // Includes: no scheduledFor, OR deferredUntil <= now
  const inboxTasks = useMemo(() => {
    if (!isToday) return []
    const now = new Date()

    return tasks.filter((task) => {
      if (task.completed) return false
      if (task.isSomeday) return false // Someday items are not in inbox
      if (!matchesAssigneeFilter(task.assignedTo, task.assignedToAll)) return false
      // No scheduled date = inbox item
      if (!task.scheduledFor) {
        // If deferred to a future time, don't show yet
        if (task.deferredUntil) {
          const deferredTime = new Date(task.deferredUntil)
          return deferredTime <= now
        }
        return true
      }
      return false
    })
  }, [tasks, isToday, matchesAssigneeFilter])

  // Filter tasks for the viewed date (only tasks with scheduledFor)
  const filteredTasks = useMemo(() => {
    const viewedYear = viewedDate.getFullYear()
    const viewedMonth = viewedDate.getMonth()
    const viewedDay = viewedDate.getDate()

    return tasks.filter((task) => {
      if (!matchesAssigneeFilter(task.assignedTo, task.assignedToAll)) return false
      if (task.scheduledFor) {
        // Extract UTC date components since scheduled_for is stored as midnight UTC
        const taskDateTime = new Date(task.scheduledFor)
        const taskYear = taskDateTime.getUTCFullYear()
        const taskMonth = taskDateTime.getUTCMonth()
        const taskDay = taskDateTime.getUTCDate()
        return taskYear === viewedYear && taskMonth === viewedMonth && taskDay === viewedDay
      }
      return false // Unscheduled tasks go to inbox, not here
    })
  }, [tasks, viewedDate, matchesAssigneeFilter])

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
  // When multiple instances exist for the same routine (e.g., today's + deferred from yesterday),
  // prioritize the one that matches today's date
  const routineStatusMap = useMemo(() => {
    const viewedDateStr = `${viewedDate.getFullYear()}-${String(viewedDate.getMonth() + 1).padStart(2, '0')}-${String(viewedDate.getDate()).padStart(2, '0')}`
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        const existing = map.get(instance.entity_id)
        // Prefer instance matching today's date over instances from other dates
        if (!existing || instance.date === viewedDateStr) {
          map.set(instance.entity_id, instance)
        }
      }
    }
    return map
  }, [dateInstances, viewedDate])

  // Filter to only routines that should show on timeline (default true for backwards compat)
  const visibleRoutines = useMemo(() =>
    routines.filter(r => r.show_on_timeline !== false),
    [routines]
  )

  // Build instance status map for events
  // When multiple instances exist, prioritize the one matching today's date
  const eventStatusMap = useMemo(() => {
    const viewedDateStr = `${viewedDate.getFullYear()}-${String(viewedDate.getMonth() + 1).padStart(2, '0')}-${String(viewedDate.getDate()).padStart(2, '0')}`
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        const existing = map.get(instance.entity_id)
        if (!existing || instance.date === viewedDateStr) {
          map.set(instance.entity_id, instance)
        }
      }
    }
    return map
  }, [dateInstances, viewedDate])

  const grouped = useMemo(() => {
    const taskItems = filteredTasks.map(taskToTimelineItem)

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
        // Attach assignedToAll for filtering
        return { item, assignedToAll: eventNote?.assignedToAll }
      })
      .filter(({ item, assignedToAll }) => matchesAssigneeFilter(item.assignedTo, assignedToAll))
      .map(({ item }) => item)

    // Map and filter routines by assignee
    const routineItems = visibleRoutines
      .filter((routine) => matchesAssigneeFilter(routine.assigned_to, routine.assigned_to_all))
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

    const allItems = [...taskItems, ...eventItems, ...routineItems]
    return groupByDaySection(allItems)
  }, [filteredTasks, filteredEvents, visibleRoutines, viewedDate, routineStatusMap, eventStatusMap, eventNotesMap, matchesAssigneeFilter])

  const sections: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

  /* Hero Mode tasks and handlers - hidden for now, not ready for primetime
  const heroModeTasks = useMemo(() => {
    if (!isToday) return []
    const currentSectionItems = grouped[currentTimeSection] || []
    return currentSectionItems.filter((item: TimelineItem) => {
      if (item.completed) return false
      if (item.type === 'event') return false
      return true
    })
  }, [isToday, grouped, currentTimeSection])

  // Hero Mode handlers - hidden for now, not ready for primetime
  const handleHeroComplete = useCallback((taskId: string) => {
    const item = heroModeTasks.find((t: TimelineItem) => t.id === `task-${taskId}` || t.id === `routine-${taskId}`)
    if (item?.type === 'routine' && onCompleteRoutine) {
      onCompleteRoutine(taskId, true)
    } else if (onToggleTask) {
      onToggleTask(taskId)
    }
  }, [heroModeTasks, onToggleTask, onCompleteRoutine])

  const handleHeroDefer = useCallback((taskId: string, date: Date) => {
    const item = heroModeTasks.find((t: TimelineItem) => t.id === `task-${taskId}` || t.id === `routine-${taskId}`)
    if (item?.type === 'routine' && onPushRoutine) {
      onPushRoutine(taskId, date)
    } else if (onPushTask) {
      onPushTask(taskId, date)
    }
  }, [heroModeTasks, onPushTask, onPushRoutine])

  const handleHeroArchive = useCallback((taskId: string) => {
    if (onArchiveTask) {
      onArchiveTask(taskId)
    }
  }, [onArchiveTask])

  const handleHeroDelete = useCallback((taskId: string) => {
    if (onDeleteTask) {
      onDeleteTask(taskId)
    }
  }, [onDeleteTask])

  const handleHeroOpenDetail = useCallback((item: TimelineItem) => {
    onSelectItem?.(item.id)
  }, [onSelectItem])
  */

  const formatDate = () => {
    return viewedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  // Calculate completion stats (only scheduled tasks, not inbox)
  const completedTasks = filteredTasks.filter((t) => t.completed).length
  const completedRoutines = visibleRoutines.filter((r) => routineStatusMap.get(r.id)?.status === 'completed').length
  const completedCount = completedTasks + completedRoutines
  const actionableCount = filteredTasks.length + visibleRoutines.length + overdueTasks.length
  const totalItems = filteredTasks.length + filteredEvents.length + visibleRoutines.length + inboxTasks.length + overdueTasks.length
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
    <div className="relative min-h-full">
      {/* Hero Mode - hidden for now, not ready for primetime
      <HeroMode
        isOpen={heroModeOpen}
        tasks={heroModeTasks}
        projects={projects}
        contacts={contacts}
        onClose={closeHeroMode}
        onComplete={handleHeroComplete}
        onDefer={handleHeroDefer}
        onArchive={handleHeroArchive}
        onDelete={handleHeroDelete}
        onOpenDetail={handleHeroOpenDetail}
      />
      */}

      {/* Normal schedule content */}
      <div className="px-3 py-4 md:px-10 md:py-10 md:max-w-[680px] md:mx-auto overflow-x-hidden">
      {/* Header - Editorial style with large date */}
      <header className="mb-6 md:mb-10 animate-fade-in-up">
        {/* Large editorial date display with inline navigation */}
        <div className="flex flex-wrap items-end gap-2 md:gap-3 mb-4 md:mb-6">
          <h1 className="font-display text-3xl md:text-5xl text-neutral-900 tracking-tight leading-tight min-w-0">
            {isToday ? (
              <>
                <span className="text-neutral-400 font-normal text-xl md:text-3xl block mb-0.5 md:mb-1">Today is</span>
                {viewedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              </>
            ) : (
              formatDate()
            )}
          </h1>
          {/* Date navigation arrows inline with the day name */}
          <DateNavigator date={viewedDate} onDateChange={onDateChange} showTodayButton={!isToday} />

          {/* Edit button for bulk selection mode (desktop only) */}
          {!isMobile && onBulkDelete && (
            <button
              onClick={() => {
                if (bulkSelection.isSelectionMode) {
                  bulkSelection.exitSelectionMode()
                } else {
                  bulkSelection.enterSelectionMode()
                }
              }}
              className={`
                ml-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
                ${bulkSelection.isSelectionMode
                  ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                  : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                }
              `}
            >
              <span className="flex items-center gap-1.5">
                <Pencil className="w-4 h-4" />
                {bulkSelection.isSelectionMode ? 'Done' : 'Edit'}
              </span>
            </button>
          )}
        </div>

        {/* Stats row: Focus, Organize, Progress (centered), Clarity */}
        <div className="flex items-center gap-4 pt-5 border-t border-neutral-200/60">
          {/* Focus mode toggle - left side */}
          {isToday && (
            <FocusModeToggle
              isFocusMode={isFocusMode}
              onToggle={() => {
                setIsFocusMode(!isFocusMode)
                // When entering focus mode, also collapse inbox
                if (!isFocusMode) {
                  setInboxCollapsed(true)
                }
              }}
            />
          )}

          {/* Organize button */}
          {isToday && (
            <OrganizeButton
              onClick={() => setShowWeeklyReview(true)}
              inboxCount={inboxTasks.length}
              isMobile={isMobile}
              hasAssigneeFilter={false}
            />
          )}

          {/* Hero Mode toggle - hidden for now, not ready for primetime
          {isToday && (
            <HeroModeToggle
              onClick={openHeroMode}
              taskCount={heroModeTasks.length}
            />
          )}
          */}

          {/* Progress - centered with flex-1 */}
          {actionableCount > 0 && (
            <ProgressIndicator
              completed={completedCount}
              total={actionableCount}
              percent={progressPercent}
            />
          )}

          {/* Assignee filter */}
          {isMobile && onSelectAssignee && (assigneesWithTasks.length > 0 || hasUnassignedTasks) && (
            <AssigneeFilter
              selectedAssignees={selectedAssignee ? [selectedAssignee] : []}
              onSelectAssignees={(ids) => onSelectAssignee(ids.length > 0 ? ids[0] : null)}
              assigneesWithTasks={assigneesWithTasks}
              hasUnassignedTasks={hasUnassignedTasks}
            />
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
      </header>

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
        <div className="pb-32">
          {/* Inbox Section - at top, collapsible, only on today's view */}
          {isToday && onUpdateTask && onPushTask && (
            <div ref={inboxSectionRef}>
              <InboxSection
                tasks={inboxTasks}
                onUpdateTask={onUpdateTask}
                onPushTask={onPushTask}
                onSelectTask={(taskId) => onSelectItem(`task-${taskId}`)}
                onDeleteTask={onDeleteTask}
                projects={projects}
                contacts={contacts}
                onSearchContacts={onSearchContacts}
                onAddContact={onAddContact}
                onAddProject={onAddProject}
                recentlyCreatedTaskId={recentlyCreatedTaskId}
                onTriageCardCollapse={onTriageCardCollapse}
                onOpenProject={onOpenProject}
                familyMembers={familyMembers}
                onAssignTask={onAssignTask}
                getScheduleItemsForDate={getScheduleItemsForDate}
                selectionMode={bulkSelection.isSelectionMode}
                selectedIds={bulkSelection.selectedIds}
                onEnterSelectionMode={bulkSelection.enterSelectionMode}
                onToggleSelect={bulkSelection.toggleSelection}
                onAddToCalendar={onAddToCalendar}
                addingToCalendarTaskId={addingToCalendarTaskId}
                collapsed={isFocusMode ? true : inboxCollapsed}
                onCollapsedChange={setInboxCollapsed}
              />
            </div>
          )}

          {/* Overdue section - after inbox, only on today's view */}
          {isToday && overdueTasks.length > 0 && (
            <OverdueSection
              tasks={overdueTasks}
              selectedItemId={selectedItemId}
              onSelectTask={onSelectItem}
              onToggleTask={onToggleTask}
              onPushTask={onPushTask}
              contactsMap={contactsMap}
              projectsMap={projectsMap}
              familyMembers={familyMembers}
              onAssignTask={onAssignTask}
              selectionMode={bulkSelection.isSelectionMode}
              selectedIds={bulkSelection.selectedIds}
              onEnterSelectionMode={bulkSelection.enterSelectionMode}
              onToggleSelect={bulkSelection.toggleSelection}
            />
          )}

          {sections.map((section) => {
            const items = grouped[section]
            const isCurrent = isToday && section === currentTimeSection
            return (
              <TimeGroup
                key={section}
                section={section}
                isEmpty={items.length === 0}
                itemCount={items.length}
                isCurrentSection={isCurrent}
                forceCollapsed={getSectionCollapseState(section)}
              >
                {items.map((item) => {
                  const contactName = item.contactId && contactsMap?.get(item.contactId)?.name
                  const projectName = item.projectId && projectsMap?.get(item.projectId)?.name
                  const parentTaskId = item.parentTaskId
                  const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                  const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null

                  // Use SwipeableCard on mobile for better touch interactions
                  if (isMobile) {
                    return (
                      <SwipeableCard
                        key={item.id}
                        item={item}
                        selected={selectedItemId === item.id}
                        onSelect={() => {}} // Disabled - no action on tap
                        onComplete={() => {
                          if (item.type === 'task' && taskId) {
                            onToggleTask(taskId)
                          } else if (item.type === 'routine' && onCompleteRoutine) {
                            const routineId = item.id.replace('routine-', '')
                            onCompleteRoutine(routineId, !item.completed)
                          } else if (item.type === 'event' && onCompleteEvent) {
                            const eventId = item.id.replace('event-', '')
                            onCompleteEvent(eventId, !item.completed)
                          }
                        }}
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
                        onOpenDetail={() => onSelectItem(item.id)}
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
                        selectionMode={bulkSelection.isSelectionMode}
                        multiSelected={item.type === 'task' && taskId ? bulkSelection.isSelected(taskId) : false}
                        onLongPress={item.type === 'task' && taskId ? () => bulkSelection.enterSelectionMode(taskId) : undefined}
                        onToggleSelect={item.type === 'task' && taskId ? () => bulkSelection.toggleSelection(taskId) : undefined}
                      />
                    )
                  }

                  return (
                    <ScheduleItem
                      key={item.id}
                      item={item}
                      selected={selectedItemId === item.id}
                      onSelect={() => onSelectItem(item.id)}
                      onToggleComplete={() => {
                        if (item.type === 'task' && taskId) {
                          onToggleTask(taskId)
                        } else if (item.type === 'routine' && onCompleteRoutine) {
                          const routineId = item.id.replace('routine-', '')
                          onCompleteRoutine(routineId, !item.completed)
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
                        ? (date: Date, isAllDay: boolean) => onUpdateTask(taskId, { scheduledFor: date, isAllDay })
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
                      getScheduleItemsForDate={getScheduleItemsForDate}
                      selectionMode={bulkSelection.isSelectionMode}
                      multiSelected={item.type === 'task' && taskId ? bulkSelection.isSelected(taskId) : false}
                      onLongPress={item.type === 'task' && taskId ? () => bulkSelection.enterSelectionMode(taskId) : undefined}
                      onToggleSelect={item.type === 'task' && taskId ? () => bulkSelection.toggleSelection(taskId) : undefined}
                    />
                  )
                })}
              </TimeGroup>
            )
          })}

          {/* Email Scanner - only on today's view */}
          {isToday && <EmailScanSection forceCollapsed={isFocusMode} />}
        </div>
      )}

      {/* Weekly Review Modal */}
      {showWeeklyReview && onUpdateTask && onPushTask && onDeleteTask && (
        <WeeklyReview
          tasks={inboxTasks}
          projects={projects}
          contacts={contacts}
          calendarEvents={events}
          allTasks={tasks}
          onSearchContacts={onSearchContacts ?? (() => [])}
          onAddContact={onAddContact}
          onUpdateTask={onUpdateTask}
          onPushTask={onPushTask}
          onDeleteTask={onDeleteTask}
          onClose={() => setShowWeeklyReview(false)}
        />
      )}

      {/* Bulk action bar - shown when items are selected */}
      {bulkSelection.isSelectionMode && bulkSelection.selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={bulkSelection.selectedIds.size}
          onComplete={handleBulkComplete}
          onUncomplete={handleBulkUncomplete}
          onDelete={handleBulkDelete}
          onReschedule={handleBulkReschedule}
          onCancel={bulkSelection.exitSelectionMode}
          hasCompletedTasks={hasCompletedSelected}
          hasIncompleteTasks={hasIncompleteSelected}
        />
      )}

      {/* Bulk reschedule dialog */}
      <BulkRescheduleDialog
        isOpen={showBulkRescheduleDialog}
        selectedCount={bulkSelection.selectedIds.size}
        onConfirm={handleBulkRescheduleConfirm}
        onCancel={handleBulkRescheduleCancel}
      />

      {/* Floating Inbox FAB - quick access to inbox */}
      {isToday && (
        <FloatingInboxFAB
          count={inboxTasks.length}
          onClick={scrollToInbox}
        />
      )}
      </div>
    </div>
  )
}
