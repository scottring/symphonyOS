/**
 * UpNextHero — the Today view's answer to "what do I do right now?".
 *
 * Shows the single next commitment (earliest incomplete timed item, with a
 * 2h grace window after it starts — see lib/today/upNext.ts) as a prominent
 * card at the top of the timeline, so the first actionable thing of the day
 * is the first thing on the page instead of living below four sections of
 * preamble. The hero item is lifted out of its day section; completing or
 * passing it promotes the next one.
 */
import { Check, ArrowUpRight } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'
import { formatUpNextStatus, type UpNextSelection } from '@/lib/today/upNext'

interface UpNextHeroProps {
  selection: UpNextSelection
  onSelectItem: (id: string) => void
  /** Toggle-complete for tasks; the hero's primary action. */
  onToggleTask?: (taskId: string) => void
  projectsMap?: Map<string, Project>
}

function formatHeroTime(date: Date): { time: string; meridiem: string } {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const [t, m] = time.split(' ')
  return { time: t, meridiem: m ?? '' }
}

export function UpNextHero({ selection, onSelectItem, onToggleTask, projectsMap }: UpNextHeroProps) {
  const { item } = selection
  const { time, meridiem } = formatHeroTime(item.startTime!)
  const projectName = item.projectId ? projectsMap?.get(item.projectId)?.name : undefined
  const taskId = item.type === 'task' && item.id.startsWith('task-') ? item.id.replace('task-', '') : null
  const estimatedMin = item.originalTask?.estimatedDuration

  return (
    <section
      aria-label="Up next"
      data-testid="up-next-hero"
      className="mb-4 rounded-2xl border border-primary-100 border-l-4 border-l-amber-400 bg-primary-50/50 px-4 py-3.5 cursor-pointer"
      onClick={() => onSelectItem(item.id)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider font-bold text-amber-600">
          Up next
        </span>
        <span className="text-[12px] text-neutral-500">· {formatUpNextStatus(selection)}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="shrink-0 flex items-baseline gap-1">
          <span className="font-display text-3xl md:text-4xl leading-none text-neutral-900 tabular-nums">
            {time}
          </span>
          {meridiem && (
            <span className="text-[12px] font-medium text-neutral-500 uppercase">{meridiem}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[17px] md:text-lg font-semibold text-neutral-900 truncate">
            {item.title}
          </p>
          {(projectName || estimatedMin) && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {projectName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 truncate max-w-[16rem]">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                  <span className="truncate">{projectName}</span>
                </span>
              )}
              {estimatedMin ? (
                <span className="text-[11px] text-neutral-500">~{estimatedMin} min</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {taskId && onToggleTask ? (
            <button
              type="button"
              onClick={() => onToggleTask(taskId)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-[14px] font-medium text-white hover:bg-primary-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectItem(item.id)}
              aria-label="Open"
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3.5 py-2 text-[14px] font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              Open
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
