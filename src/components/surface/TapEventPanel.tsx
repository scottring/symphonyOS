import { useState } from 'react'
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
import { PanelLocation } from './sections/PanelLocation'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SchedulePopover } from '@/components/triage/SchedulePopover'
import { computeEventReschedule } from '@/components/planning/planningReschedule'

interface TapEventPanelProps {
  event: CalendarEvent
  /** User's notes for the event (from event_notes table). */
  notes: string | undefined
  allTasks: Task[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddPrepTask: (title: string) => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
  /** Set/change/clear the event's location, syncing back to Google Calendar. */
  onUpdateEventLocation?: (googleEventId: string, location: string | null, calendarId?: string) => void
  /**
   * Move the event to a new start, keeping its original duration. Pushes back to
   * Google Calendar (this instance only for a recurring series). When omitted,
   * the Reschedule control is hidden.
   */
  onReschedule?: (startTime: Date, endTime: Date) => void
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
  const [showDirections, setShowDirections] = useState(false)

  const relations = useEntityRelations({
    kind: 'event',
    entity: event,
    allTasks,
    allEvents: [],
    allProjects: [],
  })

  const startTime = getStartTime(event)
  const eventId = event.google_event_id ?? event.id
  const calendarId = event.calendar_id ?? event.calendarId

  // SchedulePopover yields the new start as a full Date; reuse the planning
  // reschedule math so the event keeps its original duration.
  const handleReschedule = (date: Date) => {
    const { startTime: newStart, endTime: newEnd } = computeEventReschedule(event, {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    })
    props.onReschedule?.(newStart, newEnd)
  }

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
          <button
            onClick={() => setShowDirections((v) => !v)}
            aria-expanded={showDirections}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            <ConceptIcon name="location" decorative /> Directions {showDirections ? '▾' : '▸'}
          </button>
        )}
        {props.onReschedule && (
          <SchedulePopover
            value={startTime ? new Date(startTime) : undefined}
            onSchedule={handleReschedule}
            itemTitle={event.title}
            trigger={
              <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">
                <ConceptIcon name="when" decorative /> Reschedule
              </button>
            }
          />
        )}
      </div>

      <PanelLocation
        location={event.location ?? undefined}
        title={event.title}
        showDirections={showDirections}
        onUpdateLocation={(addr) => props.onUpdateEventLocation?.(eventId, addr, calendarId)}
        onClearLocation={() => props.onUpdateEventLocation?.(eventId, null, calendarId)}
      />

      <PanelWhy
        key={event.id}
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
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100"><ConceptIcon name="list" decorative /></span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={undefined} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      {/* Events carry no created/updated timestamps; show the start time when present. */}
      {startTime && (
        <PanelFooter
          createdAt={new Date(startTime)}
          updatedAt={new Date(startTime)}
        />
      )}
    </article>
  )
}
