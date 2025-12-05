import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'

// Inline SVG icons
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function CloudSunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  )
}

interface ContextSidebarProps {
  tasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenProject?: (projectId: string) => void
}

// Widget: Active Projects Today
function ActiveProjectsWidget({
  projects,
  tasks,
  onOpenProject,
}: {
  projects: Project[]
  tasks: Task[]
  onOpenProject?: (projectId: string) => void
}) {
  const projectsToday = useMemo(() => {
    const projectTaskCounts = new Map<string, number>()

    tasks.forEach((task) => {
      if (task.projectId && !task.completed) {
        const count = projectTaskCounts.get(task.projectId) || 0
        projectTaskCounts.set(task.projectId, count + 1)
      }
    })

    return projects
      .filter((p) => projectTaskCounts.has(p.id) && p.status === 'active')
      .map((p) => ({
        ...p,
        taskCount: projectTaskCounts.get(p.id) || 0,
      }))
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 5)
  }, [projects, tasks])

  if (projectsToday.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        Active Projects
      </h3>
      <div className="space-y-2">
        {projectsToday.map((project) => (
          <button
            key={project.id}
            onClick={() => onOpenProject?.(project.id)}
            className="w-full flex items-start gap-2.5 p-2 -mx-2 rounded-lg hover:bg-neutral-100/80 transition-colors text-left group"
          >
            <FolderIcon className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-700 truncate group-hover:text-neutral-900">
                {project.name}
              </p>
              <p className="text-xs text-neutral-500">
                {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// Widget: Family Today Timeline
function FamilyTodayWidget({
  familyMembers,
  tasks,
}: {
  familyMembers: FamilyMember[]
  tasks: Task[]
}) {
  const familyStats = useMemo(() => {
    return familyMembers.map((member) => {
      const memberTasks = tasks.filter((t) => t.assignedTo === member.id && !t.completed)

      // Calculate time distribution
      const distribution = { morning: 0, afternoon: 0, evening: 0 }
      memberTasks.forEach((task) => {
        if (task.scheduledFor) {
          const hour = new Date(task.scheduledFor).getHours()
          if (hour < 12) distribution.morning++
          else if (hour < 17) distribution.afternoon++
          else distribution.evening++
        } else if (task.isAllDay) {
          // Spread all-day across all periods
          distribution.morning++
        }
      })

      return {
        ...member,
        taskCount: memberTasks.length,
        distribution,
      }
    }).filter((m) => m.taskCount > 0)
  }, [familyMembers, tasks])

  if (familyStats.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        Family Today
      </h3>
      <div className="space-y-3">
        {familyStats.map((member) => {
          const total = member.distribution.morning + member.distribution.afternoon + member.distribution.evening
          const getSegmentWidth = (count: number) => total > 0 ? (count / total) * 100 : 0

          return (
            <div key={member.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">{member.name}</span>
                <span className="text-xs text-neutral-500">{member.taskCount} tasks</span>
              </div>
              {/* Timeline bar */}
              <div className="flex h-2 rounded-full overflow-hidden bg-neutral-100">
                {member.distribution.morning > 0 && (
                  <div
                    className="h-full bg-amber-300"
                    style={{ width: `${getSegmentWidth(member.distribution.morning)}%` }}
                    title={`Morning: ${member.distribution.morning}`}
                  />
                )}
                {member.distribution.afternoon > 0 && (
                  <div
                    className="h-full bg-sky-300"
                    style={{ width: `${getSegmentWidth(member.distribution.afternoon)}%` }}
                    title={`Afternoon: ${member.distribution.afternoon}`}
                  />
                )}
                {member.distribution.evening > 0 && (
                  <div
                    className="h-full bg-indigo-300"
                    style={{ width: `${getSegmentWidth(member.distribution.evening)}%` }}
                    title={`Evening: ${member.distribution.evening}`}
                  />
                )}
              </div>
            </div>
          )
        })}
        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-neutral-400 pt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-300" />
            AM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-300" />
            PM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-300" />
            Eve
          </span>
        </div>
      </div>
    </div>
  )
}

// Widget: Tonight's Dinner (Placeholder - would need meal plan data)
function DinnerWidget() {
  // This is a placeholder - would need meal plan integration
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        Tonight's Dinner
      </h3>
      <div className="flex items-start gap-2.5 text-neutral-400">
        <span className="text-lg">🍽</span>
        <p className="text-sm italic">No meal planned</p>
      </div>
    </div>
  )
}

// Widget: Weather Strip (Placeholder - would need weather API)
function WeatherWidget() {
  // This is a placeholder - would need weather API integration
  return (
    <div className="flex items-center gap-2 py-2 px-3 -mx-3 bg-neutral-50/50 rounded-lg text-neutral-500">
      <CloudSunIcon className="w-4 h-4" />
      <span className="text-sm">Weather not configured</span>
    </div>
  )
}

export function ContextSidebar({
  tasks,
  projects,
  familyMembers,
  collapsed,
  onToggleCollapsed,
  onOpenProject,
}: ContextSidebarProps) {
  // Filter to only scheduled tasks for today
  const todayTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return tasks.filter((task) => {
      if (!task.scheduledFor) return false
      const taskDate = new Date(task.scheduledFor)
      return taskDate >= today && taskDate < tomorrow
    })
  }, [tasks])

  return (
    <div
      className={`
        relative flex flex-col border-l border-neutral-200/60
        transition-all duration-300 ease-out
        ${collapsed ? 'w-0 border-transparent' : 'w-72'}
      `}
    >
      {/* Toggle button - always visible */}
      <button
        onClick={onToggleCollapsed}
        className={`
          absolute -left-3 top-20 z-10
          w-6 h-6 rounded-full
          bg-white border border-neutral-200 shadow-sm
          flex items-center justify-center
          text-neutral-400 hover:text-neutral-600
          transition-colors
        `}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Sidebar content - pt-14 clears the view switcher icons */}
      <div className={`flex-1 px-6 pb-6 pt-14 space-y-6 overflow-y-auto ${collapsed ? 'invisible' : 'visible'}`}>
        <ActiveProjectsWidget
          projects={projects}
          tasks={todayTasks}
          onOpenProject={onOpenProject}
        />

        <FamilyTodayWidget
          familyMembers={familyMembers}
          tasks={todayTasks}
        />

        <DinnerWidget />

        <WeatherWidget />
      </div>
    </div>
  )
}
