// src/components/planning/guided/stepTypes/ProjectsStep.tsx
//
// "Projects in motion" — read-only reference, the look-don't-link gesture
// pointed at the WHAT axis. A season/month is mostly its projects; seeing
// them (with what's still open) while writing this horizon's list is how
// big efforts suggest horizon-sized chunks. Nothing here is moved, linked,
// or required to line up. The open COUNT expands to the actual open items so
// "3 open" is inspectable, not a dead-end number (walkthrough #7).
import { useMemo, useState } from 'react'
import { FolderOpen, PauseCircle, ChevronRight } from 'lucide-react'
import { useGuided } from '../GuidedContext'

export function ProjectsStep() {
  const { host } = useGuided()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const openItems = new Map<string, { id: string; title: string }[]>()
    for (const t of host.tasks) {
      if (t.completed || !t.projectId) continue
      const arr = openItems.get(t.projectId) ?? []
      arr.push({ id: t.id, title: t.title })
      openItems.set(t.projectId, arr)
    }
    return host.projects
      .filter((p) => p.status === 'in_progress' || p.status === 'not_started'
        || (p.status === 'on_hold' && (openItems.get(p.id)?.length ?? 0) > 0))
      .map((p) => ({ project: p, items: openItems.get(p.id) ?? [] }))
      .sort((a, b) => b.items.length - a.items.length)
  }, [host.projects, host.tasks])

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">No projects in motion right now.</p>
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  return (
    <ul className="space-y-1">
      {rows.map(({ project, items }) => {
        const open = items.length
        const isOpen = expanded.has(project.id)
        const canExpand = open > 0
        return (
          <li key={project.id} className="rounded-lg bg-neutral-50/70">
            <button
              type="button"
              disabled={!canExpand}
              onClick={() => toggle(project.id)}
              aria-expanded={canExpand ? isOpen : undefined}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 text-left disabled:cursor-default"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${canExpand ? 'text-neutral-300' : 'text-transparent'} ${isOpen ? 'rotate-90' : ''}`}
              />
              {project.status === 'on_hold'
                ? <PauseCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                : <FolderOpen className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
              <span className="flex-1 min-w-0 truncate">{project.name}</span>
              <span className="text-xs text-neutral-400 shrink-0">
                {project.status === 'on_hold' && 'on hold · '}
                {open === 0 ? 'nothing open' : `${open} open`}
              </span>
            </button>
            {isOpen && open > 0 && (
              <ul className="pb-2 pl-9 pr-3 space-y-0.5">
                {items.map((it) => (
                  <li key={it.id} className="text-xs text-neutral-500 leading-snug">· {it.title}</li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
