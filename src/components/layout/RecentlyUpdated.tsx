// Sidebar "Recent" — the three most-recently-touched projects/lists/routines,
// as re-entry points ("where was I?"). Lives in the sidebar so it never costs
// the Today timeline any vertical space.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Repeat, ListChecks } from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useListsContext } from '@/contexts/ListsContext'

interface RecentEntry {
  key: string
  kind: 'project' | 'routine' | 'list'
  name: string
  updatedAt: Date
  href: string
}

function relativeTime(d: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yday'
  return `${days}d`
}

const KIND_ICON = { project: FolderKanban, routine: Repeat, list: ListChecks } as const

export function RecentlyUpdated() {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { routines } = useRoutines()
  const { lists } = useListsContext()

  const recent = useMemo<RecentEntry[]>(() => {
    const entries: RecentEntry[] = []
    for (const p of projects) {
      if (p.status === 'completed') continue
      entries.push({ key: `p-${p.id}`, kind: 'project', name: p.name, updatedAt: new Date(p.updatedAt), href: `/projects/${p.id}` })
    }
    for (const r of routines) {
      if (r.visibility !== 'active') continue
      entries.push({ key: `r-${r.id}`, kind: 'routine', name: r.name, updatedAt: new Date(r.updated_at), href: '/routines' })
    }
    for (const l of lists) {
      entries.push({ key: `l-${l.id}`, kind: 'list', name: l.title, updatedAt: new Date(l.updatedAt), href: '/lists' })
    }
    return entries
      .filter((e) => !Number.isNaN(e.updatedAt.getTime()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 3)
  }, [projects, routines, lists])

  if (recent.length === 0) return null
  const now = new Date()

  return (
    <div className="mt-2 pt-2 border-t border-neutral-200/60">
      <div className="px-3.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
        Recent
      </div>
      {recent.map((e) => {
        const Icon = KIND_ICON[e.kind]
        return (
          <button
            key={e.key}
            onClick={() => navigate(e.href)}
            title={e.name}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-[13px] text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700 transition-colors"
          >
            <Icon className="w-4 h-4 shrink-0 text-neutral-400" />
            <span className="flex-1 min-w-0 truncate text-left">{e.name}</span>
            <span className="shrink-0 text-[11px] text-neutral-300 tabular-nums">
              {relativeTime(e.updatedAt, now)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
