// src/components/planning/guided/stepTypes/ProjectsStep.tsx
//
// "Projects in motion" — read-only reference, the look-don't-link gesture
// pointed at the WHAT axis. A season/month is mostly its projects; seeing
// them (with what's still open) while writing this horizon's list is how
// big efforts suggest horizon-sized chunks. Nothing here is moved, linked,
// or required to line up.
import { useMemo } from 'react'
import { FolderOpen, PauseCircle } from 'lucide-react'
import { useGuided } from '../GuidedContext'

export function ProjectsStep() {
  const { host } = useGuided()

  const rows = useMemo(() => {
    const openCount = new Map<string, number>()
    for (const t of host.tasks) {
      if (t.completed || !t.projectId) continue
      openCount.set(t.projectId, (openCount.get(t.projectId) ?? 0) + 1)
    }
    return host.projects
      .filter((p) => p.status === 'in_progress' || p.status === 'not_started'
        || (p.status === 'on_hold' && (openCount.get(p.id) ?? 0) > 0))
      .map((p) => ({ project: p, open: openCount.get(p.id) ?? 0 }))
      .sort((a, b) => b.open - a.open)
  }, [host.projects, host.tasks])

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">No projects in motion right now.</p>
  }
  return (
    <ul className="space-y-1">
      {rows.map(({ project, open }) => (
        <li key={project.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
          {project.status === 'on_hold'
            ? <PauseCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
            : <FolderOpen className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
          <span className="flex-1 min-w-0 truncate">{project.name}</span>
          <span className="text-xs text-neutral-400">
            {project.status === 'on_hold' && 'on hold · '}
            {open === 0 ? 'nothing open' : `${open} open`}
          </span>
        </li>
      ))}
    </ul>
  )
}
