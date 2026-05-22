import type { RankedProject } from '@/lib/projectProgress'
import { FolderKanban, Pin } from 'lucide-react'

interface ActiveProjectsProps {
  projects: RankedProject[]
  /** Navigate to a project's detail view. */
  onSelectProject: (id: string) => void
  /** Navigate to the full projects list. */
  onViewAll: () => void
  /** Toggle pinned state for a project. */
  onTogglePin: (id: string) => void
}

/**
 * Right-rail "Active projects" panel. Lists up to ~5 projects with a compact
 * name + progress bar + percent. Pinned projects sort to the top and show a
 * filled pin; hovering any row reveals its pin toggle. Click a row to open the
 * project; click View all for the full list.
 */
export function ActiveProjects({ projects, onSelectProject, onViewAll, onTogglePin }: ActiveProjectsProps) {
  const isEmpty = projects.length === 0

  return (
    <section
      aria-labelledby="rail-active-projects"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-active-projects"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Active projects
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <FolderKanban className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>No active projects.</span>
        </p>
      ) : (
        <ul className="space-y-2.5">
          {projects.map((p) => (
            <li key={p.id} className="group flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => onSelectProject(p.id)}
                className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md px-1 -mx-1 py-1"
                aria-label={p.name}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[13px] text-neutral-800 truncate group-hover:text-neutral-900">
                    {p.name}
                  </span>
                  <span className="text-[12px] font-medium tabular-nums text-neutral-500 shrink-0">
                    {p.progress}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    aria-hidden
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin(p.id)
                }}
                className={`
                  mt-0.5 shrink-0 p-1 rounded-md transition-all
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300
                  ${p.pinned
                    ? 'text-primary-600 hover:text-primary-700 hover:bg-primary-50'
                    : 'text-neutral-400 hover:text-primary-600 hover:bg-primary-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  }
                `}
                aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
                aria-pressed={p.pinned}
                title={p.pinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin className={`w-3.5 h-3.5 ${p.pinned ? 'fill-current' : ''}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        View all projects
      </button>
    </section>
  )
}
