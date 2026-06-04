import { useMemo, useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { MultiAssigneeDropdown } from '@/components/family/MultiAssigneeDropdown'
import { ConceptIcon } from '@/lib/conceptIcons'

export interface ClarityIndicatorProps {
  tasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  projectsWithLinkedEvents?: Set<string>
  onScrollToInbox?: () => void
  onClearAssigneeFilter?: () => void
  onOpenProject?: (projectId: string) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
  /** Optional custom trigger; when omitted, a built-in ring + status label is rendered. */
  trigger?: React.ReactNode
}

export function ClarityIndicator({
  tasks,
  projects,
  familyMembers,
  projectsWithLinkedEvents = new Set(),
  onScrollToInbox,
  onClearAssigneeFilter,
  onOpenProject,
  onAssignTaskAll,
  trigger,
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

  if (tasks.length === 0 && !trigger) return null

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
        {trigger ?? (
          <>
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
          </>
        )}
      </button>

      {/* Expanded explanation popover */}
      {isExpanded && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />
          <div
            data-testid="clarity-popover"
            className={`absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-80 p-4 rounded-xl ${bgColor} border border-neutral-200/60 shadow-lg animate-fade-in-scale`}
          >
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
                  <ConceptIcon name="done" decorative className="text-primary-500" />
                  <span className="flex-1 text-neutral-600">
                    {metrics.itemsWithHome} item{metrics.itemsWithHome !== 1 ? 's' : ''} scheduled
                  </span>
                </div>
              )}

              {/* Fresh inbox items - gentle nudge */}
              {metrics.freshInboxItems > 0 && onScrollToInbox && (
                <button
                  onClick={() => {
                    onClearAssigneeFilter?.()
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
                    onClearAssigneeFilter?.()
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
                    onClearAssigneeFilter?.()
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
                  <ConceptIcon name="ai" decorative />
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
