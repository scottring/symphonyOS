import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ConceptIcon } from '@/lib/conceptIcons'
import { PanelSection } from './PanelSection'
import { PanelRow } from './PanelRow'

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
    <PanelSection id="linked" label="Linked" preview={project?.name ?? (linkedEvent?.title || (siblingTasks.length ? `${siblingTasks.length} related` : undefined))}>
      {project && (
        <PanelRow
          onClick={() => onOpenProject(project.id)}
          icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-violet-100"><ConceptIcon name="project" decorative /></span>}
        >
          <span className="block text-sm text-neutral-800">{project.name}</span>
        </PanelRow>
      )}
      {linkedEvent && (
        <PanelRow
          onClick={() => onOpenEvent(linkedEvent.id)}
          icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100"><ConceptIcon name="when" decorative /></span>}
        >
          <span className="block text-sm text-neutral-800">{linkedEvent.title}</span>
          <span className="block text-xs text-neutral-500">{formatEventTime((linkedEvent as { start_time?: string; startTime?: string }).start_time || (linkedEvent as { start_time?: string; startTime?: string }).startTime)}</span>
        </PanelRow>
      )}
      {siblingTasks.map(t => (
        <PanelRow
          key={t.id}
          onClick={() => onOpenTask(t.id)}
          icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100"><ConceptIcon name="list" decorative /></span>}
        >
          <span className="block text-sm text-neutral-800">{t.title}</span>
        </PanelRow>
      ))}
    </PanelSection>
  )
}
