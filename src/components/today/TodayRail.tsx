import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import { ScratchpadPane } from '@/components/schedule/ScratchpadPane'
import { rankActiveProjects } from '@/lib/projectProgress'
import { AtAGlance } from './AtAGlance'
import { ActiveProjects } from './ActiveProjects'

interface TodayRailProps {
  /** All tasks from entities. Used to count open work and derive project progress. */
  tasks: Task[]
  /** All projects from entities. Used by ACTIVE PROJECTS. */
  projects: Project[]
  /** CTA for AT A GLANCE → opens fuller plan view (week, day detail). */
  onViewFullPlan: () => void
  /** Open a single project's detail view. */
  onSelectProject: (id: string) => void
  /** Navigate to the full projects list. */
  onViewAllProjects: () => void
}

/**
 * Right-rail container for the Today view. Hosts ambient panels (At a Glance,
 * Family Snapshot, Active Projects) above the Scratchpad action surface.
 *
 * Built incrementally: each panel ships independently. Earlier panels accept
 * only the data they need; later panels add their own props.
 */
export function TodayRail({
  tasks,
  projects,
  onViewFullPlan,
  onSelectProject,
  onViewAllProjects,
}: TodayRailProps) {
  const openTaskCount = useMemo(() => {
    // "Still open" = scheduled, not completed, not in inbox.
    // Inbox is a separate signal; conflating it would inflate the count.
    return tasks.filter((t) => !t.completed && t.bucket !== 'inbox').length
  }, [tasks])

  const activeProjects = useMemo(
    () => rankActiveProjects(projects, tasks, 5),
    [projects, tasks],
  )

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <AtAGlance
        openTaskCount={openTaskCount}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={onViewFullPlan}
      />

      <ActiveProjects
        projects={activeProjects}
        onSelectProject={onSelectProject}
        onViewAll={onViewAllProjects}
      />

      <div className="flex-1 min-h-0">
        <ScratchpadPane />
      </div>
    </div>
  )
}
