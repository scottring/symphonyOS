import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface PanelLinkedProps {
  project?: Project
  linkedEvent?: CalendarEvent
  siblingTasks: Task[]
  onOpenProject: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenTask: (id: string) => void
}

function formatEventTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function PanelLinked({ project, linkedEvent, siblingTasks, onOpenProject, onOpenEvent, onOpenTask }: PanelLinkedProps) {
  const hasAny = project || linkedEvent || siblingTasks.length > 0
  if (!hasAny) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Linked</div>
      {project && (
        <button
          onClick={() => onOpenProject(project.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-violet-100">📁</span>
          <span className="text-sm text-neutral-800 flex-1">{project.name}</span>
        </button>
      )}
      {linkedEvent && (
        <button
          onClick={() => onOpenEvent(linkedEvent.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100">📅</span>
          <span className="text-sm text-neutral-800 flex-1">
            <div>{linkedEvent.title}</div>
            <div className="text-xs text-neutral-500">{formatEventTime((linkedEvent as { start_time?: string; startTime?: string }).start_time || (linkedEvent as { start_time?: string; startTime?: string }).startTime)}</div>
          </span>
        </button>
      )}
      {siblingTasks.map(t => (
        <button
          key={t.id}
          onClick={() => onOpenTask(t.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
          <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
        </button>
      ))}
    </section>
  )
}
