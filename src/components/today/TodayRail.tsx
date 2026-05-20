import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { ScratchpadPane } from '@/components/schedule/ScratchpadPane'
import { rankActiveProjects } from '@/lib/projectProgress'
import { familySnapshot } from '@/lib/familySnapshot'
import { discussionItems } from '@/lib/discussionItems'
import { AtAGlance } from './AtAGlance'
import { ActiveProjects } from './ActiveProjects'
import { FamilySnapshot } from './FamilySnapshot'
import { ForDiscussion } from './ForDiscussion'

interface TodayRailProps {
  /** All tasks from entities. Used to count open work and derive project progress. */
  tasks: Task[]
  /** All projects from entities. Used by ACTIVE PROJECTS. */
  projects: Project[]
  /** Core + guest family members. Guests are filtered out for the snapshot panel. */
  familyMembers: FamilyMember[]
  /** Open a single project's detail view. */
  onSelectProject: (id: string) => void
  /** Navigate to the full projects list. */
  onViewAllProjects: () => void
  /** Open a single family member's view. */
  onSelectMember: (id: string) => void
  /** Open the full family view. */
  onViewAllFamily: () => void
  /** Open a task's detail view (from For Discussion). */
  onSelectTask: (id: string) => void
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
  familyMembers,
  onSelectProject,
  onViewAllProjects,
  onSelectMember,
  onViewAllFamily,
  onSelectTask,
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

  const familyMembersSummary = useMemo(
    () => familySnapshot(familyMembers, tasks),
    [familyMembers, tasks],
  )

  const flaggedItems = useMemo(() => discussionItems(tasks, 5), [tasks])

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <AtAGlance openTaskCount={openTaskCount} />

      <ForDiscussion items={flaggedItems} onSelectItem={onSelectTask} />

      <FamilySnapshot
        members={familyMembersSummary}
        onSelectMember={onSelectMember}
        onViewAll={onViewAllFamily}
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
