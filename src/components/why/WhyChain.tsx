// src/components/why/WhyChain.tsx
//
// Phase 4 — the why-chain. From a task, show the intention it serves: its project
// and the goal that project advances. Pure + optional — renders nothing when the
// task has no project. Structural ancestry only (native Symphony objects); no
// vault, no prose.

import { FolderOpen, Target } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Goal } from '@/types/goal'

interface WhyChainProps {
  task: Task
  projects: Project[]
  goals: Goal[]
  onOpenProject?: (projectId: string) => void
  onOpenGoal?: (goalId: string) => void
}

/** The goal whose actions reference this project (the project's "why"). */
function goalForProject(goals: Goal[], projectId: string): Goal | undefined {
  return goals.find((g) => g.actions?.some((a) => a.projectId === projectId))
}

export function WhyChain({ task, projects, goals, onOpenProject, onOpenGoal }: WhyChainProps) {
  if (!task.projectId) return null
  const project = projects.find((p) => p.id === task.projectId)
  if (!project) return null
  const goal = goalForProject(goals, project.id)

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-neutral-500" aria-label="Why">
      <button
        type="button"
        onClick={onOpenProject ? () => onOpenProject(project.id) : undefined}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-50 ${
          onOpenProject ? 'hover:bg-neutral-100 transition-colors' : 'cursor-default'
        }`}
      >
        <FolderOpen className="w-3 h-3 text-neutral-400" />
        {project.name}
      </button>

      {goal && (
        <>
          <span className="text-neutral-300">·</span>
          <button
            type="button"
            onClick={onOpenGoal ? () => onOpenGoal(goal.id) : undefined}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-50/60 text-primary-700 ${
              onOpenGoal ? 'hover:bg-primary-100 transition-colors' : 'cursor-default'
            }`}
          >
            <Target className="w-3 h-3" />
            {goal.name}
          </button>
        </>
      )}
    </div>
  )
}
