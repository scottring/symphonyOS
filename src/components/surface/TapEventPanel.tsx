import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'

interface TapEventPanelProps {
  event: CalendarEvent
  /** User's notes for the event (from event_notes table). */
  notes: string | undefined
  allTasks: Task[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddPrepTask: (title: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

type AnyEvent = { start_time?: string; startTime?: string }

function getStartTime(event: CalendarEvent): string | undefined {
  return (event as AnyEvent).start_time || (event as AnyEvent).startTime
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TapEventPanel(props: TapEventPanelProps) {
  const { event, allTasks } = props

  const relations = useEntityRelations({
    kind: 'event',
    entity: event,
    allTasks,
    allEvents: [],
    allProjects: [],
  })

  const startTime = getStartTime(event)

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={event.title}
        onTitleChange={() => { /* event title is read-only from gcal */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={formatTime(startTime)}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        {event.location && (
          <a
            href={`https://maps.apple.com/?q=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            📍 Directions
          </a>
        )}
        <button
          onClick={props.onMore}
          aria-label="More actions"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          ···
        </button>
      </div>

      <PanelWhy
        notes={props.notes}
        onChange={props.onNotesChange}
        label="What to bring"
      />

      {relations.tasks.length > 0 && (
        <section className="mb-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
            Prep tasks
          </div>
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={undefined} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={new Date(startTime ?? Date.now())}
        updatedAt={new Date(startTime ?? Date.now())}
      />
    </article>
  )
}
